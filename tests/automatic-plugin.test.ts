import assert from "node:assert/strict";
import test from "node:test";
import plugin, { createAfterHook } from "../src/opencode/index.js";
import { parseOptions } from "../src/opencode/config.js";

const input = { tool: "server_actual_inventory", args: {} };
const packet = (text = ' { "ref": "e42", "value": false, "empty": "" } \n') => ({ content: [
  { type: "text", text, annotations: { audience: ["assistant"] } },
  { type: "resource", resource: { uri: "file:///owned/resource", text: "exact resource\r\n" } },
  { type: "image", mimeType: "image/png", data: "original-image" },
  { type: "audio", mimeType: "audio/wav", data: "original-audio" },
], structuredContent: { native: true, ref: "e42" }, _meta: { source: "actual" } });

test("plain plugin entry automatically filters native MCP text, preserving all other native fields", async () => {
  const hooks = await plugin({});
  const output = packet(), before = structuredClone(output), content = output.content, data = output.structuredContent;
  await hooks["tool.execute.after"]!(input, output);
  assert.equal(output.content[0]!.text, '{"ref":"e42","value":false,"empty":""}');
  assert.notEqual(output.content, content);
  for (let i = 1; i < content.length; i++) assert.equal(output.content[i], content[i]);
  assert.deepEqual(output.content.slice(1), before.content.slice(1));
  assert.deepEqual(output.content[0]!.annotations, before.content[0]!.annotations);
  assert.equal(output.structuredContent, data); assert.deepEqual(output._meta, before._meta);
});
test("automatic opt-out keeps legacy behavior and default activation needs no bindings", async () => {
  assert.equal(parseOptions({ automatic: false })?.automatic, false);
  assert.equal(parseOptions({ automatic: "false" }), undefined);
  const before = packet(), output = structuredClone(before);
  await createAfterHook({ automatic: false })(input, output); assert.deepEqual(output, before);
  const native = { output: ' { "success": true } ', metadata: { exit: 0, truncated: false }, title: "retain" };
  await createAfterHook()({ tool: "bash", args: { command: "curl http://local" } }, native);
  assert.equal(native.output, '{"success":true}'); assert.equal(native.title, "retain");
});
test("MCP failures, clipping, invalid carriers and binary resources preserve whole packets", async () => {
  const variants: unknown[] = [{ ...packet(), isError: true }, { ...packet(), isError: "false" }, { ...packet(), metadata: { truncated: true } },
    { ...packet(), _meta: { truncated: true } }, { ...packet(), metadata: { exit: 1 } }, packet("### Error\nnative error"),
    packet('...output truncated...\n { "x": 1 }'), packet('{"id":1,"error":{"code":-1,"message":"native error"}}'),
    { ...packet(), content: [{ type: "text", text: 1 }] }, { ...packet(), content: [{ type: "resource", resource: { uri: "file:x", blob: "AAAA" } }, ...packet().content] }];
  for (const output of variants) {
    const before = structuredClone(output); await createAfterHook()(input, output); assert.deepEqual(output, before);
  }
});
test("MCP block boundaries remain independent and are never joined into invented JSON", async () => {
  const content = [{ type: "text", text: '{ "first":' }, { type: "text", text: '1 }' }], output = { content };
  await createAfterHook()(input, output); assert.equal(output.content, content); assert.deepEqual(output.content, content);
});
test("MCP raw-save failure and concurrent host replacement prevent any partial commit", async () => {
  const original = packet(" ".repeat(2048) + '{"ref":"e42"}'), before = structuredClone(original);
  await createAfterHook({ raw: {} }, { raw: { put: async () => { throw new Error("native persistence failure"); } } })(input, original);
  assert.deepEqual(original, before);
  const output = packet(" ".repeat(2048) + '{"ref":"e42"}');
  const replacement = packet("host changed text").content;
  await createAfterHook({ raw: {} }, { raw: { put: async () => { output.content = replacement; return "id"; } } })(input, output);
  assert.equal(output.content, replacement);
});
test("MCP budgets and error facts are enforced before invoking format processing", async () => {
  let calls = 0;
  const hook = createAfterHook({}, { automaticFilter: () => { calls++; throw new Error("must not process"); } });
  const big = packet(" ".repeat(4 * 1024 * 1024 + 1)); await hook(input, big); assert.equal(calls, 0);
  let reads = 0;
  const failed = { ...packet(), get isError() { reads++; return reads === 1; } };
  await hook(input, failed); assert.equal(reads, 1); assert.equal(calls, 0);
});
test("aggregate MCP budget is validated before parsing the first eligible block", async () => {
  const output = { content: [{ type: "text", text: ' { "x": 1 } ' }, { type: "text", text: " ".repeat(4 * 1024 * 1024) }] };
  const parse = JSON.parse; let calls = 0;
  JSON.parse = ((...args: Parameters<typeof JSON.parse>) => { calls++; return parse(...args); }) as typeof JSON.parse;
  try { await createAfterHook()(input, output); assert.equal(calls, 0); }
  finally { JSON.parse = parse; }
});
test("hook reads tool, args and command once; exclusion and core see the same frozen values", async () => {
  let commandReads = 0, toolReads = 0;
  const seen: unknown[] = [];
  const hook = createAfterHook({ excludeCommands: ["curl"] }, {
    filter: () => ({ status: "passthrough", reason: "no_profile", inputBytes: 0, outputBytes: 0 }) as never,
    automaticFilter: observation => { seen.push(observation.tool, observation.args.command); return { status: "passthrough", reason: "probe", inputBytes: 0, outputBytes: 0 } as never; },
  });
  const args = { get command() { return ++commandReads <= 2 ? "mytool --json" : "curl http://local"; } };
  await hook({ tool: "bash", args }, { output: ' { "x": 1 } ', metadata: { exit: 0, truncated: false } });
  assert.equal(commandReads, 1); assert.deepEqual(seen, ["bash", "mytool --json"]);
  const switching = { get tool() { return ++toolReads <= 2 ? "glob" : "bash"; }, args: { pattern: "*" } };
  await hook(switching, { output: "/a\n/b\n", metadata: { truncated: false } });
  assert.equal(toolReads, 1); assert.deepEqual(seen.slice(2, 3), ["glob"]);
});
test("MCP validation and commit use one snapshot of the content array and each block", async () => {
  const text = { type: "text", text: " ".repeat(256) + '{"ref":"e42"}' };
  class Sneaky extends Array<unknown> { override entries(): ArrayIterator<[number, unknown]> { return [[0, text]].values() as never; } }
  const sneaky = Sneaky.from([text, { type: "resource", resource: { uri: "file:x", blob: "AAAA" } }]);
  const output = { content: sneaky }; await createAfterHook()(input, output); assert.equal(output.content, sneaky);
  let typeReads = 0;
  const flipping = { get type() { return ++typeReads === 1 ? "text" : "image"; }, text: ' { "ref": "e42" } ', annotations: { audience: ["assistant"] } };
  const flippedContent: unknown[] = [flipping], flipped = { content: flippedContent };
  await createAfterHook()(input, flipped);
  // Validated as text, re-read at commit as image: the live block changed, so nothing is committed.
  assert.ok(typeReads >= 1); assert.equal(flipped.content, flippedContent); assert.equal(flipped.content[0], flipping);
});
test("MCP commit after raw save requires the exact validated packet and keeps in-place host additions", async () => {
  const text = " ".repeat(2048) + '{"ref":"e42"}';
  const pushed = packet(text);
  await createAfterHook({ raw: {} }, { raw: { put: async () => { pushed.content.push({ type: "text", text: "host added" } as never); return "id"; } } })(input, pushed);
  assert.equal(pushed.content[0]!.text, text); assert.equal(pushed.content.length, 5);
  const replaced = packet(text), image = { type: "image", mimeType: "image/png", data: "new-image" };
  await createAfterHook({ raw: {} }, { raw: { put: async () => { replaced.content[2] = image as never; return "id"; } } })(input, replaced);
  assert.equal(replaced.content[0]!.text, text); assert.equal(replaced.content[2], image);
  const failed = packet(text) as ReturnType<typeof packet> & { isError?: boolean };
  await createAfterHook({ raw: {} }, { raw: { put: async () => { failed.isError = true; return "id"; } } })(input, failed);
  assert.equal(failed.content[0]!.text, text);
  const annotated = packet(text);
  await createAfterHook({ raw: {} }, { raw: { put: async () => { (annotated.content[0] as Record<string, unknown>).annotations = { priority: 1 }; return "id"; } } })(input, annotated);
  assert.equal(annotated.content[0]!.text, '{"ref":"e42"}'); assert.deepEqual(annotated.content[0]!.annotations, { priority: 1 });
});
