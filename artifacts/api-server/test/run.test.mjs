import assert from "node:assert/strict";
import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import test from "node:test";
import { runRosterTests } from "./run.mjs";

const sourceUrl = "postgres://roster_test:local-only@127.0.0.1:5432/source_db";

function createHarness(mode) {
  const state = {
    clientCreations: 0,
    adminConnectAttempts: 0,
    fixtureConnectAttempts: 0,
    fixtureConnectedDatabase: null,
    fixtureReadAttempts: 0,
    createdDatabases: [],
    droppedDatabases: [],
    dropDatabaseAttempts: 0,
    terminateConnectionAttempts: 0,
    fixtureQueries: [],
    fixtureEnded: false,
    adminEnded: false,
    runTestProcess: false,
    testProcessStartAttempts: 0,
    bundleAttempts: 0,
    schemaGenerationResults: [],
    tempDirectoryCreationAttempts: 0,
    tempDirectories: [],
    tempDirectoryRemovalAttempts: 0,
    tempDirectoryCreationError: new Error("simulated temporary-directory creation failure"),
    sourceDatabase: mode === "test-database-source" ? "roster_test_existing" : "source_db",
  };

  class FakeClient {
    constructor({ connectionString }) {
      state.clientCreations += 1;
      const url = new URL(connectionString);
      this.database = url.searchParams.get("database") ?? url.pathname.slice(1);
      this.isAdmin = state.clientCreations === 1;
    }

    async connect() {
      if (this.isAdmin) {
        state.adminConnectAttempts += 1;
        if (mode === "admin-connect" || mode === "admin-connect-and-temp-failure") {
          throw new Error("simulated administrative connection failure");
        }
        return;
      }
      state.fixtureConnectAttempts += 1;
      state.fixtureConnectedDatabase = this.database;
      if (mode === "fixture-connect" || mode === "fixture-connect-and-end") {
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
          const security = {
            current_database: state.sourceDatabase,
            rolcreatedb: mode !== "missing-createdb",
          };
          if (mode === "missing-database-name") delete security.current_database;
          if (mode === "missing-createdb-value") delete security.rolcreatedb;
          if (mode === "invalid-database-name-type") security.current_database = null;
          if (mode === "invalid-createdb-type") security.rolcreatedb = "true";
          return {
            rows: [security],
          };
        }
        const create = sql.match(/^CREATE DATABASE "([^"]+)"$/);
        if (create) {
          state.createdDatabases.push(create[1]);
          return { rows: [] };
        }
        if (sql.startsWith("SELECT pg_terminate_backend")) {
          state.terminateConnectionAttempts += 1;
          if (
            mode === "terminate-connections" ||
            mode === "multiple-cleanup-failures" ||
            mode === "multiple-cleanup-and-admin-end-failures" ||
            mode === "nonzero-roster-and-multiple-cleanup-failures"
          ) {
            throw new Error("simulated connection termination failure");
          }
          return { rows: [] };
        }
        const drop = sql.match(/^DROP DATABASE "([^"]+)"$/);
        if (drop) {
          state.dropDatabaseAttempts += 1;
          if (
            mode === "drop-database" ||
            mode === "drop-and-temp-failure" ||
            mode === "multiple-cleanup-failures" ||
            mode === "multiple-cleanup-and-admin-end-failures" ||
            mode === "roster-and-drop-failure" ||
            mode === "nonzero-roster-and-multiple-cleanup-failures" ||
            mode === "nonzero-roster-and-drop-failure"
          ) {
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
      if (mode === "apply-sql" || mode === "apply-sql-and-end") {
        throw new Error("simulated fixture SQL failure");
      }
      return { rows: [] };
    }

    async end() {
      if (this.isAdmin) state.adminEnded = true;
      else state.fixtureEnded = true;
      if (this.isAdmin && (
        mode === "admin-end" ||
        mode === "multiple-cleanup-and-admin-end-failures" ||
        mode === "signal-schema-generation-and-admin-end-failure" ||
        mode === "signal-test-process-and-admin-end-failure" ||
        mode === "nonzero-roster-and-admin-end-failure" ||
        mode === "temp-directory-create-and-admin-end-failure"
      )) {
        throw new Error("simulated administrative connection close failure");
      }
      if (!this.isAdmin && (
        mode === "fixture-connect-and-end" ||
        mode === "fixture-end" ||
        mode === "apply-sql-and-end"
      )) {
        throw new Error("simulated fixture connection close failure");
      }
    }
  }

  const fs = {
    mkdtemp: async (prefix) => {
      state.tempDirectoryCreationAttempts += 1;
      if (
        mode === "temp-directory-create" ||
        mode === "temp-directory-create-and-admin-end-failure"
      ) {
        throw state.tempDirectoryCreationError;
      }
      const tempDir = await mkdtemp(prefix);
      state.tempDirectories.push(tempDir);
      return tempDir;
    },
    readFile: async () => {
      state.fixtureReadAttempts += 1;
      return "CREATE TABLE disposable_fixture (id integer);";
    },
    readdir: async () => {
      if (mode === "no-generated-migrations") return [];
      if (mode === "multiple-generated-migrations") {
        return ["0000_initial.sql", "0001_additional.sql"];
      }
      return ["0000_initial.sql"];
    },
    rm: async (...args) => {
      state.tempDirectoryRemovalAttempts += 1;
      if (
        mode === "drop-and-temp-failure" ||
        mode === "roster-and-temp-failure" ||
        mode === "admin-connect-and-temp-failure"
      ) {
        throw new Error("simulated temporary-directory removal failure");
      }
      return rm(...args);
    },
    writeFile,
  };

  const spawn = (_command, args) => {
    if (args.includes("generate")) {
      let result;
      if (
        mode === "signal-schema-generation" ||
        mode === "signal-schema-generation-and-admin-end-failure"
      ) {
        result = { status: null, signal: "SIGTERM" };
      } else {
        result = { status: mode === "generate-schema" ? 3 : 0 };
      }
      state.schemaGenerationResults.push(result);
      return result;
    }
    state.testProcessStartAttempts += 1;
    if (mode === "test-process-start-error") {
      return { error: new Error("simulated test process start failure") };
    }
    state.runTestProcess = true;
    if (mode === "roster-and-drop-failure" || mode === "roster-and-temp-failure") {
      throw new Error("simulated roster test execution failure");
    }
    if (mode === "signal-test-process" || mode === "signal-test-process-and-admin-end-failure") {
      return { status: null, signal: "SIGTERM" };
    }
    return {
      status:
        mode === "run-tests" ||
        mode === "nonzero-roster-and-drop-failure" ||
        mode === "nonzero-roster-and-multiple-cleanup-failures" ||
        mode === "nonzero-roster-and-admin-end-failure"
          ? 7
          : 0,
    };
  };

  const bundle = async () => {
    state.bundleAttempts += 1;
    if (mode === "bundle-error") {
      throw new Error("simulated roster test bundle failure");
    }
  };

  return { state, FakeClient, fs, spawn, bundle };
}

