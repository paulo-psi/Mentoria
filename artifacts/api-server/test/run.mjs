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
  let workingDir;
  let created = false;
  let result;
  let operationError;

  try {
    workingDir = await fs.mkdtemp(path.join(tempDirectory, "roster-test-"));
    await admin.connect();
    const securityCheck = await admin.query(
      "select current_database(), rolcreatedb from pg_roles where rolname = current_user",
    );
    const security = securityCheck?.rows?.[0];
    if (
      !security ||
      typeof security.current_database !== "string" ||
      typeof security.rolcreatedb !== "boolean"
    ) {
      throw new Error("Unable to verify the source database and CREATEDB permission.");
    }
    const { current_database: source, rolcreatedb } = security;
    if (!rolcreatedb || source.startsWith("roster_test_")) {
      throw new Error("The development database user must have CREATEDB, and the source cannot be a test database.");
    }
    // Identifier is constructed solely from a generated UUID.
    await admin.query(`CREATE DATABASE "${databaseName}"`);
    created = true;

    const testUrl = new URL(env.DATABASE_URL);
    testUrl.pathname = `/${databaseName}`;
    // Remove conflicting database options rather than relying on parser precedence.
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
    if (generation.signal) {
      const error = new Error(`Roster test schema generation was terminated by signal ${generation.signal}.`);
      error.signal = generation.signal;
      error.exitCode = generation.status ?? 1;
      throw error;
    }
    if (generation.status !== 0) {
      const exitCode = generation.status ?? 1;
      const error = new Error(
        `Failed to generate the application schema for roster tests (exit code ${exitCode}).`,
      );
      error.exitCode = exitCode;
      throw error;
    }
    const migrations = (await fs.readdir(migrationsDir)).filter((name) => name.endsWith(".sql"));
    if (migrations.length !== 1) {
      throw new Error("Expected exactly one initial migration from the application schema.");
    }

    const fixture = new Client({ connectionString: testUrl.toString() });
    let fixtureError;
    try {
      await fixture.connect();
      const databaseCheck = await fixture.query("select current_database() as name");
      const connectedDatabase = databaseCheck?.rows?.[0]?.name;
      if (
        typeof connectedDatabase !== "string" ||
        connectedDatabase !== databaseName
      ) {
        throw new Error("Refusing to apply fixtures outside the generated test database.");
      }
      await fixture.query(await fs.readFile(path.join(migrationsDir, migrations[0]), "utf8"));
    } catch (error) {
      fixtureError = error;
    } finally {
      try {
        await fixture.end();
      } catch (closeError) {
        if (fixtureError) {
          throw new AggregateError(
            [fixtureError, closeError],
            "Fixture setup failed and closing its connection also failed.",
            { cause: fixtureError },
          );
        }
        throw closeError;
      }
    }
    if (fixtureError) throw fixtureError;

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
    const testProcess = spawn(process.execPath, [output], {
      cwd: path.dirname(directory),
      env: testEnv,
      stdio: "inherit",
    });
    if (testProcess.error) throw testProcess.error;
    if (testProcess.signal) {
      const error = new Error(
        `Roster test process was terminated by signal ${testProcess.signal}.`,
      );
      error.exitCode = testProcess.status ?? 1;
      error.signal = testProcess.signal;
      throw error;
    }
    result = testProcess.status === 0 ? 0 : testProcess.status ?? 1;
  } catch (error) {
    operationError = error;
  }

  const cleanupErrors = [];
  const attemptCleanup = async (cleanup) => {
    try {
      await cleanup();
    } catch (error) {
      cleanupErrors.push(error);
    }
  };

  if (created) {
    // Attempt each cleanup independently so one failure cannot skip the rest.
    // Terminate only connections to this generated test database.
    await attemptCleanup(() => admin.query(
      "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
      [databaseName],
    ));
    await attemptCleanup(() => admin.query(`DROP DATABASE "${databaseName}"`));
  }
  await attemptCleanup(() => admin.end());
  if (workingDir) {
    await attemptCleanup(() => fs.rm(workingDir, { recursive: true, force: true }));
  }

  if (cleanupErrors.length > 0 && (operationError || result !== 0)) {
    const primaryError = operationError ?? Object.assign(
      new Error(`Roster test process exited with status ${result}.`),
      { exitCode: result },
    );
    throw new AggregateError(
      [primaryError, ...cleanupErrors],
      "Roster test operation failed and cleanup also failed.",
      { cause: primaryError },
    );
  }
  if (operationError) throw operationError;
  if (cleanupErrors.length === 1) throw cleanupErrors[0];
  if (cleanupErrors.length > 1) {
    throw new AggregateError(cleanupErrors, "Roster test cleanup failed.", {
      cause: cleanupErrors[0],
    });
  }
  return result;
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
