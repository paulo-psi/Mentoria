import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { access, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { runRosterTests } from "./run.mjs";

const { Client: PgClient } = createRequire(new URL("../../../lib/db/package.json", import.meta.url))("pg");

test("the real pg client applies fixtures only to the disposable database despite a conflicting URL option", async () => {
  assert.ok(
    process.env.DATABASE_URL && process.env.NODE_ENV !== "production" && !process.env.REPLIT_DEPLOYMENT,
    "Live runner verification requires a development DATABASE_URL outside a deployment.",
  );

  const verifier = new PgClient({ connectionString: process.env.DATABASE_URL });
  const tempDirectories = [];
  let createdDatabase;
  let fixtureDatabase;
  let fixtureTableCreated = false;
  let testProcessStarted = false;

  class RecordingClient extends PgClient {
    async query(sql, ...args) {
      const result = await super.query(sql, ...args);
      const create = sql.match(/^CREATE DATABASE "(roster_test_[a-f0-9]{32})"$/);
      if (create) createdDatabase = create[1];
      if (sql === "select current_database() as name") fixtureDatabase = result.rows[0].name;
      if (sql === "CREATE TABLE fixture_isolation_probe (id integer);") {
        const { rows } = await super.query("select to_regclass('fixture_isolation_probe') as table_name");
        fixtureTableCreated = rows[0].table_name === "fixture_isolation_probe";
      }
      return result;
    }
  }

  try {
    await verifier.connect();
    const { rows: [source] } = await verifier.query(
      "select current_database() as name, rolcreatedb from pg_roles where rolname = current_user",
    );
    assert.equal(source.rolcreatedb, true, "the development database user needs CREATEDB");
    assert.ok(!source.name.startsWith("roster_test_"), "the source must not be a test database");

    const conflictingUrl = new URL(process.env.DATABASE_URL);
    conflictingUrl.pathname = `/${source.name}`;
    conflictingUrl.searchParams.set("database", "nonexistent_conflicting_database_option");

    const result = await runRosterTests({
      env: {
        ...process.env,
        DATABASE_URL: conflictingUrl.toString(),
      },
      Client: RecordingClient,
      fs: {
        mkdtemp: async (prefix) => {
          const directory = await mkdtemp(prefix);
          tempDirectories.push(directory);
          return directory;
        },
        readFile,
        readdir,
        rm,
        writeFile,
      },
      spawn: (command, args) => {
        if (command === "pnpm" && args.includes("generate")) {
          const config = args.find((arg) => arg.startsWith("--config=")).slice("--config=".length);
          const schemaDirectory = path.join(path.dirname(config), "schema");
          mkdirSync(schemaDirectory);
          writeFileSync(
            path.join(schemaDirectory, "0000_initial.sql"),
            "CREATE TABLE fixture_isolation_probe (id integer);",
          );
          return { status: 0 };
        }
        assert.equal(command, process.execPath);
        testProcessStarted = true;
        return { status: 0 };
      },
      bundle: async () => {},
      tempDirectory: tmpdir(),
    });

    assert.equal(result, 0);
    assert.match(createdDatabase, /^roster_test_[a-f0-9]{32}$/);
    assert.equal(fixtureDatabase, createdDatabase, "pg connected to the generated database, not the query option");
    assert.equal(fixtureTableCreated, true, "fixture SQL ran in the generated database");
    const { rows: [sourceProbe] } = await verifier.query(
      "select to_regclass('fixture_isolation_probe') as table_name",
    );
    assert.equal(sourceProbe.table_name, null, "fixture SQL did not create a table in the source database");
    assert.equal(testProcessStarted, true);
    const { rows: [remaining] } = await verifier.query(
      "select count(*)::integer as count from pg_database where datname = $1",
      [createdDatabase],
    );
    assert.equal(remaining.count, 0, "the disposable database was dropped");
    assert.equal(tempDirectories.length, 1);
    await assert.rejects(access(tempDirectories[0]), { code: "ENOENT" });
  } finally {
    // If the runner regresses, the integration test must not leave a database behind.
    if (createdDatabase) {
      const { rows: [remaining] } = await verifier.query(
        "select count(*)::integer as count from pg_database where datname = $1",
        [createdDatabase],
      );
      if (remaining.count > 0) {
        await verifier.query(
          "select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()",
          [createdDatabase],
        );
        await verifier.query(`DROP DATABASE "${createdDatabase}"`);
      }
    }
    for (const directory of tempDirectories) {
      await rm(directory, { recursive: true, force: true });
    }
    await verifier.end();
  }
});