async function assertResourcesRemoved(state) {
  assert.equal(state.createdDatabases.length, 1, "a fresh disposable database was created");
  assert.deepEqual(state.droppedDatabases, state.createdDatabases, "the generated database was dropped");
  assert.equal(state.adminEnded, true, "the administrative connection was closed");
  assert.equal(state.tempDirectories.length, 1, "the runner created one isolated temporary directory");
  await assert.rejects(access(state.tempDirectories[0]), { code: "ENOENT" });
}

async function assertInvalidMigrationListingStopsBeforeFixtures(harness) {
  await assert.rejects(
    runWith(harness),
    /Expected exactly one initial migration from the application schema/,
  );

  const { state } = harness;
  assert.deepEqual(state.schemaGenerationResults, [{ status: 0 }], "schema generation succeeded");
  assert.equal(state.fixtureReadAttempts, 0, "fixture SQL was not read");
  assert.equal(state.fixtureConnectAttempts, 0, "fixture setup did not start");
  assert.equal(state.fixtureQueries.length, 0, "fixture SQL was not applied");
  assert.equal(state.bundleAttempts, 0, "roster tests were not bundled");
  assert.equal(state.testProcessStartAttempts, 0, "the roster test process was not started");
  assert.equal(state.runTestProcess, false, "roster tests did not run");
  await assertResourcesRemoved(state);
}

