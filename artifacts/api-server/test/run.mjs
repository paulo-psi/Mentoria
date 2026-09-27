import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import esbuildPluginPino from "esbuild-plugin-pino";

// Never run destructive fixtures against the app database. Each run owns a fresh
// database, and the production process cannot invoke this harness.
if (!process.env.DATABASE_URL || process.env.NODE_ENV === "production" || process.env.REPLIT_DEPLOYMENT) {
  throw new Error("Roster tests require a development DATABASE_URL outside a deployment.");
}

const require = createRequire(new URL("../../../lib/db/package.json", import.meta.url));
globalThis.require = createRequire(import.meta.url);
const { Client } = require("pg");
const directory = path.dirname(fileURLToPath(import.meta.url));
const databaseName = `roster_test_${randomUUID().replaceAll("-", "")}`;
const admin = new Client({ connectionString: process.env.DATABASE_URL });
const workingDir = await mkdtemp(path.join(tmpdir(), "roster-test-"));
let created = false;

try {
  await admin.connect();
  const { rows: [{ current_database: source, rolcreatedb }] } = await admin.query(
    "select current_database(), rolcreatedb from pg_roles where rolname = current_user",
  );
  if (!rolcreatedb || source.startsWith("roster_test_")) {
    throw new Error("The development database user must have CREATEDB, and the source cannot be a test database.");
  }
  // Identifier is constructed solely from a generated UUID.
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  created = true;

  const testUrl = new URL(process.env.DATABASE_URL);
  testUrl.pathname = `/${databaseName}`;
  const fixture = new Client({ connectionString: testUrl.toString() });
  try {
    await fixture.connect();
    await fixture.query(await readFile(path.join(directory, "schema.sql"), "utf8"));
  } finally {
    await fixture.end();
  }

  const output = path.join(workingDir, "roster.test.mjs");
  await build({
    entryPoints: [path.join(directory, "roster.test.ts")],
    outdir: workingDir,
    outExtension: { ".js": ".mjs" },
    bundle: true,
    platform: "node",
    format: "esm",
    external: ["pg-native"],
    plugins: [esbuildPluginPino({ transports: ["pino-pretty"] })],
    banner: {
      js: `import { createRequire as __createRequire } from 'node:module';
globalThis.require = __createRequire(import.meta.url);`,
    },
  });
  const result = spawnSync(process.execPath, [output], {
    cwd: path.dirname(directory),
    env: { ...process.env, DATABASE_URL: testUrl.toString(), NODE_ENV: "test" },
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exitCode = result.status ?? 1;
} finally {
  if (created) {
    // Terminate only connections to this generated test database.
    await admin.query(
      "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
      [databaseName],
    );
    await admin.query(`DROP DATABASE "${databaseName}"`);
  }
  await admin.end();
  await rm(workingDir, { recursive: true, force: true });
}