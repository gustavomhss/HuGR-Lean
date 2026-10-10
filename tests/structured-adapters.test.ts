import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { filterStructured } from "../src/core/structured.js";
import { structuredFormats, type StructuredReducer } from "../src/core/structured-types.js";
import { parseOptions } from "../src/opencode/config.js";
import plugin, { createAfterHook } from "../src/opencode/index.js";

const cell = '"🔥"', original = ` ${cell} \n`;
const tiny: StructuredReducer = (text, observation) => {
  if (text.trim() !== cell || (observation.format === "accessibility-scope" && observation.scopeRef !== "node")) return undefined;
  const start = text.indexOf(cell), span = [start, start + cell.length] as const;
  return { pieces: [span], required: [span] };
};
const structuredFilter: typeof filterStructured = (observation, options) => filterStructured(observation, {
  ...options, reducers: Object.fromEntries(structuredFormats.map(format => [format, tiny])),
});
const native = (text = original) => ({ output: text, title: "host title", metadata: { exit: 0, truncated: false, extra: "keep" } });
const input = { tool: "snapshot", args: { scopeRef: "ignored", command: "unchanged", other: 0 } };
const options = { structuredTools: [{ tool: "snapshot", format: "json" as const }] };

test("structured config accepts every static format, copies and freezes nested bindings", () => {
  assert.deepEqual(parseOptions(undefined), {});
  assert.equal(parseOptions({})?.structuredTools, undefined);
  for (const format of structuredFormats) {
    const source = { structuredTools: [{ tool: "snapshot", format }] };
    const parsed = parseOptions(source)!;
    assert.deepEqual(parsed, source);
    assert.ok(Object.isFrozen(parsed) && Object.isFrozen(parsed.structuredTools) && Object.isFrozen(parsed.structuredTools![0]));
    source.structuredTools[0]!.tool = "changed";
    assert.equal(parsed.structuredTools![0]!.tool, "snapshot");
  }
  assert.deepEqual(parseOptions({ structuredTools: [] })?.structuredTools, []);
});

test("structured config refuses malformed, unknown, duplicate and bash bindings", async () => {
  for (const structuredTools of [null, {}, "snapshot", [null], [[]], [{}], [{ tool: "", format: "json" }],
    [{ tool: " ", format: "json" }], [{ tool: "bash", format: "json" }], [{ tool: 2, format: "json" }],
    [{ tool: "snapshot", format: "JSON" }], [{ tool: "snapshot" }], [{ tool: "snapshot", format: "json", extra: true }],
    [options.structuredTools[0], options.structuredTools[0]]]) {
    assert.equal(parseOptions({ structuredTools }), undefined, JSON.stringify(structuredTools));
    assert.deepEqual(await plugin({}, { structuredTools }), {});
  }
  assert.equal(parseOptions({ ...options, unknown: true }), undefined);
});

test("declared tool uses real structured core; only output text changes", async () => {
  for (const format of structuredFormats) {
    const args = { ...input, args: { ...input.args, scopeRef: "node" } }, before = structuredClone(args);
    const output = native(), metadata = output.metadata;
    await createAfterHook({ structuredTools: [{ tool: "snapshot", format }] }, { structuredFilter })(args, output);
    assert.equal(output.output, cell, format);
    assert.equal(output.title, "host title");
    assert.equal(output.metadata, metadata);
    assert.deepEqual(output.metadata, { exit: 0, truncated: false, extra: "keep" });
    assert.deepEqual(args, before);
  }
});

test("undeclared, disabled, failed or incomplete tools never enter structured filter", async () => {
  let calls = 0;
  const hook = createAfterHook(options, { structuredFilter: (observation, limits) => { calls++; return structuredFilter(observation, limits); } });
  for (const metadata of [undefined, {}, { exit: 0 }, { truncated: false }, { exit: 1, truncated: false },
    { exit: "0", truncated: false }, { exit: NaN, truncated: false }, { exit: 0, truncated: true }, { exit: 0, truncated: 0 }]) {
    const output = { output: original, title: "keep", metadata }, before = structuredClone(output);
    await hook(input, output);
    assert.deepEqual(output, before);
  }
  for (const value of [null, {}, { ...input, tool: "Snapshot" }, { ...input, tool: "unknown" }]) await hook(value, native());
  await hook(input, { output: 3, metadata: { exit: 0, truncated: false } });
  for (const config of [{}, { ...options, enabled: false }]) {
    const output = native();
    await createAfterHook(config, { structuredFilter: () => { calls++; throw new Error("unexpected"); } })(input, output);
    assert.equal(output.output, original);
  }
  assert.equal(calls, 0);
  const accepted = native(); await hook(input, accepted);
  assert.equal(calls, 1); assert.equal(accepted.output, cell);
});

test("scope reads only args.scopeRef; stale, missing and invalid refs preserve output", async () => {
  const hook = createAfterHook({ structuredTools: [{ tool: "snapshot", format: "accessibility-scope" }] }, { structuredFilter });
  for (const args of [undefined, {}, { scopeRef: "" }, { scopeRef: 3 }, { scopeRef: "stale" }]) {
    const output = { ...native(), scopeRef: "node" };
    await hook({ tool: "snapshot", scopeRef: "node", args }, output);
    assert.equal(output.output, original);
  }
  const output = native(); await hook({ tool: "snapshot", args: { scopeRef: "node" } }, output);
  assert.equal(output.output, cell);
});

