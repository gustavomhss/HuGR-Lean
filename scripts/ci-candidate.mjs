import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

// This manifest records identity validation, not the outcome of later CI gates.
const env = process.env;
const errors = [];
const shaPattern = /^[0-9a-f]{40}$/;
const candidate = env.CANDIDATE_SHA ?? null;
const githubSha = env.GITHUB_SHA ?? null;
const workflowSha = env.GITHUB_WORKFLOW_SHA ?? null;
let checkoutSha = null;

for (const [name, value] of [
  ["candidate-sha", candidate], ["github-sha", githubSha], ["workflow-sha", workflowSha],
]) {
  if (!value) errors.push(`${name}-missing`);
  else if (value.length !== 40 || !shaPattern.test(value)) errors.push(`${name}-invalid: expected 40 lowercase hexadecimal characters`);
}
if (env.GITHUB_EVENT_NAME !== "workflow_dispatch") errors.push("event-invalid: expected workflow_dispatch");
if (env.GITHUB_REPOSITORY !== "gustavomhss/HuGR-Lean") errors.push("repository-invalid: expected gustavomhss/HuGR-Lean");

try {
  checkoutSha = execFileSync("git", ["rev-parse", "--verify", "HEAD"], {
    encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 10_000,
  }).trim();
  if (checkoutSha.length !== 40 || !shaPattern.test(checkoutSha)) errors.push("checkout-sha-invalid");
} catch (error) {
  errors.push(`checkout-head-unavailable: ${error.message}`);
}
if (candidate !== githubSha) errors.push("github-sha-mismatch: candidate does not equal github.sha");
if (candidate !== workflowSha) errors.push("workflow-sha-mismatch: candidate does not equal github.workflow_sha");
if (candidate !== checkoutSha) errors.push("checkout-sha-mismatch: candidate does not equal git HEAD");

const manifest = {
  schemaVersion: 1,
  scope: "candidate-identity-only",
  status: errors.length ? "rejected" : "verified",
  candidateSha: candidate,
  githubSha,
  workflowSha,
  checkoutSha,
  repository: env.GITHUB_REPOSITORY ?? null,
  event: env.GITHUB_EVENT_NAME ?? null,
  workflowRef: env.GITHUB_WORKFLOW_REF ?? null,
  runId: env.GITHUB_RUN_ID ?? null,
  runAttempt: env.GITHUB_RUN_ATTEMPT ?? null,
  runnerOs: env.RUNNER_OS ?? null,
  platform: process.platform,
  arch: process.arch,
  node: process.version,
  recordedAt: new Date().toISOString(),
  errors,
};
try {
  if (!env.CI_PROVENANCE_PATH) throw new Error("provenance-path-missing");
  writeFileSync(env.CI_PROVENANCE_PATH, `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
} catch (error) {
  errors.push(`provenance-write-failed: ${error.message}`);
}
if (errors.length) {
  console.error(`Candidate identity rejected:\n${errors.map((error) => `- ${error}`).join("\n")}`);
  process.exitCode = 1;
} else {
  console.log(`Candidate identity verified: ${checkoutSha} (${process.platform}/${process.arch})`);
}
