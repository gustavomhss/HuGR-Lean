import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import plugin, { createAfterHook, createRecallTool } from "../src/opencode/index.js";
import { RawStore, recallLines } from "../src/raw/index.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const RECOVERY = /\n\[full output: lean recall ([a-f0-9]{32})\]$/;
// Unicode, CRLF, ANSI, NUL and a lone surrogate must all come back byte-identical.
const original = `\x1b[31mstart\x1b[0m café 🔥\r\n${Array.from({ length: 900 }, (_, i) => `step ${i} \u0000 ok ${"·".repeat(i % 30)}`).join("\n")}\nerror: boom \ud800 here\n  at frame (x.ts:1:1)\n${Array.from({ length: 900 }, (_, i) => `tail ${i}`).join("\r\n")}`;

async function directory(t: TestContext): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "hugr-lean-recall-"));
  t.after(() => rm(path, { recursive: true, force: true }));
  return path;
}

test("summary ends with a recovery line and recall returns the exact original bytes", async (t) => {
  const dir = await directory(t);
  const hooks = await plugin({}, { raw: { directory: dir } });
  const output = { title: "t", output: original, metadata: { exit: 1, truncated: false } };
  await hooks["tool.execute.after"]!({ tool: "bash", args: { command: "cd /repo && make 2>&1 | tee log" } }, output);
  assert.ok(Buffer.byteLength(output.output) < Buffer.byteLength(original));
  assert.ok(output.output.includes("error: boom \ud800 here\n  at frame (x.ts:1:1)"));
  const id = RECOVERY.exec(output.output)?.[1];
  assert.ok(id, "summary must end with the recovery line");
  assert.equal(output.metadata.exit, 1);
  const tool = hooks.tool!.lean_recall;
  const recalled = await tool.execute({ id, lines: "" });
  assert.equal(recalled, original);
  assert.ok(Buffer.from(recalled, "utf8").equals(Buffer.from(original, "utf8")));
  assert.equal(await tool.execute({ id, lines: "2-3" }), original.split("\n").slice(1, 3).join("\n"));
  assert.equal(await new RawStore({ directory: dir }).get(id), original);
  const tsx = join(root, "node_modules/tsx/dist/cli.mjs");
  const { stdout } = await promisify(execFile)(process.execPath, [tsx, join(root, "src/cli/index.ts"), "recall", id, "--directory", dir], { encoding: "buffer", maxBuffer: 1 << 24 });
  assert.ok(stdout.equals(Buffer.from(original, "utf8")), "CLI recall must be byte-identical");
  const ranged = await promisify(execFile)(process.execPath, [tsx, join(root, "src/cli/index.ts"), "recall", id, "--lines", "903", "--directory", dir]);
  assert.equal(ranged.stdout, original.split("\n")[902]);
});

test("recall reports unknown ids, rejects bad ids and ranges", async (t) => {
  const tool = createRecallTool(new RawStore({ directory: await directory(t) }));
  assert.match(await tool.execute({ id: "a".repeat(32), lines: "" }), /^unavailable/);
  await assert.rejects(tool.execute({ id: "../etc/passwd" }), /Invalid raw identifier/);
  assert.throws(() => recallLines("a\nb", "3-1"), RangeError);
  assert.equal(recallLines("a\nb\nc", "2-"), "b\nc");
  assert.equal(recallLines("a\nb\nc", "2"), "b");
});

test("plugin registers lean_recall only when summaries can be recovered", async () => {
  assert.ok((await plugin({}, {})).tool?.lean_recall);
  assert.equal((await plugin({}, { mode: "lossless" })).tool, undefined);
  assert.equal((await plugin({}, { raw: false })).tool, undefined);
  assert.equal((await plugin({}, { enabled: false })).tool, undefined);
  for (const value of [{ mode: "fast" }, { summarize: { headBytes: -1 } }, { summarize: { typo: 1 } }, { raw: { evict: "yes" } }]) assert.deepEqual(await plugin({}, value), {});
});

test("lossless mode, raw:false and storage failure never emit a lossy summary", async () => {
  const input = { tool: "bash", args: { command: "make" } };
  for (const [options, raw] of [[{ mode: "lossless" as const }, undefined], [{ raw: false as const }, undefined],
    [{}, { put: async () => { throw new Error("full"); } }]] as const) {
    const output = { output: original, metadata: { exit: 1, truncated: false } };
    await createAfterHook(options, raw ? { raw } : {})(input, output);
    assert.ok(!RECOVERY.test(output.output));
    assert.ok(!output.output.includes("lines omitted"));
  }
});

test("read and webfetch summaries in the plugin carry the recovery line; small outputs do not", async () => {
  const stored: string[] = [];
  const raw = { put: async (text: string) => { stored.push(text); return "b".repeat(32); } };
  const hook = createAfterHook({}, { raw });
  const page = { output: Array.from({ length: 3000 }, (_, i) => `para ${i} ${"text ".repeat(8)}`).join("\n"), metadata: {} };
  const before = page.output;
  await hook({ tool: "webfetch", args: { url: "https://example.com" } }, page);
  assert.ok(page.output.endsWith(`\n[full output: lean recall ${"b".repeat(32)}]`));
  assert.deepEqual(stored, [before]);
  const small = { output: "hello", metadata: { exit: 0, truncated: false } };
  await hook({ tool: "bash", args: { command: "echo hello" } }, small);
  assert.equal(small.output, "hello");
  assert.equal(stored.length, 1);
});

test("opt-in eviction admits new records by removing the oldest; default still rejects", async (t) => {
  const dir = await directory(t);
  const one = Buffer.byteLength(JSON.stringify({ format: "hugr-lean/raw/2", id: "0".repeat(32), createdAt: Date.now(), expiresAt: Date.now() + 1, text: "x".repeat(1000) }));
  const store = new RawStore({ directory: dir, maxBytes: one * 2 + 10, evict: true });
  const first = await store.put("x".repeat(1000));
  const second = await store.put("y".repeat(1000));
  const third = await store.put("z".repeat(1000));
  assert.equal(await store.get(first), undefined);
  assert.equal(await store.get(second), "y".repeat(1000));
  assert.equal(await store.get(third), "z".repeat(1000));
  await assert.rejects(new RawStore({ directory: dir, maxBytes: one * 2 + 10 }).put("w".repeat(1000)), /store is full/);
  assert.throws(() => new RawStore({ evict: "yes" as never }), TypeError);
});

test("recall returns the pre-rewrite original even when a lossless profile reduced the output first", async (t) => {
  const store = new RawStore({ directory: await directory(t) });
  const reduced = original.split("\n").slice(5).join("\n");
  const filter = () => ({ status: "reduced" as const, profile: "controlled", reason: "controlled", replacement: reduced,
    inputBytes: Buffer.byteLength(original), outputBytes: Buffer.byteLength(reduced) });
  const output = { output: original, metadata: { exit: 1, truncated: false } };
  await createAfterHook({}, { raw: store, filter })({ tool: "bash", args: { command: "make" } }, output);
  const id = RECOVERY.exec(output.output)?.[1];
  assert.ok(id);
  assert.equal(await store.get(id), original);
});

test("scan reuse never hides a record that changed after it was validated", async (t) => {
  const dir = await directory(t);
  const store = new RawStore({ directory: dir });
  const id = await store.put("kept");
  assert.equal((await store.list()).length, 1);
  await writeFile(join(dir, `${id}.json`), "{\"format\":\"corrupt\"}", { mode: 0o600 });
  await assert.rejects(store.list(), /Invalid raw record/);
});