test("default registry, unsupported output and structured filter failures preserve text", async () => {
  const output = native(); await createAfterHook(options)(input, output);
  assert.equal(output.output, original, "registry remains unwired until lead integration");
  for (const text of ["{broken", '{"unknown":1}', '"🔥', "", cell, "\ud800"]) {
    const result = native(text); await createAfterHook(options, { structuredFilter })(input, result);
    assert.equal(result.output, text);
  }
  const failed = native();
  await createAfterHook(options, { structuredFilter: () => { throw new Error("filter failure"); } })(input, failed);
  assert.equal(failed.output, original);
});

test("structured raw persistence keeps existing thresholds and failure preservation", async () => {
  const stored: string[] = [], raw = { put: async (text: string) => { stored.push(text); return "id"; } };
  for (const text of [original, " ".repeat(2048) + cell]) {
    const output = native(text);
    await createAfterHook({ ...options, raw: {} }, { structuredFilter, raw })(input, output);
    assert.equal(output.output, cell);
  }
  assert.deepEqual(stored, [" ".repeat(2048) + cell]);
  const output = native(stored[0]);
  await createAfterHook({ ...options, raw: {} }, { structuredFilter, raw: { put: async () => { throw new Error("store failure"); } } })(input, output);
  assert.equal(output.output, stored[0]);
});

const cli = fileURLToPath(new URL("../src/cli/index.ts", import.meta.url));
function start(args: string[]) {
  const child = spawn(process.execPath, ["--import", "tsx", cli, "filter", ...args], { timeout: 15_000, stdio: "pipe" });
  const out: Buffer[] = [], err: Buffer[] = [];
  child.stdout.on("data", (chunk: Buffer) => out.push(chunk));
  child.stderr.on("data", (chunk: Buffer) => err.push(chunk));
  child.stdin.on("error", (error: NodeJS.ErrnoException) => { if (error.code !== "EPIPE") err.push(Buffer.from(error.message)); });
  const done = new Promise<{ code: number | null; stdout: Buffer; stderr: string }>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => signal ? reject(new Error(`CLI signal ${signal}`)) : resolve({ code, stdout: Buffer.concat(out), stderr: Buffer.concat(err).toString() }));
  });
  return { child, done };
}
async function run(args: string[], text: string | Buffer = original) {
  const { child, done } = start(args); child.stdin.end(text); return done;
}
const complete = ["--exit-code", "0", "--complete"];

test("CLI accepts static formats; unwired registry and execution failures preserve bytes", async () => {
  for (const format of structuredFormats) {
    const result = await run(["--format", format, ...complete, ...(format === "accessibility-scope" ? ["--scope-ref", "node"] : [])]);
    assert.deepEqual(result, { code: 0, stdout: Buffer.from(original), stderr: "" });
  }
  for (const flags of [[], ["--complete"], ["--exit-code", "0"], ["--exit-code", "1", "--complete"]]) {
    assert.deepEqual(await run(["--format", "json", ...flags]), { code: 0, stdout: Buffer.from(original), stderr: "" });
  }
  for (const text of [Buffer.from([0xff, 0xc3, 0x28]), Buffer.from("\ufeff{broken 🔥\r\n\0last")]) {
    assert.deepEqual(await run(["--format", "json", ...complete], text), { code: 0, stdout: text, stderr: "" });
  }
});

test("CLI refuses mixed modes, invalid formats, scopes and strict option syntax", async () => {
  for (const args of [["--format", "unknown"], ["--format", "json", "--command", "cargo build"],
    ["--format", "json", "--terminal-rendered"], ["--format", "accessibility-scope"],
    ["--format", "json", "--scope-ref", "node"], ["--command", "cargo build", "--scope-ref", "node"],
    ["--format"], ["--format", ""], ["--format", "json", "--format", "json"], ["--format", "json", "--extra"],
    ["--format", "accessibility-scope", "--scope-ref", ""], ["--format", "json", "--exit-code", "NaN"]]) {
    const result = await run(args);
    assert.equal(result.code, 1, JSON.stringify(args)); assert.equal(result.stdout.length, 0); assert.ok(result.stderr.length > 0);
  }
  assert.equal((await run([])).stderr, "filter requires --command <literal command>\n");
});

test("structured oversized stdin streams before EOF with exact bytes", async (t) => {
  const { child, done } = start(["--format", "json", ...complete]);
  t.after(() => { if (child.exitCode === null) child.kill(); });
  const prefix = Buffer.alloc(4 * 1024 * 1024 + 1, 0x61), suffix = Buffer.from([0xff, 0x00]);
  const first = once(child.stdout, "data"); child.stdin.write(prefix);
  await Promise.race([first, done.then(() => { throw new Error("no streaming before EOF"); })]);
  assert.equal(child.exitCode, null); child.stdin.end(suffix);
  assert.deepEqual(await done, { code: 0, stdout: Buffer.concat([prefix, suffix]), stderr: "" });
});
