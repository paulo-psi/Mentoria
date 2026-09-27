import assert from "node:assert/strict";
import { access, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { runRosterTests } from "./run.mjs";

const sourceUrl = "postgres://roster_test:local-only@127.0.0.1:5432/source_db";

function createHarness(mode) {
  const state = {
    clientCreations: 0,
    adminConnectAttempts: 0,
    fixtureConnectAttempts: 0,
    createdDatabases: [],
    droppedDatabases: [],
    dropDatabaseAttempts: 0,
    terminateConnectionAttempts: 0,
    fixtureQueries: [],
    fixtureEnded: false,
    adminEnded: false,
    runTestProcess: false,
    tempDirectories: [],
    tempDirectoryRemovalAttempts: 0,
    sourceDatabase: mode === "test-database-source" ? "roster_test_existing" : "source_db",
  };

  class FakeClient {
    constructor({ connectionString }) {
      state.clientCreations += 1;
      this.database = new URL(connectionString).pathname.slice(1);
      this.isAdmin = state.clientCreations === 1;
    }

    async connect() {
      if (this.isAdmin) {
        state.adminConnectAttempts += 1;
        if (mode === "admin-connect") {
          throw new Error("simulated administrative connection failure");
        }
        return;
      }
      state.fixtureConnectAttempts += 1;
      if (mode === "fixture-connect") {
        throw new Error("simulated fixture connection failure");
      }
    }

    async query(sql) {
      if (this.isAdmin) {
        if (sql.startsWith("select current_database(), rolcreatedb")) {
          if (mode === "security-query-error") {
            throw new Error("simulated security metadata query failure");
          }
          if (mode === "missing-security-row") return { rows: [] };
          return {
            rows: [{
              current_database: state.sourceDatabase,
              rolcreatedb: mode !== "missing-createdb",
            }],
          };
        }
        const create = sql.match(/^CREATE DATABASE "([^"]+)"$/);
        if (create) {
          state.createdDatabases.push(create[1]);
          return { rows: [] };
        }
        if (sql.startsWith("SELECT pg_terminate_backend")) {
          state.terminateConnectionAttempts += 1;
          if (mode === "terminate-connections") {
            throw new Error("simulated connection termination failure");
          }
          return { rows: [] };
        }
        const drop = sql.match(/^DROP DATABASE "([^"]+)"$/);
        if (drop) {
          state.dropDatabaseAttempts += 1;
          if (mode === "drop-database") {
            throw new Error("simulated database drop failure");
          }
          state.droppedDatabases.push(drop[1]);
          return { rows: [] };
        }
        return { rows: [] };
      }

      if (sql === "select current_database() as name") {
        return {
          rows: [{
            name: mode === "wrong-database" ? "unrelated_database" : this.database,
          }],
        };
      }
      state.fixtureQueries.push(sql);
      if (mode === "apply-sql") throw new Error("simulated fixture SQL failure");
      return { rows: [] };
    }

    async end() {
      if (this.isAdmin) state.adminEnded = true;
      else state.fixtureEnded = true;
      if (this.isAdmin && mode === "admin-end") {
        throw new Error("simulated administrative connection close failure");
      }
    }
  }

  const fs = {
    mkdtemp: async (prefix) => {
      const tempDir = await mkdtemp(prefix);
      state.tempDirectories.push(tempDir);
      return tempDir;
    },
    readFile: async () => "CREATE TABLE disposable_fixture (id integer);",
    readdir: async () => ["0000_initial.sql"],
    rm: async (...args) => {
      state.tempDirectoryRemovalAttempts += 1;
      return rm(...args);
    },
    writeFile,
  };

  const spawn = (_command, args) => {
    if (args.includes("generate")) {
      return { status: mode === "generate-schema" ? 3 : 0 };
    }
    state.runTestProcess = true;
    return { status: mode === "run-tests" ? 7 : 0 };
  };

  return { state, FakeClient, fs, spawn };
}

async function assertResourcesRemoved(state) {
  assert.equal(state.createdDatabases.length, 1, "a fresh disposable database was created");
  assert.deepEqual(state.droppedDatabases, state.createdDatabases, "the generated database was dropped");
  assert.equal(state.adminEnded, true, "the administrative connection was closed");
  assert.equal(state.tempDirectories.length, 1, "the runner created one isolated temporary directory");
  await assert.rejects(access(state.tempDirectories[0]), { code: "ENOENT" });
}

