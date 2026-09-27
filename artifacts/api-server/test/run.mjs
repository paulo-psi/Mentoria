import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import esbuildPluginPino from "esbuild-plugin-pino";

const directory = path.dirname(fileURLToPath(import.meta.url));

const defaultFs = { mkdtemp, readFile, readdir, rm, writeFile };

/**
 * Runs roster tests with the same safety checks as the CLI, while allowing the
 * database and subprocess boundaries to be replaced by isolated test doubles.
 */
export async function runRosterTests({
  env = process.env,
  Client,
  spawn = spawnSync,
  bundle = build,
  fs = defaultFs,
  tempDirectory = tmpdir(),
} = {}) {
  // Never run destructive fixtures against the app database. Each run owns a
  // fresh database, and the production process cannot invoke this harness.
  if (!env.DATABASE_URL || env.NODE_ENV === "production" || env.REPLIT_DEPLOYMENT) {
    throw new Error("Roster tests require a development DATABASE_URL outside a deployment.");
  }
  if (!Client) throw new Error("The roster test runner requires a PostgreSQL Client.");

  const databaseName = `roster_test_${randomUUID().replaceAll("-", "")}`;
  const admin = new Client({ connectionString: env.DATABASE_URL });
  const workingDir = await fs.mkdtemp(path.join(tempDirectory, "roster-test-"));
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

    const testUrl = new URL(env.DATABASE_URL);
    testUrl.pathname = `/${databaseName}`;
    // pg accepts a database query parameter that overrides the URL pathname.
    testUrl.searchParams.delete("database");
    const testEnv = { ...env, DATABASE_URL: testUrl.toString(), NODE_ENV: "test" };

    // Generate from the application's own Drizzle config, with no previous
    // snapshot, so every table, index and constraint is included on every run.
    // `generate` only writes SQL files; never use push/migrate against the source.
    const migrationsDir = path.join(workingDir, "schema");
    const testConfig = path.join(workingDir, "drizzle.config.ts");
    const appConfig = fileURLToPath(new URL("../../../lib/db/drizzle.config.ts", import.meta.url));
    // Drizzle does not allow --out alongside --config. Inherit the real config
    // and override only its output directory, without copying its schema settings.
    await fs.writeFile(testConfig, `import config from ${JSON.stringify(appConfig)};
export default { ...config, out: ${JSON.stringify(migrationsDir)} };
`);
    const generation = spawn("pnpm", [
      "exec", "drizzle-kit",
      "generate",
      `--config=${testConfig}`,
    ], {
      cwd: fileURLToPath(new URL("../../../lib/db", import.meta.url)),
      env: testEnv,
      stdio: "inherit",
    });
    if (generation.error) throw generation.error;
    if (generation.status !== 0) throw new Error("Failed to generate the application schema for roster tests.");
    const migrations = (await fs.readdir(migrationsDir)).filter((name) => name.endsWith(".sql"));
    if (migrations.length !== 1) {
      throw new Error("Expected exactly one initial migration from the application schema.");
    }

    const fixture = new Client({ connectionString: testUrl.toString() });
    try {
      await fixture.connect();
      const { rows: [{ name }] } = await fixture.query("select current_database() as name");
      if (name !== databaseName) throw new Error("Refusing to apply fixtures outside the generated test database.");
      await fixture.query(await fs.readFile(path.join(migrationsDir, migrations[0]), "utf8"));
    } finally {
      await fixture.end();
    }

    const output = path.join(workingDir, "roster.test.mjs");
    await bundle({
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
    const result = spawn(process.execPath, [output], {
      cwd: path.dirname(directory),
      env: testEnv,
      stdio: "inherit",
    });
    if (result.error) throw result.error;
    return result.status === 0 ? 0 : result.status ?? 1;
  } finally {
    try {
      if (created) {
        try {
          // Terminate only connections to this generated test database.
          await admin.query(
            "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
            [databaseName],
          );
        } finally {
          await admin.query(`DROP DATABASE "${databaseName}"`);
        }
      }
    } finally {
      try {
        await admin.end();
      } finally {
        await fs.rm(workingDir, { recursive: true, force: true });
      }
    }
  }
}

async function main() {
  // Check the safety gate before loading the driver or opening any connections.
  if (!process.env.DATABASE_URL || process.env.NODE_ENV === "production" || process.env.REPLIT_DEPLOYMENT) {
    throw new Error("Roster tests require a development DATABASE_URL outside a deployment.");
  }
  const require = createRequire(new URL("../../../lib/db/package.json", import.meta.url));
  globalThis.require = createRequire(import.meta.url);
  const { Client } = require("pg");
  process.exitCode = await runRosterTests({ Client });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
