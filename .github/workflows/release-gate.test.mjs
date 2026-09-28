import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const workflowPath = path.join(repositoryRoot, ".github/workflows/release.yml");
const independentLintPath = path.join(repositoryRoot, ".github/workflows/validate-workflows.yml");
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

function runEligibilityBeforeRelease(checkout, commit, releaseMarker) {
  return spawnSync(
    "bash",
    [
      "-e",
      "-c",
      'bash "$ELIGIBILITY_SCRIPT"\n: > "$RELEASE_MARKER"',
    ],
    {
      cwd: checkout,
      encoding: "utf8",
      env: {
        ...process.env,
        GITHUB_SHA: commit,
        ELIGIBILITY_SCRIPT: eligibilityScript,
        RELEASE_MARKER: releaseMarker,
      },
    },
  );
}

test("accepts a tagged commit that is reachable from main", async (t) => {
  const repository = await createRepository(t);
  const result = runEligibility(repository.checkout, repository.mainCommit);

  assert.equal(result.status, 0, result.stderr);
});

test("rejects an unmerged tagged commit before the release command can run", async (t) => {
  const repository = await createRepository(t);
  const releaseMarker = path.join(repository.directory, "release-command-ran");
  const result = runEligibilityBeforeRelease(
    repository.checkout,
    repository.unmergedCommit,
    releaseMarker,
  );

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /not reachable from main/);
  await assert.rejects(readFile(releaseMarker), { code: "ENOENT" });
});

test("rejects a tag before release when origin/main cannot be fetched, even with a cached main", async (t) => {
  const repository = await createRepository(t);
  git(repository.checkout, "update-ref", "refs/remotes/origin/main", repository.mainCommit);
  assert.equal(git(repository.checkout, "rev-parse", "refs/remotes/origin/main"), repository.mainCommit);
  git(repository.checkout, "remote", "set-url", "origin", path.join(repository.directory, "missing-origin.git"));
  const releaseMarker = path.join(repository.directory, "release-command-ran");

  const result = runEligibilityBeforeRelease(repository.checkout, repository.mainCommit, releaseMarker);

  assert.notEqual(result.status, 0, "a failed fetch must stop the release gate");
  assert.match(result.stderr, /does not appear to be a git repository|Could not read from remote repository/);
  await assert.rejects(readFile(releaseMarker), { code: "ENOENT" });
});

test("the release job requires API, web, and other checks before publishing a tag", async () => {
  const workflow = await readFile(workflowPath, "utf8");
  const releaseJobStart = workflow.indexOf("\n  release:\n");
  assert.notEqual(releaseJobStart, -1, "the release job exists");
  const releaseJob = workflow.slice(releaseJobStart);
  const gateStep = releaseJob.indexOf("run: bash .github/scripts/verify-tagged-commit.sh");
  const publishStep = releaseJob.indexOf("run: gh release create");
  const gateStepStart = releaseJob.indexOf("- name: Verify tagged commit is merged to main");
  const publishStepStart = releaseJob.indexOf("- name: Publish only after all validation jobs succeed");

  assert.match(workflow, /release-gate-validation:[\s\S]*?node --test \.github\/workflows\/release-gate\.test\.mjs/);
  assert.match(
    releaseJob,
    /^    if: github\.event_name == 'push' && startsWith\(github\.ref, 'refs\/tags\/v'\)$/m,
    "only a push of a release tag can publish",
  );
  const needs = releaseJob.match(/^    needs: \[([^\]]+)\]$/m)?.[1].split(",").map((job) => job.trim());
  assert.ok(needs, "the release job declares its prerequisites");
  for (const job of [
    "api-validation",
    "web-validation",
    "live-database-isolation",
    "release-gate-validation",
    "workflow-lint",
  ]) {
    assert.ok(workflow.includes(`\n  ${job}:\n`), `${job} exists`);
    assert.ok(needs.includes(job), `${job} must succeed before gh release create`);
  }
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

test("an independent workflow lints pull requests and still blocks tag releases on failure", async () => {
  const workflow = await readFile(workflowPath, "utf8");
  const independentLint = await readFile(independentLintPath, "utf8");
  const lintJobStart = workflow.indexOf("\n  workflow-lint:\n");
  const releaseJobStart = workflow.indexOf("\n  release:\n");
  assert.ok(lintJobStart >= 0 && releaseJobStart > lintJobStart);
  const lintJob = workflow.slice(lintJobStart, releaseJobStart);

  assert.match(lintJob, /name: Lint GitHub Actions workflows/);
  assert.match(
    lintJob,
    /^    if: github\.event_name == 'push' && startsWith\(github\.ref, 'refs\/tags\/v'\)$/m,
    "the release workflow calls the shared lint job only for tags",
  );
  assert.match(lintJob, /^    uses: \.\/\.github\/workflows\/validate-workflows\.yml$/m);
  assert.match(
    independentLint,
    /^on:\n  pull_request:\n  push:\n    branches: \[main\]\n  workflow_call:$/m,
    "the independent workflow runs on pull requests even when release.yml is invalid",
  );
  assert.doesNotMatch(workflow, /go install github\.com\/rhysd\/actionlint/);
  assert.match(
    independentLint,
    /go install github\.com\/rhysd\/actionlint\/cmd\/actionlint@v1\.7\.12/,
  );
  assert.match(independentLint, /"\$\(go env GOPATH\)\/bin\/actionlint"/);
  assert.match(
    independentLint,
    /ACTIONLINT_BIN="\$\(go env GOPATH\)\/bin\/actionlint" node --test \.github\/workflows\/actionlint-negative\.test\.mjs/,
  );
  assert.match(
    independentLint,
    /- name: Install ShellCheck\n        run: sudo apt-get update && sudo apt-get install -y shellcheck/,
  );
  assert.match(
    independentLint,
    /- name: Lint release shell scripts\n        run: shellcheck \.github\/scripts\/\*\.sh/,
  );
});