async function runWith(harness, envOverrides = {}) {
  return runRosterTests({
    env: { DATABASE_URL: sourceUrl, NODE_ENV: "development", ...envOverrides },
    Client: harness.FakeClient,
    spawn: harness.spawn,
    bundle: async () => {},
    fs: harness.fs,
    tempDirectory: tmpdir(),
  });
}

function assertNoDatabaseOrFixturesWereCreated(state) {
  assert.deepEqual(state.createdDatabases, [], "an unsafe source must not create a test database");
  assert.deepEqual(state.fixtureQueries, [], "an unsafe source must not apply fixture SQL");
  assert.equal(state.runTestProcess, false, "the roster test process must not run");
}

async function assertEarlySafetyGate(harness) {
  assertNoDatabaseOrFixturesWereCreated(harness.state);
  assert.equal(harness.state.clientCreations, 0, "the gate must run before creating a database client");
  assert.equal(harness.state.tempDirectories.length, 0, "the gate must run before creating temporary files");
}

async function assertSecurityCheckCleanup(harness) {
  assertNoDatabaseOrFixturesWereCreated(harness.state);
  assert.equal(harness.state.clientCreations, 1, "only the administrative source connection is opened");
  assert.equal(harness.state.adminEnded, true, "the administrative connection is closed");
  assert.equal(harness.state.tempDirectories.length, 1, "the runner created one isolated temporary directory");
  await assert.rejects(access(harness.state.tempDirectories[0]), { code: "ENOENT" });
}

test("schema generation failure removes the generated database and temporary files", async () => {
  const harness = createHarness("generate-schema");

  await assert.rejects(runWith(harness), /Failed to generate the application schema/);

  assert.equal(harness.state.fixtureQueries.length, 0);
  assert.equal(harness.state.runTestProcess, false);
  await assertResourcesRemoved(harness.state);
});

test("administrative connection failure closes the client and removes temporary files", async () => {
  const harness = createHarness("admin-connect");

  await assert.rejects(runWith(harness), /simulated administrative connection failure/);

  assertNoDatabaseOrFixturesWereCreated(harness.state);
  assert.equal(harness.state.clientCreations, 1, "only the fake administrative client is created");
  assert.equal(harness.state.adminConnectAttempts, 1, "the administrative connection was attempted");
  assert.equal(harness.state.adminEnded, true, "the administrative client is closed after connect fails");
  assert.equal(harness.state.tempDirectories.length, 1, "the runner created one temporary directory");
  assert.equal(harness.state.tempDirectoryRemovalAttempts, 1, "removal of the temporary directory was attempted");
  await assert.rejects(access(harness.state.tempDirectories[0]), { code: "ENOENT" });
});

test("SQL application failure removes the generated database and temporary files", async () => {
  const harness = createHarness("apply-sql");

  await assert.rejects(runWith(harness), /simulated fixture SQL failure/);

  assert.equal(harness.state.fixtureQueries.length, 1);
  assert.equal(harness.state.fixtureEnded, true);
  assert.equal(harness.state.runTestProcess, false);
  await assertResourcesRemoved(harness.state);
});

test("fixture connection failure removes the generated database and temporary files", async () => {
  const harness = createHarness("fixture-connect");

  await assert.rejects(runWith(harness), /simulated fixture connection failure/);

  assert.equal(harness.state.fixtureConnectAttempts, 1);
  assert.equal(harness.state.fixtureQueries.length, 0, "fixture SQL is not applied before connecting");
  assert.equal(harness.state.fixtureEnded, true, "the fixture client is closed after the failed connection");
  assert.equal(harness.state.runTestProcess, false, "the roster test process does not run");
  await assertResourcesRemoved(harness.state);
});

test("test process failure removes the generated database and temporary files", async () => {
  const harness = createHarness("run-tests");

  assert.equal(await runWith(harness), 7);

  assert.equal(harness.state.fixtureQueries.length, 1);
  assert.equal(harness.state.runTestProcess, true);
  await assertResourcesRemoved(harness.state);
});

test("temporary files are removed when terminating database connections fails", async () => {
  const harness = createHarness("terminate-connections");

  await assert.rejects(runWith(harness), /simulated connection termination failure/);

  assert.equal(harness.state.terminateConnectionAttempts, 1);
  await assertResourcesRemoved(harness.state);
});

