import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const smokeScript = path.join(repositoryRoot, ".github/scripts/smoke-built-api.sh");
const builtApi = path.join(repositoryRoot, "artifacts/api-server/dist/index.mjs");
const fakeDatabaseUrl = "postgresql://roster_ci:local-only@127.0.0.1:5432/roster_ci";

function runSmoke(env) {
  return spawnSync("bash", [smokeScript], {
    cwd: repositoryRoot,
    env: { ...process.env, NODE_ENV: "test", REPLIT_DEPLOYMENT: "", ...env },
    encoding: "utf8",
    timeout: 120_000,
    maxBuffer: 4 * 1024 * 1024,
  });
}

async function listen(server, port) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
}

async function close(server) {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

function isDisposableDatabase(value) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "postgresql:" && url.hostname === "127.0.0.1" &&
      url.username === "roster_ci" && url.pathname === "/roster_ci" &&
      !url.search && !url.hash;
  } catch {
    return false;
  }
}

test("an occupied smoke port is rejected before schema preparation", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "api-smoke-port-"));
  const marker = path.join(directory, "schema-started");
  const blocker = createServer();
  try {
    await writeFile(path.join(directory, "pnpm"), `#!/usr/bin/env bash
printf 'schema started\\n' > "$SMOKE_SCHEMA_MARKER"
exit 97
`, { mode: 0o755 });
    await listen(blocker, 0);
    const address = blocker.address();
    assert.ok(address && typeof address !== "string");

    const result = runSmoke({
      DATABASE_URL: fakeDatabaseUrl,
      API_SMOKE_PORT: String(address.port),
      PATH: `${directory}${path.delimiter}${process.env.PATH}`,
      SMOKE_SCHEMA_MARKER: marker,
    });
    assert.ifError(result.error);
    assert.notEqual(result.status, 0, "the occupied port must make the smoke command fail");
    assert.match(result.stderr, /EADDRINUSE/);
    await assert.rejects(access(marker), { code: "ENOENT" });
  } finally {
    if (blocker.listening) await close(blocker);
    await rm(directory, { recursive: true, force: true });
  }
});

test("an invalid health response stops the built API and frees its port", async (t) => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!isDisposableDatabase(databaseUrl)) {
    if (process.env.CI) assert.fail("CI must provide the disposable local roster_ci database");
    t.skip("requires a disposable local roster_ci PostgreSQL database");
    return;
  }
  await access(builtApi);

  const directory = await mkdtemp(path.join(tmpdir(), "api-smoke-health-"));
  const marker = path.join(directory, "health-reached");
  const reservation = createServer();
  let serverPid;
  try {
    await listen(reservation, 0);
    const address = reservation.address();
    assert.ok(address && typeof address !== "string");
    const port = address.port;
    await close(reservation);

    const curl = spawnSync("sh", ["-c", "command -v curl"], { encoding: "utf8" });
    assert.ifError(curl.error);
    assert.equal(curl.status, 0);
    const realCurl = curl.stdout.trim();
    assert.ok(path.isAbsolute(realCurl));
    await writeFile(path.join(directory, "curl"), `#!/usr/bin/env bash
set -euo pipefail
"$SMOKE_REAL_CURL" "$@" >/dev/null
printf 'health reached\\n' > "$SMOKE_HEALTH_MARKER"
printf '%s\\n' '{"status":"invalid","database":"connected"}'
`, { mode: 0o755 });

    const result = runSmoke({
      DATABASE_URL: databaseUrl,
      API_SMOKE_PORT: String(port),
      PATH: `${directory}${path.delimiter}${process.env.PATH}`,
      SMOKE_REAL_CURL: realCurl,
      SMOKE_HEALTH_MARKER: marker,
    });
    const pidMatch = result.stderr.match(/Built API smoke server PID: (\d+)/);
    if (pidMatch) serverPid = Number(pidMatch[1]);
    assert.ifError(result.error);
    assert.notEqual(result.status, 0, "the invalid response must fail the smoke command");
    await access(marker);
    assert.match(result.stderr, /Unexpected API health response/);
    assert.ok(pidMatch, "the built API was launched");
    assert.throws(() => process.kill(serverPid, 0), { code: "ESRCH" }, "the launched API process was reaped");

    const probe = createServer();
    await listen(probe, port);
    await close(probe);
  } finally {
    if (reservation.listening) await close(reservation);
    if (serverPid) {
      try {
        process.kill(serverPid, "SIGKILL");
      } catch (error) {
        if (error.code !== "ESRCH") throw error;
      }
    }
    await rm(directory, { recursive: true, force: true });
  }
});