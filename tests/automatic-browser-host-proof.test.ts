import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
const script = fileURLToPath(new URL("../scripts/automatic-browser-host-proof.mjs", import.meta.url));
const bridge = await import(new URL("../scripts/automatic-browser-host-proof.mjs", import.meta.url).href);

test("revalidation verdict fails closed on empty or partial results", () => {
  assert.equal(bridge.revalidationPassed({ results: [] }), false);
  assert.equal(bridge.revalidationPassed({ results: [{ status: "passed" }, { status: "failed" }] }), false);
  assert.equal(bridge.revalidationPassed({ results: [{ status: "passed" }, { status: "passed" }] }), true);
});

// Synthetic stored pw-unknown case (preserved output) calibrates the CLI verdict; real runs are the executable proof.
async function storedCase(root: string): Promise<string> {
  const dir = path.join(root, "case"), args = { action: "list" }, tool = "playwright_browser_tabs";
  const call = { id: "automatic_call", type: "function", function: { name: tool, arguments: JSON.stringify(args) } };
  const before = { input: { tool, args }, output: { title: "", metadata: {}, content: [{ type: "text", text: "tabs" }] } };
  await mkdir(dir);
  await writeFile(path.join(dir, "model-2.json"), JSON.stringify({ messages: [{ role: "assistant", tool_calls: [call] }, { role: "tool", tool_call_id: call.id, content: "tabs" }] }));
  await writeFile(path.join(dir, "report.json"), JSON.stringify({ tool: { state: { status: "completed", output: "tabs" } },
    hooks: [before, { ...before, metadataSame: true, inputSame: true, untouchedBlocksSame: true }] }));
  return dir;
}

// Scripted CLI controls: only a run whose every recorded case re-validates exits 0.
test("--revalidate exits nonzero unless every recorded case re-validates", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "hugr-revalidate-"));
  try {
    const stored = await storedCase(root), missing = path.join(root, "absent-case-root");
    const entry = (status: string, caseRoot: string, attempt = 1) => ({ case: "pw-unknown", attempt, status, root: caseRoot, tool: "playwright_browser_tabs" });
    const receipts: Record<string, [object, number]> = {
      passed: [{ cases: [entry("passed", stored)] }, 0],
      retriedThenPassed: [{ cases: [entry("failed", missing), entry("passed", stored, 2)] }, 0],
      empty: [{ cases: [] }, 1], noCases: [{}, 1],
      failedInRun: [{ cases: [entry("failed", stored)] }, 1],
      noArtifacts: [{ cases: [entry("passed", missing)] }, 1],
      tampered: [{ cases: [{ ...entry("passed", stored), tool: "playwright_browser_snapshot" }] }, 1] };
    for (const [name, [receipt, status]] of Object.entries(receipts)) {
      const file = path.join(root, `${name}.json`); await writeFile(file, JSON.stringify(receipt));
      const run = spawnSync(process.execPath, [script, "--revalidate", file], { encoding: "utf8" });
      assert.equal(run.status, status, `${name}: ${run.stdout}${run.stderr}`);
      if (name !== "noCases") assert.equal(JSON.parse(await readFile(file, "utf8")).revalidations.at(-1).passed, status === 0);
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});