test("administrative connection and temporary files are cleaned when dropping the database fails", async () => {
  const harness = createHarness("drop-database");

  await assert.rejects(runWith(harness), /simulated database drop failure/);

  assert.equal(harness.state.dropDatabaseAttempts, 1, "the generated database drop was attempted");
  assert.deepEqual(harness.state.droppedDatabases, [], "the failed drop was not recorded as successful");
  assert.equal(harness.state.adminEnded, true, "the administrative connection was closed");
  assert.equal(harness.state.tempDirectories.length, 1, "the runner created one isolated temporary directory");
  await assert.rejects(access(harness.state.tempDirectories[0]), { code: "ENOENT" });
});

test("temporary files are removed and admin close failures are reported", async () => {
  const harness = createHarness("admin-end");

  await assert.rejects(runWith(harness), /simulated administrative connection close failure/);

  assert.equal(harness.state.clientCreations, 2, "only fake administrative and fixture clients were created");
  assert.equal(harness.state.adminEnded, true, "the administrative connection close was attempted");
  assert.equal(harness.state.tempDirectories.length, 1, "the runner created one isolated temporary directory");
  await assert.rejects(access(harness.state.tempDirectories[0]), { code: "ENOENT" });
});

test("a fixture connection to another database is rejected before fixture SQL runs", async () => {
  const harness = createHarness("wrong-database");

  await assert.rejects(runWith(harness), /Refusing to apply fixtures outside the generated test database/);

  assert.equal(harness.state.fixtureQueries.length, 0);
  assert.equal(harness.state.fixtureEnded, true);
  assert.equal(harness.state.runTestProcess, false);
  await assertResourcesRemoved(harness.state);
});

test("a missing database URL is rejected before opening a client or creating resources", async () => {
  const harness = createHarness("safe");

  await assert.rejects(
    runWith(harness, { DATABASE_URL: undefined }),
    /Roster tests require a development DATABASE_URL outside a deployment/,
  );

  await assertEarlySafetyGate(harness);
});

test("production mode is rejected before opening a client or creating resources", async () => {
  const harness = createHarness("safe");

  await assert.rejects(
    runWith(harness, { NODE_ENV: "production" }),
    /Roster tests require a development DATABASE_URL outside a deployment/,
  );

  await assertEarlySafetyGate(harness);
});

test("deployment mode is rejected before opening a client or creating resources", async () => {
  const harness = createHarness("safe");

  await assert.rejects(
    runWith(harness, { REPLIT_DEPLOYMENT: "1" }),
    /Roster tests require a development DATABASE_URL outside a deployment/,
  );

  await assertEarlySafetyGate(harness);
});

test("a source database already named as a test database is rejected before creating another database", async () => {
  const harness = createHarness("test-database-source");

  await assert.rejects(
    runWith(harness),
    /The development database user must have CREATEDB, and the source cannot be a test database/,
  );

  assertNoDatabaseOrFixturesWereCreated(harness.state);
  assert.equal(harness.state.clientCreations, 1, "only the administrative source connection is opened");
  assert.equal(harness.state.adminEnded, true);
  assert.equal(harness.state.tempDirectories.length, 1);
  await assert.rejects(access(harness.state.tempDirectories[0]), { code: "ENOENT" });
});


test("a source user without CREATEDB is rejected before creating a database or applying fixtures", async () => {
  const harness = createHarness("missing-createdb");

  await assert.rejects(
    runWith(harness),
    /The development database user must have CREATEDB, and the source cannot be a test database/,
  );

  assertNoDatabaseOrFixturesWereCreated(harness.state);
  assert.equal(harness.state.clientCreations, 1, "only the administrative source connection is opened");
  assert.equal(harness.state.adminEnded, true);
  assert.equal(harness.state.tempDirectories.length, 1);
  await assert.rejects(access(harness.state.tempDirectories[0]), { code: "ENOENT" });
});

test("an empty source security query is rejected without creating a database or applying fixtures", async () => {
  const harness = createHarness("missing-security-row");

  await assert.rejects(
    runWith(harness),
    /Unable to verify the source database and CREATEDB permission/,
  );

  await assertSecurityCheckCleanup(harness);
});

test("a failed source security query is rejected without creating a database or applying fixtures", async () => {
  const harness = createHarness("security-query-error");

  await assert.rejects(runWith(harness), /simulated security metadata query failure/);

  await assertSecurityCheckCleanup(harness);
});
