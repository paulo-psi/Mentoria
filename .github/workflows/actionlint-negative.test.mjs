import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

async function lintFixture(t, source) {
  const directory = await mkdtemp(path.join(tmpdir(), "actionlint-negative-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const fixture = path.join(directory, "broken.yml");
  await writeFile(fixture, source);

  assert.ok(process.env.ACTIONLINT_BIN, "ACTIONLINT_BIN must point to the installed actionlint binary");
  const result = spawnSync(process.env.ACTIONLINT_BIN, ["-no-color", fixture], {
    encoding: "utf8",
  });
  assert.ifError(result.error);
  assert.notEqual(result.status, 0, "actionlint must reject the fixture");
  return `${result.stdout}\n${result.stderr}`;
}

test("actionlint rejects invalid workflow YAML", async (t) => {
  const diagnostic = await lintFixture(t, "name: Broken YAML\non: push\njobs:\n  broken: [unterminated\n");
  assert.match(diagnostic, /could not parse as YAML|yaml: line \d+:/i);
});

test("actionlint rejects invalid workflow expressions", async (t) => {
  const diagnostic = await lintFixture(
    t,
    'name: Broken Expression\non: push\njobs:\n  broken:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo "${{ github.ref == }}"\n',
  );
  assert.match(diagnostic, /expression|unexpected token|unexpected character|expected .*operand/i);
});