async function runWith(harness, envOverrides = {}) {
  return runRosterTests({
    env: { DATABASE_URL: sourceUrl, NODE_ENV: "development", ...envOverrides },
    Client: harness.FakeClient,
    spawn: harness.spawn,
    bundle: harness.bundle,
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

test("temporary-directory creation failure closes the admin client without starting tests", async () => {
  const harness = createHarness("temp-directory-create");

  await assert.rejects(runWith(harness), (error) => {
    assert.equal(error, harness.state.tempDirectoryCreationError);
    return true;
  });

  assertNoDatabaseOrFixturesWereCreated(harness.state);
  assert.equal(harness.state.clientCreations, 1, "only the injected administrative client is created");
  assert.equal(harness.state.adminConnectAttempts, 0, "the database connection was not started");
  assert.equal(harness.state.fixtureConnectAttempts, 0, "no fixture client was started");
  assert.equal(harness.state.adminEnded, true, "the administrative client was closed");
  assert.equal(harness.state.tempDirectoryCreationAttempts, 1, "temporary-directory creation was attempted");
  assert.equal(harness.state.tempDirectories.length, 0, "no temporary directory was created");
  assert.equal(harness.state.tempDirectoryRemovalAttempts, 0, "there is no directory to remove");
  assert.equal(harness.state.bundleAttempts, 0, "roster tests were not bundled");
  assert.equal(harness.state.testProcessStartAttempts, 0, "the roster process was not started");
  assert.deepEqual(harness.state.schemaGenerationResults, [], "schema generation was not started");
});

test("temporary-directory creation error remains primary when closing admin also fails", async () => {
  const harness = createHarness("temp-directory-create-and-admin-end-failure");

  await assert.rejects(runWith(harness), (error) => {
    assert.ok(error instanceof AggregateError);
    assert.equal(error.errors.length, 2);
    assert.equal(error.errors[0], harness.state.tempDirectoryCreationError);
    assert.match(error.errors[1].message, /simulated administrative connection close failure/);
    assert.equal(error.cause, harness.state.tempDirectoryCreationError);
    return true;
  });

  assertNoDatabaseOrFixturesWereCreated(harness.state);
  assert.equal(harness.state.clientCreations, 1, "only the injected administrative client is created");
  assert.equal(harness.state.adminConnectAttempts, 0, "the database connection was not started");
  assert.equal(harness.state.fixtureConnectAttempts, 0, "no fixture client was started");
  assert.equal(harness.state.adminEnded, true, "the administrative close was attempted");
  assert.equal(harness.state.tempDirectoryCreationAttempts, 1, "temporary-directory creation was attempted");
  assert.equal(harness.state.tempDirectories.length, 0, "no temporary directory was created");
  assert.equal(harness.state.tempDirectoryRemovalAttempts, 0, "there is no directory to remove");
  assert.equal(harness.state.bundleAttempts, 0, "roster tests were not bundled");
  assert.equal(harness.state.testProcessStartAttempts, 0, "the roster process was not started");
  assert.deepEqual(harness.state.schemaGenerationResults, [], "schema generation was not started");
});

test("schema generation failure removes the generated database and temporary files", async () => {
  const harness = createHarness("generate-schema");

  await assert.rejects(runWith(harness), /Failed to generate the application schema/);

  assert.equal(harness.state.fixtureQueries.length, 0);
  assert.deepEqual(harness.state.schemaGenerationResults, [{ status: 3 }]);
  assert.equal(harness.state.runTestProcess, false);
  await assertResourcesRemoved(harness.state);
});

test("empty generated migration listing stops before fixtures and removes resources", async () => {
  await assertInvalidMigrationListingStopsBeforeFixtures(createHarness("no-generated-migrations"));
});

test("multiple generated migrations stop before fixtures and remove resources", async () => {
  await assertInvalidMigrationListingStopsBeforeFixtures(
    createHarness("multiple-generated-migrations"),
  );
});

test("schema generation interruption identifies the signal and removes resources", async () => {
  const harness = createHarness("signal-schema-generation");

  await assert.rejects(runWith(harness), (error) => {
    assert.match(error.message, /schema generation was terminated by signal SIGTERM/);
    assert.equal(error.signal, "SIGTERM");
    assert.equal(error.exitCode, 1);
    return true;
  });

  assert.deepEqual(harness.state.schemaGenerationResults, [{ status: null, signal: "SIGTERM" }]);
  assert.equal(harness.state.fixtureQueries.length, 0);
  assert.equal(harness.state.runTestProcess, false);
  await assertResourcesRemoved(harness.state);
});

test("schema generation interruption remains visible when the administrative connection cannot close", async () => {
  const harness = createHarness("signal-schema-generation-and-admin-end-failure");

  await assert.rejects(runWith(harness), (error) => {
    assert.ok(error instanceof AggregateError);
    assert.equal(error.errors.length, 2);
    assert.equal(error.cause, error.errors[0]);
    assert.match(error.cause.message, /schema generation was terminated by signal SIGTERM/);
    assert.equal(error.cause.signal, "SIGTERM");
    assert.equal(error.cause.exitCode, 1);
    assert.match(error.errors[1].message, /simulated administrative connection close failure/);
    return true;
  });

  assert.deepEqual(harness.state.schemaGenerationResults, [{ status: null, signal: "SIGTERM" }]);
  assert.equal(harness.state.fixtureQueries.length, 0, "fixture SQL was not applied");
  assert.equal(harness.state.runTestProcess, false, "roster tests did not start");
  assert.equal(harness.state.terminateConnectionAttempts, 1, "connection termination was attempted");
  assert.equal(harness.state.dropDatabaseAttempts, 1, "the disposable database drop was attempted");
  assert.equal(harness.state.tempDirectoryRemovalAttempts, 1, "temporary-directory removal was attempted");
  assert.deepEqual(
    harness.state.droppedDatabases,
    harness.state.createdDatabases,
    "the disposable database was dropped",
  );
  assert.equal(harness.state.adminEnded, true, "the administrative connection close was attempted");
  assert.equal(harness.state.tempDirectories.length, 1);
  await assert.rejects(access(harness.state.tempDirectories[0]), { code: "ENOENT" });
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

test("administrative connection failure remains visible when temporary-directory cleanup fails", async () => {
  const harness = createHarness("admin-connect-and-temp-failure");

  try {
    await assert.rejects(runWith(harness), (error) => {
      assert.ok(error instanceof AggregateError);
      assert.equal(error.errors.length, 2);
      assert.match(error.errors[0].message, /simulated administrative connection failure/);
      assert.match(error.errors[1].message, /simulated temporary-directory removal failure/);
      assert.equal(error.cause, error.errors[0]);
      return true;
    });

    assertNoDatabaseOrFixturesWereCreated(harness.state);
    assert.equal(harness.state.clientCreations, 1, "only the fake administrative client was created");
    assert.equal(harness.state.adminConnectAttempts, 1, "the fake administrative connection was attempted");
    assert.equal(harness.state.adminEnded, true, "closing the fake administrative client was attempted");
    assert.equal(harness.state.tempDirectories.length, 1, "one temporary directory was created");
    assert.equal(harness.state.tempDirectoryRemovalAttempts, 1, "temporary-directory removal was attempted");
  } finally {
    for (const directory of harness.state.tempDirectories) {
      await rm(directory, { recursive: true, force: true });
    }
  }
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

test("fixture setup and close failures are both reported before administrative cleanup", async () => {
  const harness = createHarness("fixture-connect-and-end");

  await assert.rejects(runWith(harness), (error) => {
    assert.ok(error instanceof AggregateError);
    assert.match(error.message, /Fixture setup failed and closing its connection also failed/);
    assert.equal(error.errors.length, 2);
    assert.match(error.errors[0].message, /simulated fixture connection failure/);
    assert.match(error.errors[1].message, /simulated fixture connection close failure/);
    assert.equal(error.cause, error.errors[0]);
    return true;
  });

  assert.equal(harness.state.fixtureConnectAttempts, 1);
  assert.equal(harness.state.fixtureQueries.length, 0, "fixture SQL was not applied");
  assert.equal(harness.state.fixtureEnded, true, "fixture close was attempted");
  assert.equal(harness.state.runTestProcess, false, "roster tests did not run");
  assert.equal(harness.state.terminateConnectionAttempts, 1);
  assert.equal(harness.state.dropDatabaseAttempts, 1);
  assert.equal(harness.state.tempDirectoryRemovalAttempts, 1);
  await assertResourcesRemoved(harness.state);
});

test("fixture SQL and close failures are both reported before administrative cleanup", async () => {
  const harness = createHarness("apply-sql-and-end");

  await assert.rejects(runWith(harness), (error) => {
    assert.ok(error instanceof AggregateError);
    assert.match(error.message, /Fixture setup failed and closing its connection also failed/);
    assert.equal(error.errors.length, 2);
    assert.match(error.errors[0].message, /simulated fixture SQL failure/);
    assert.match(error.errors[1].message, /simulated fixture connection close failure/);
    assert.equal(error.cause, error.errors[0]);
    return true;
  });

  assert.equal(harness.state.fixtureConnectAttempts, 1);
  assert.deepEqual(
    harness.state.fixtureQueries,
    ["CREATE TABLE disposable_fixture (id integer);"],
    "fixture SQL application was attempted",
  );
  assert.equal(harness.state.fixtureEnded, true, "fixture close was attempted");
  assert.equal(harness.state.bundleAttempts, 0, "roster tests were not bundled");
  assert.equal(harness.state.testProcessStartAttempts, 0, "roster tests did not start");
  assert.equal(harness.state.runTestProcess, false);
  assert.equal(harness.state.terminateConnectionAttempts, 1);
  assert.equal(harness.state.dropDatabaseAttempts, 1);
  assert.equal(harness.state.tempDirectoryRemovalAttempts, 1);
  await assertResourcesRemoved(harness.state);
});

test("fixture close failure after successful SQL application stops roster tests and cleans up", async () => {
  const harness = createHarness("fixture-end");

  await assert.rejects(runWith(harness), /simulated fixture connection close failure/);

  assert.equal(harness.state.fixtureConnectAttempts, 1);
  assert.deepEqual(harness.state.fixtureQueries, ["CREATE TABLE disposable_fixture (id integer);"], "fixture SQL was applied");
  assert.equal(harness.state.fixtureEnded, true, "fixture close was attempted");
  assert.equal(harness.state.bundleAttempts, 0, "roster tests were not bundled");
  assert.equal(harness.state.testProcessStartAttempts, 0, "roster tests did not start");
  assert.equal(harness.state.runTestProcess, false);
  assert.equal(harness.state.terminateConnectionAttempts, 1);
  assert.equal(harness.state.dropDatabaseAttempts, 1);
  assert.equal(harness.state.tempDirectoryRemovalAttempts, 1);
  await assertResourcesRemoved(harness.state);
});

test("test process failure removes the generated database and temporary files", async () => {
  const harness = createHarness("run-tests");

  assert.equal(await runWith(harness), 7);

  assert.equal(harness.state.fixtureQueries.length, 1);
  assert.equal(harness.state.runTestProcess, true);
  await assertResourcesRemoved(harness.state);
});

test("successful schema generation runs tests and removes all resources", async () => {
  const harness = createHarness("successful-test-process");

  assert.equal(await runWith(harness), 0);

  assert.deepEqual(harness.state.schemaGenerationResults, [{ status: 0 }]);
  assert.equal(harness.state.runTestProcess, true, "the roster test process was attempted");
  await assertResourcesRemoved(harness.state);
});

test("a conflicting source database query option cannot redirect fixture setup", async () => {
  const harness = createHarness("successful-test-process");
  const conflictingDatabase = "database_from_query_option";

  assert.equal(
    await runWith(harness, {
      DATABASE_URL: `${sourceUrl}?database=${conflictingDatabase}`,
    }),
    0,
  );

  assert.equal(harness.state.fixtureConnectAttempts, 1);
  assert.equal(
    harness.state.fixtureConnectedDatabase,
    harness.state.createdDatabases[0],
    "the fixture client connected to the generated disposable database",
  );
  assert.notEqual(
    harness.state.fixtureConnectedDatabase,
    conflictingDatabase,
    "the source URL's database query option did not override the disposable database",
  );
  assert.equal(harness.state.fixtureQueries.length, 1, "fixture SQL was applied after verifying the database");
  await assertResourcesRemoved(harness.state);
});

test("test process signal is reported with a nonzero exit code and all resources removed", async () => {
  const harness = createHarness("signal-test-process");

  await assert.rejects(runWith(harness), (error) => {
    assert.match(error.message, /terminated by signal SIGTERM/);
    assert.equal(error.signal, "SIGTERM");
    assert.equal(error.exitCode, 1);
    return true;
  });

  assert.equal(harness.state.runTestProcess, true, "the roster test process was attempted");
  await assertResourcesRemoved(harness.state);
});

test("test process interruption remains visible when the administrative connection cannot close", async () => {
  const harness = createHarness("signal-test-process-and-admin-end-failure");

  await assert.rejects(runWith(harness), (error) => {
    assert.ok(error instanceof AggregateError);
    assert.equal(error.errors.length, 2);
    assert.equal(error.cause, error.errors[0]);
    assert.match(error.cause.message, /terminated by signal SIGTERM/);
    assert.equal(error.cause.signal, "SIGTERM");
    assert.equal(error.cause.exitCode, 1);
    assert.match(error.errors[1].message, /simulated administrative connection close failure/);
    return true;
  });

  assert.equal(harness.state.runTestProcess, true, "the fake roster test process was attempted");
  assert.deepEqual(harness.state.droppedDatabases, harness.state.createdDatabases, "the disposable database was dropped");
  assert.equal(harness.state.adminEnded, true, "the administrative connection close was attempted");
  assert.equal(harness.state.tempDirectoryRemovalAttempts, 1, "temporary-directory removal was attempted");
  assert.equal(harness.state.tempDirectories.length, 1);
  await assert.rejects(access(harness.state.tempDirectories[0]), { code: "ENOENT" });
});

test("test bundling failure prevents process start and removes all resources", async () => {
  const harness = createHarness("bundle-error");

  await assert.rejects(runWith(harness), /simulated roster test bundle failure/);

  assert.equal(harness.state.bundleAttempts, 1, "the test bundle was attempted");
  assert.equal(harness.state.testProcessStartAttempts, 0, "the test process is not started after bundling fails");
  assert.equal(harness.state.runTestProcess, false);
  await assertResourcesRemoved(harness.state);
});

test("test process start failure is reported and removes all resources", async () => {
  const harness = createHarness("test-process-start-error");

  await assert.rejects(runWith(harness), /simulated test process start failure/);

  assert.equal(harness.state.bundleAttempts, 1, "the test bundle was created before starting the process");
  assert.equal(harness.state.testProcessStartAttempts, 1, "starting the test process was attempted");
  assert.equal(harness.state.runTestProcess, false, "the process did not start successfully");
  await assertResourcesRemoved(harness.state);
});

test("roster test failure remains visible when administrative cleanup also fails", async () => {
  const harness = createHarness("roster-and-drop-failure");

  await assert.rejects(runWith(harness), (error) => {
    assert.ok(error instanceof AggregateError);
    assert.match(error.errors[0].message, /simulated roster test execution failure/);
    assert.match(error.errors[1].message, /simulated database drop failure/);
    assert.equal(error.cause, error.errors[0]);
    return true;
  });

  assert.equal(harness.state.runTestProcess, true, "the roster test process was attempted");
  assert.equal(harness.state.dropDatabaseAttempts, 1, "the generated database drop was attempted");
  assert.equal(harness.state.adminEnded, true, "the administrative connection was closed");
  assert.equal(harness.state.tempDirectoryRemovalAttempts, 1, "temporary-file cleanup was attempted");
  assert.deepEqual(harness.state.droppedDatabases, [], "the failed drop was not recorded as successful");
  assert.equal(harness.state.clientCreations, 2, "only fake administrative and fixture clients were created");
  await assert.rejects(access(harness.state.tempDirectories[0]), { code: "ENOENT" });
});

test("roster test failure remains visible when temporary-directory cleanup also fails", async () => {
  const harness = createHarness("roster-and-temp-failure");

  try {
    await assert.rejects(runWith(harness), (error) => {
      assert.ok(error instanceof AggregateError);
      assert.equal(error.errors.length, 2);
      assert.match(error.errors[0].message, /simulated roster test execution failure/);
      assert.match(error.errors[1].message, /simulated temporary-directory removal failure/);
      assert.equal(error.cause, error.errors[0]);
      return true;
    });

    assert.equal(harness.state.runTestProcess, true, "the fake roster test process was attempted");
    assert.deepEqual(harness.state.droppedDatabases, harness.state.createdDatabases, "the disposable database was dropped");
    assert.equal(harness.state.adminEnded, true, "the fake administrative connection was closed");
    assert.equal(harness.state.tempDirectoryRemovalAttempts, 1, "temporary-directory removal was attempted");
    assert.equal(harness.state.clientCreations, 2, "only fake administrative and fixture clients were created");
    assert.equal(harness.state.adminConnectAttempts, 1, "the only admin connection was the fake");
    assert.equal(harness.state.fixtureConnectAttempts, 1, "the fixture connection was also fake");
  } finally {
    for (const directory of harness.state.tempDirectories) {
      await rm(directory, { recursive: true, force: true });
    }
  }
});

test("nonzero roster test status and every administrative cleanup failure remain visible", async () => {
  const harness = createHarness("nonzero-roster-and-multiple-cleanup-failures");

  await assert.rejects(runWith(harness), (error) => {
    assert.ok(error instanceof AggregateError);
    assert.equal(error.errors.length, 3);
    assert.equal(error.errors[0].exitCode, 7);
    assert.match(error.errors[0].message, /exited with status 7/);
    assert.match(error.errors[1].message, /simulated connection termination failure/);
    assert.match(error.errors[2].message, /simulated database drop failure/);
    assert.equal(error.cause, error.errors[0]);
    return true;
  });

  assert.equal(harness.state.runTestProcess, true, "the roster test process was attempted");
  assert.equal(harness.state.terminateConnectionAttempts, 1, "connection termination was attempted");
  assert.equal(harness.state.dropDatabaseAttempts, 1, "database removal ran despite termination failure");
  assert.equal(harness.state.adminEnded, true, "the administrative connection was closed");
  assert.equal(harness.state.tempDirectoryRemovalAttempts, 1, "temporary-directory cleanup was attempted");
  assert.equal(harness.state.clientCreations, 2, "only injected fake admin and fixture clients were created");
  assert.equal(harness.state.adminConnectAttempts, 1, "the only admin connection was the injected fake");
  assert.equal(harness.state.fixtureConnectAttempts, 1, "the fixture connection was the injected fake");
  assert.deepEqual(harness.state.droppedDatabases, [], "the failed drop was not recorded as successful");
  await assert.rejects(access(harness.state.tempDirectories[0]), { code: "ENOENT" });
});

test("nonzero roster test status remains visible when administrative cleanup fails", async () => {
  const harness = createHarness("nonzero-roster-and-drop-failure");

  await assert.rejects(runWith(harness), (error) => {
    assert.ok(error instanceof AggregateError);
    assert.equal(error.errors[0].exitCode, 7);
    assert.match(error.errors[0].message, /exited with status 7/);
    assert.match(error.errors[1].message, /simulated database drop failure/);
    assert.equal(error.cause, error.errors[0]);
    return true;
  });

  assert.equal(harness.state.dropDatabaseAttempts, 1, "the generated database drop was attempted");
  assert.equal(harness.state.adminEnded, true, "the administrative connection was closed");
  assert.equal(harness.state.tempDirectoryRemovalAttempts, 1, "temporary-file cleanup was attempted");
  await assert.rejects(access(harness.state.tempDirectories[0]), { code: "ENOENT" });
});

test("nonzero roster test status remains visible when the administrative connection cannot close", async () => {
  const harness = createHarness("nonzero-roster-and-admin-end-failure");

  await assert.rejects(runWith(harness), (error) => {
    assert.ok(error instanceof AggregateError);
    assert.equal(error.errors.length, 2);
    assert.equal(error.errors[0].exitCode, 7);
    assert.match(error.errors[0].message, /exited with status 7/);
    assert.match(error.errors[1].message, /simulated administrative connection close failure/);
    assert.equal(error.cause, error.errors[0]);
    return true;
  });

  assert.equal(harness.state.runTestProcess, true, "the fake roster test process was attempted");
  assert.deepEqual(harness.state.droppedDatabases, harness.state.createdDatabases, "the disposable database was dropped");
  assert.equal(harness.state.adminEnded, true, "the administrative connection close was attempted");
  assert.equal(harness.state.tempDirectoryRemovalAttempts, 1, "temporary-directory removal was attempted");
  assert.equal(harness.state.clientCreations, 2, "only fake administrative and fixture clients were created");
  await assert.rejects(access(harness.state.tempDirectories[0]), { code: "ENOENT" });
});

test("temporary files are removed when terminating database connections fails", async () => {
  const harness = createHarness("terminate-connections");

  await assert.rejects(runWith(harness), /simulated connection termination failure/);

  assert.equal(harness.state.terminateConnectionAttempts, 1);
  await assertResourcesRemoved(harness.state);
});

test("all administrative cleanup failures are reported and remaining cleanup is attempted", async () => {
  const harness = createHarness("multiple-cleanup-failures");

  await assert.rejects(runWith(harness), (error) => {
    assert.ok(error instanceof AggregateError);
    assert.equal(error.errors.length, 2);
    assert.match(error.errors[0].message, /simulated connection termination failure/);
    assert.match(error.errors[1].message, /simulated database drop failure/);
    return true;
  });

  assert.equal(harness.state.terminateConnectionAttempts, 1, "termination was attempted");
  assert.equal(harness.state.dropDatabaseAttempts, 1, "database removal was attempted despite termination failure");
  assert.equal(harness.state.adminEnded, true, "the administrative connection was closed");
  assert.equal(harness.state.tempDirectoryRemovalAttempts, 1, "temporary-directory cleanup was attempted");
  assert.equal(harness.state.clientCreations, 2, "only the injected fake admin and fixture clients were created");
  await assert.rejects(access(harness.state.tempDirectories[0]), { code: "ENOENT" });
});

test("termination, database removal, and admin close failures all remain visible", async () => {
  const harness = createHarness("multiple-cleanup-and-admin-end-failures");

  await assert.rejects(runWith(harness), (error) => {
    assert.ok(error instanceof AggregateError);
    assert.equal(error.errors.length, 3);
    assert.match(error.errors[0].message, /simulated connection termination failure/);
    assert.match(error.errors[1].message, /simulated database drop failure/);
    assert.match(error.errors[2].message, /simulated administrative connection close failure/);
    assert.equal(error.cause, error.errors[0]);
    return true;
  });

  assert.equal(harness.state.terminateConnectionAttempts, 1, "termination was attempted");
  assert.equal(harness.state.dropDatabaseAttempts, 1, "database removal ran despite termination failure");
  assert.deepEqual(harness.state.droppedDatabases, [], "the failed drop was not recorded as successful");
  assert.equal(harness.state.adminEnded, true, "admin close was attempted despite earlier cleanup failures");
  assert.equal(harness.state.tempDirectoryRemovalAttempts, 1, "temporary-directory cleanup was attempted");
  assert.equal(harness.state.clientCreations, 2, "only fake administrative and fixture clients were created");
  assert.equal(harness.state.tempDirectories.length, 1);
  await assert.rejects(access(harness.state.tempDirectories[0]), { code: "ENOENT" });
});

test("database and temporary-directory cleanup failures are both reported", async () => {
  const harness = createHarness("drop-and-temp-failure");

  try {
    await assert.rejects(runWith(harness), (error) => {
      assert.ok(error instanceof AggregateError);
      assert.equal(error.errors.length, 2);
      assert.match(error.errors[0].message, /simulated database drop failure/);
      assert.match(error.errors[1].message, /simulated temporary-directory removal failure/);
      return true;
    });

    assert.equal(harness.state.dropDatabaseAttempts, 1);
    assert.equal(harness.state.adminEnded, true);
    assert.equal(harness.state.clientCreations, 2, "only injected fake admin and fixture clients were created");
    assert.equal(harness.state.adminConnectAttempts, 1, "only the injected fake admin connection was opened");
    assert.equal(harness.state.fixtureConnectAttempts, 1, "the fixture connection was also provided by the test double");
    assert.equal(harness.state.tempDirectoryRemovalAttempts, 1);
  } finally {
    for (const directory of harness.state.tempDirectories) {
      await rm(directory, { recursive: true, force: true });
    }
  }
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

for (const [mode, description] of [
  ["missing-database-name", "a missing database name"],
  ["missing-createdb-value", "a missing CREATEDB value"],
  ["invalid-database-name-type", "a database name with an unexpected type"],
  ["invalid-createdb-type", "a CREATEDB value with an unexpected type"],
]) {
  test(`a source security row with ${description} is rejected and cleaned up`, async () => {
    const harness = createHarness(mode);

    await assert.rejects(
      runWith(harness),
      /Unable to verify the source database and CREATEDB permission/,
    );

    await assertSecurityCheckCleanup(harness);
  });
}
