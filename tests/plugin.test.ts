import assert from "node:assert/strict";
import { test } from "node:test";
import { createAfterHook } from "../src/opencode/index.js";
import plugin, * as namespace from "../src/index.js";
import type { FilterResult } from "../src/types.js";

const summary = "test result: ok. 80 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s";
const cargo = `    Finished \`test\` profile [unoptimized + debuginfo] target(s) in 0.01s\n     Running unittests src/lib.rs (target/debug/deps/test-0000)\n\nrunning 80 tests\n${Array.from({ length: 80 }, (_, i) => `test case_${i} ... ok\n`).join("")}\n${summary}\n\n`;
const input = { tool: "bash", args: { command: "cargo test" } };
const native = () => ({ title: "test", output: cargo, metadata: { exit: 0, truncated: false, output: cargo }, attachments: ["unchanged"] });

test("production registry reduces native output and leaves all host metadata exact", async () => {
  const output = native(), metadata = structuredClone(output.metadata), attachments = structuredClone(output.attachments);
  await createAfterHook()(input, output);
  assert.ok(output.output.length < cargo.length);
  assert.ok(output.output.includes(summary));
  assert.deepEqual(output.metadata, metadata);
  assert.deepEqual(output.attachments, attachments);
  assert.equal(output.title, "test");
  assert.equal(input.args.command, "cargo test");
});

test("plugin root exports only default; tuple options are immutable snapshots", async () => {
  assert.deepEqual(Object.keys(namespace), ["default"]);
  const options = { excludeCommands: ["cargo"] };
  const hooks = await plugin({}, options);
  options.excludeCommands.length = 0;
  const output = native(); await hooks["tool.execute.after"]!(input, output); assert.equal(output.output, cargo);
  const other = native(); await (await plugin({}))["tool.execute.after"]!(input, other); assert.notEqual(other.output, cargo);
});

test("raw retention requires both UTF-8 material thresholds", async () => {
  let calls = 0;
  const raw = { put: async () => { calls++; return "id"; } };
  for (const [before, saved, expected] of [[10240, 1023, 0], [10240, 1024, 1], [20480, 1024, 0]] as const) {
    calls = 0;
    const original = "x".repeat(before), replacement = "x".repeat(before - saved);
    const output = { output: original, metadata: { exit: 0, truncated: false } };
    await createAfterHook({ raw: {} }, { raw, filter: () => ({ status: "reduced", profile: "controlled", replacement, inputBytes: before, outputBytes: before - saved, reason: "controlled" }) })(input, output);
    assert.equal(calls, expected);
  }
});

test("native failed, missing, truncated and unknown facts keep original", async () => {
  for (const metadata of [{ exit: 101, truncated: false }, { exit: null, truncated: false }, { exit: 0, truncated: true }, { exit: 0 }, undefined]) {
    const output = { output: cargo, metadata };
    await createAfterHook()(input, output);
    assert.equal(output.output, cargo);
  }
});

test("disabled, excluded, unsupported tool and invalid options preserve output", async () => {
  for (const options of [{ enabled: false }, { excludeCommands: ["cargo"] }]) {
    const output = native(); await createAfterHook(options)(input, output); assert.equal(output.output, cargo);
  }
  for (const command of [" cargo test", "cargo\ttest"]) {
    const excluded = native(); await createAfterHook({ excludeCommands: ["cargo"] })({ tool: "bash", args: { command } }, excluded); assert.equal(excluded.output, cargo);
  }
  const output = native(); await createAfterHook()({ ...input, tool: "read" }, output); assert.equal(output.output, cargo);
  for (const value of [null, [], { raw: true }, { enabled: "yes" }, { typo: true }, { maxInputBytes: 12 }]) assert.deepEqual(await plugin({}, value), {});
});

test("exceptions and inconsistent engine replacements fail open", async () => {
  const attempts = [() => { throw new Error("injected engine failure"); }, () => ({ status: "reduced", replacement: "fake", profile: "cargo-test", inputBytes: 1, outputBytes: 4, reason: "injected" }) as FilterResult];
  for (const process of attempts) { const output = native(); await createAfterHook({}, { filter: process })(input, output); assert.equal(output.output, cargo); }
});

test("raw is off by default, material changes store exact text, storage error preserves original", async () => {
  const stored: string[] = [];
  const raw = { put: async (text: string) => { stored.push(text); return "id"; } };
  await createAfterHook({}, { raw })(input, native()); assert.deepEqual(stored, []);
  const output = native(); await createAfterHook({ raw: {} }, { raw })(input, output); assert.deepEqual(stored, [cargo]);
  const failed = native(); await createAfterHook({ raw: {} }, { raw: { put: async () => { throw new Error("full store"); } } })(input, failed); assert.equal(failed.output, cargo);
});
