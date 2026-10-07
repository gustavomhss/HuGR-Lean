import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("../scripts/ci-candidate.mjs", import.meta.url));
type Manifest = {
  schemaVersion: number; scope: string; status: string;
  candidateSha: string | null; githubSha: string | null; workflowSha: string | null;
  checkoutSha: string | null; repository: string; event: string;
  runId: string; runAttempt: string; runnerOs: string;
  platform: string; arch: string; node: string; recordedAt: string; errors: string[];
};
function fixture(t: TestContext, committed = true) {
  const root = mkdtempSync(join(tmpdir(), "lean-ci-candidate-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  // Keep Git context controlled even when these tests run inside Actions.
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith("GIT_") && !key.startsWith("GITHUB_") &&
        !key.startsWith("RUNNER_") && !key.startsWith("CI_") && key !== "CANDIDATE_SHA") env[key] = value;
  }
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  git("init", "--object-format=sha1");
  let sha = "a".repeat(40);
  if (committed) {
    writeFileSync(join(root, "candidate.txt"), "candidate\n");
    git("add", "candidate.txt");
    git("-c", "user.name=CI Fixture", "-c", "user.email=ci@example.invalid", "-c", "commit.gpgsign=false", "commit", "-m", "Create candidate fixture");
    sha = git("rev-parse", "HEAD");
  }
  const provenance = join(root, "provenance.json");
  Object.assign(env, {
    CANDIDATE_SHA: sha, GITHUB_SHA: sha, GITHUB_WORKFLOW_SHA: sha,
    GITHUB_REPOSITORY: "gustavomhss/HuGR-Lean", GITHUB_EVENT_NAME: "workflow_dispatch",
    GITHUB_RUN_ID: "123", GITHUB_RUN_ATTEMPT: "2", RUNNER_OS: "fixture",
    CI_PROVENANCE_PATH: provenance,
  });
  return { root, sha, provenance, env };
}
function run(f: ReturnType<typeof fixture>, changes: NodeJS.ProcessEnv = {}) {
  const env = { ...f.env, ...changes };
  for (const key of Object.keys(env)) if (env[key] === undefined) delete env[key];
  const result = spawnSync(process.execPath, [script], { cwd: f.root, env, encoding: "utf8", timeout: 20_000 });
  assert.equal(result.error, undefined);
  return result;
}
function manifest(f: ReturnType<typeof fixture>): Manifest {
  const text = readFileSync(f.provenance, "utf8");
  assert.ok(text.length > 0, "Provenance must not be empty");
  const record = JSON.parse(text) as Manifest;
  assert.equal(record.schemaVersion, 1);
  assert.equal(record.scope, "candidate-identity-only");
  assert.equal(record.platform, process.platform);
  assert.equal(record.arch, process.arch);
  assert.equal(record.node, process.version);
  assert.ok(Number.isFinite(Date.parse(record.recordedAt)));
  return record;
}

test("matching real checkout passes and writes runtime provenance", (t) => {
  const f = fixture(t), result = run(f), record = manifest(f);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Candidate identity verified:/);
  assert.equal(record.status, "verified");
  for (const sha of [record.candidateSha, record.githubSha, record.workflowSha, record.checkoutSha]) assert.equal(sha, f.sha);
  assert.equal(record.repository, "gustavomhss/HuGR-Lean");
  assert.equal(record.event, "workflow_dispatch");
  assert.equal(record.runId, "123");
  assert.equal(record.runAttempt, "2");
  assert.equal(record.runnerOs, "fixture");
  assert.deepEqual(record.errors, []);
});

const cases: [string, NodeJS.ProcessEnv, string][] = [
  ["missing candidate", { CANDIDATE_SHA: undefined }, "candidate-sha-missing"],
  ["empty candidate", { CANDIDATE_SHA: "" }, "candidate-sha-missing"],
  ["short candidate", { CANDIDATE_SHA: "abc" }, "candidate-sha-invalid"],
  ["uppercase candidate", { CANDIDATE_SHA: "A".repeat(40) }, "candidate-sha-invalid"],
  ["nonhex candidate", { CANDIDATE_SHA: "z".repeat(40) }, "candidate-sha-invalid"],
  ["newline candidate", { CANDIDATE_SHA: `${"a".repeat(40)}\n` }, "candidate-sha-invalid"],
  ["missing github SHA", { GITHUB_SHA: undefined }, "github-sha-missing"],
  ["invalid github SHA", { GITHUB_SHA: "invalid" }, "github-sha-invalid"],
  ["github SHA mismatch", { GITHUB_SHA: "0".repeat(40) }, "github-sha-mismatch"],
  ["missing workflow SHA", { GITHUB_WORKFLOW_SHA: undefined }, "workflow-sha-missing"],
  ["invalid workflow SHA", { GITHUB_WORKFLOW_SHA: "invalid" }, "workflow-sha-invalid"],
  ["workflow SHA mismatch", { GITHUB_WORKFLOW_SHA: "0".repeat(40) }, "workflow-sha-mismatch"],
  ["checkout mismatch", { CANDIDATE_SHA: "0".repeat(40), GITHUB_SHA: "0".repeat(40), GITHUB_WORKFLOW_SHA: "0".repeat(40) }, "checkout-sha-mismatch"],
  ["push event", { GITHUB_EVENT_NAME: "push" }, "event-invalid"],
  ["missing event", { GITHUB_EVENT_NAME: undefined }, "event-invalid"],
  ["wrong repository", { GITHUB_REPOSITORY: "gusmhs/HuGR-Lean" }, "repository-invalid"],
  ["missing repository", { GITHUB_REPOSITORY: undefined }, "repository-invalid"],
];
for (const [name, changes, error] of cases) test(`rejects ${name} with named error and provenance`, (t) => {
  const f = fixture(t), result = run(f, changes), record = manifest(f);
  assert.equal(result.status, 1, result.stdout);
  assert.ok(result.stderr.includes(error), result.stderr);
  assert.equal(record.status, "rejected");
  assert.ok(record.errors.some((message) => message.includes(error)), JSON.stringify(record));
  assert.equal(record.checkoutSha, f.sha);
});

test("unborn checkout rejects and records Git failure without inventing HEAD", (t) => {
  const f = fixture(t, false), result = run(f), record = manifest(f);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /checkout-head-unavailable/);
  assert.match(result.stderr, /fatal:/);
  assert.equal(record.status, "rejected");
  assert.equal(record.checkoutSha, null);
  assert.ok(record.errors.some((message) => message.includes("checkout-head-unavailable")));
});

test("missing or unwritable provenance fails instead of claiming success", (t) => {
  const f = fixture(t);
  for (const path of [undefined, join(f.root, "missing", "provenance.json")]) {
    const result = run(f, { CI_PROVENANCE_PATH: path });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /provenance-write-failed/);
    assert.equal(result.stdout, "");
    assert.equal(existsSync(f.provenance), false);
  }
});
