import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const workflowPath = path.join(repositoryRoot, ".github/workflows/release.yml");
const eligibilityScript = path.join(repositoryRoot, ".github/scripts/verify-tagged-commit.sh");

function git(directory, ...args) {
  return execFileSync("git", args, {
    cwd: directory,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

async function createRepository(t) {
  const directory = await mkdtemp(path.join(tmpdir(), "release-gate-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));

  const remote = path.join(directory, "origin.git");
  const checkout = path.join(directory, "checkout");
  git(directory, "init", "--bare", "--quiet", remote);
  await mkdir(checkout);
  git(checkout, "init", "--initial-branch=main", "--quiet");
  git(checkout, "config", "user.name", "Release gate test");
  git(checkout, "config", "user.email", "release-gate-test@example.invalid");
  await writeFile(path.join(checkout, "tracked.txt"), "main\n");
  git(checkout, "add", "tracked.txt");
  git(checkout, "commit", "--quiet", "-m", "main commit");
  git(checkout, "remote", "add", "origin", remote);
  git(checkout, "push", "--quiet", "--set-upstream", "origin", "main");
  const mainCommit = git(checkout, "rev-parse", "HEAD");

  git(checkout, "checkout", "--quiet", "-b", "unmerged-release");
  await writeFile(path.join(checkout, "tracked.txt"), "unmerged\n");
  git(checkout, "commit", "--quiet", "-am", "unmerged commit");
  const unmergedCommit = git(checkout, "rev-parse", "HEAD");

  return { directory, checkout, mainCommit, unmergedCommit };
}

function runEligibility(checkout, commit) {
  return spawnSync("bash", [eligibilityScript], {
    cwd: checkout,
    encoding: "utf8",
    env: { ...process.env, GITHUB_SHA: commit },
  });
}

test("accepts a tagged commit that is reachable from main", async (t) => {
  const repository = await createRepository(t);
  const result = runEligibility(repository.checkout, repository.mainCommit);

  assert.equal(result.status, 0, result.stderr);
});

test("rejects an unmerged tagged commit before the release command can run", async (t) => {
  const repository = await createRepository(t);
  const releaseMarker = path.join(repository.directory, "release-command-ran");
  const result = spawnSync(
    "bash",
    [
      "-e",
      "-c",
      'bash "$ELIGIBILITY_SCRIPT"\n: > "$RELEASE_MARKER"',
    ],
    {
      cwd: repository.checkout,
      encoding: "utf8",
      env: {
        ...process.env,
        GITHUB_SHA: repository.unmergedCommit,
        ELIGIBILITY_SCRIPT: eligibilityScript,
        RELEASE_MARKER: releaseMarker,
      },
    },
  );

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /not reachable from main/);
  await assert.rejects(readFile(releaseMarker), { code: "ENOENT" });
});

test("the release job runs and requires the eligibility test before publishing", async () => {
  const workflow = await readFile(workflowPath, "utf8");
  const releaseJobStart = workflow.indexOf("\n  release:\n");
  assert.notEqual(releaseJobStart, -1, "the release job exists");
  const releaseJob = workflow.slice(releaseJobStart);
  const gateStep = releaseJob.indexOf("run: bash .github/scripts/verify-tagged-commit.sh");
  const publishStep = releaseJob.indexOf("run: gh release create");
  const gateStepStart = releaseJob.indexOf("- name: Verify tagged commit is merged to main");
  const publishStepStart = releaseJob.indexOf("- name: Publish only after live isolation succeeds");

  assert.match(workflow, /release-gate-validation:[\s\S]*?node --test \.github\/workflows\/release-gate\.test\.mjs/);
  assert.match(
    releaseJob,
    /needs: \[live-database-isolation, release-gate-validation, workflow-lint\]/,
  );
  assert.ok(
    gateStepStart >= 0 && publishStepStart > gateStepStart &&
      gateStep >= gateStepStart && publishStep > publishStepStart,
    "tag eligibility is checked before publishing",
  );
  assert.doesNotMatch(
    releaseJob.slice(gateStepStart, publishStepStart),
    /^\s*(?:if|continue-on-error):/m,
    "the eligibility step must not be skipped or ignored",
  );
});

test("GitHub Actions workflows are linted in CI and block release on failure", async () => {
  const workflow = await readFile(workflowPath, "utf8");
  const lintJobStart = workflow.indexOf("\n  workflow-lint:\n");
  const releaseJobStart = workflow.indexOf("\n  release:\n");
  assert.ok(lintJobStart >= 0 && releaseJobStart > lintJobStart);
  const lintJob = workflow.slice(lintJobStart, releaseJobStart);

  assert.match(lintJob, /name: Lint GitHub Actions workflows/);
  assert.match(
    lintJob,
    /go install github\.com\/rhysd\/actionlint\/cmd\/actionlint@v1\.7\.12/,
  );
  assert.match(lintJob, /"\$\(go env GOPATH\)\/bin\/actionlint"/);
  assert.match(
    lintJob,
    /ACTIONLINT_BIN="\$\(go env GOPATH\)\/bin\/actionlint" node --test \.github\/workflows\/actionlint-negative\.test\.mjs/,
  );
});