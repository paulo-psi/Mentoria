import assert from "node:assert/strict";
import { access, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { runRosterTests } from "./run.mjs";

const sourceUrl = "postgres://roster_test:local-only@127.0.0.1:5432/source_db";

function createHarness(mode) {
  const state = {
    createdDatabases: [],
    droppedDatabases: [],
    fixtureQueries: [],
    fixtureEnded: false,
    runTestProcess: false,
    tempDirectories: [],
  };

  class FakeClient {
    constructor({ connectionString }) {
      this.database = new URL(connectionString).pathname.slice(1);
      this.isAdmin = this.database === "source_db";
    }

    async connect() {}

    async query(sql) {
      if (this.isAdmin) {
        if (sql.startsWith("select current_database()")) {
          return { rows: [{ current_database: "source_db", rolcreatedb: true }] };
        }
        const create = sql.match(/^CREATE DATABASE "([^"]+)"$/);
        if (create) {
          state.createdDatabases.push(create[1]);
          return { rows: [] };
        }
        const drop = sql.match(/^DROP DATABASE "([^"]+)"$/);
        if (drop) {
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
      if (!this.isAdmin) state.fixtureEnded = true;
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
    rm,
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
  assert.equal(state.tempDirectories.length, 1, "the runner created one isolated temporary directory");
  await assert.rejects(access(state.tempDirectories[0]), { code: "ENOENT" });
}

async function runWith(harness) {
  return runRosterTests({
    env: { DATABASE_URL: sourceUrl, NODE_ENV: "development" },
    Client: harness.FakeClient,
    spawn: harness.spawn,
    bundle: async () => {},
    fs: harness.fs,
    tempDirectory: tmpdir(),
  });
}

test("schema generation failure removes the generated database and temporary files", async () => {
  const harness = createHarness("generate-schema");

  await assert.rejects(runWith(harness), /Failed to generate the application schema/);

  assert.equal(harness.state.fixtureQueries.length, 0);
  assert.equal(harness.state.runTestProcess, false);
  await assertResourcesRemoved(harness.state);
});

test("SQL application failure removes the generated database and temporary files", async () => {
  const harness = createHarness("apply-sql");

  await assert.rejects(runWith(harness), /simulated fixture SQL failure/);

  assert.equal(harness.state.fixtureQueries.length, 1);
  assert.equal(harness.state.fixtureEnded, true);
  assert.equal(harness.state.runTestProcess, false);
  await assertResourcesRemoved(harness.state);
});

test("test process failure removes the generated database and temporary files", async () => {
  const harness = createHarness("run-tests");

  assert.equal(await runWith(harness), 7);

  assert.equal(harness.state.fixtureQueries.length, 1);
  assert.equal(harness.state.runTestProcess, true);
  await assertResourcesRemoved(harness.state);
});

test("a fixture connection to another database is rejected before fixture SQL runs", async () => {
  const harness = createHarness("wrong-database");

  await assert.rejects(runWith(harness), /Refusing to apply fixtures outside the generated test database/);

  assert.equal(harness.state.fixtureQueries.length, 0);
  assert.equal(harness.state.fixtureEnded, true);
  assert.equal(harness.state.runTestProcess, false);
  await assertResourcesRemoved(harness.state);
});