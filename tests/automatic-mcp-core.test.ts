import assert from "node:assert/strict";
import test from "node:test";
import { automaticReducers, filterAutomaticMcp, type AutomaticMcpResult, type AutomaticObservation } from "../src/core/index.js";

const input = { tool: "server_inventory", args: { page: 1 } };
const text = ' { "ref": "e42", "value": "東京😀", "empty": false } \n';
const packet = () => ({ content: [
  { type: "text", text, annotations: { audience: ["assistant"], priority: 1 } },
  { type: "resource", resource: { uri: "file:///owned", text: "resource 東京😀\r\n" } },
  { type: "image", mimeType: "image/png", data: "image" }, { type: "audio", mimeType: "audio/wav", data: "audio" },
  { type: "resource_link", uri: "file:///link", name: "link", description: "untouched" },
], structuredContent: { native: true }, _meta: { source: "actual" }, extra: "owned" });
const preserved = (result: AutomaticMcpResult) => {
  assert.equal(result.content, undefined); assert.equal("replacement" in result.result, false);
  assert.equal(result.result.inputBytes, result.result.outputBytes);
  for (const block of result.blocks) assert.equal(block.inputBytes, block.outputBytes);
};

test("public synchronous MCP helper preserves caller state and returns aggregate and block attribution", () => {
  const output = packet(), before = structuredClone(output);
  Object.freeze(input.args); Object.freeze(input); Object.freeze(output.content[0]); Object.freeze(output.content); Object.freeze(output);
  const result = filterAutomaticMcp(input, output);
  assert.equal(result.result.status, "reduced"); assert.ok(result.content); assert.equal(result.result.profile, "mcp-json");
  assert.deepEqual(output, before);
  const replacement = '{"ref":"e42","value":"東京😀","empty":false}';
  assert.equal((result.content[0] as { text: string }).text, replacement);
  assert.notEqual(result.content[0], output.content[0]);
  assert.equal((result.content[0] as Record<string, unknown>).annotations, output.content[0]!.annotations);
  for (let i = 1; i < output.content.length; i++) assert.equal(result.content[i], output.content[i]);
  assert.equal(result.originalText, text + "\n\nresource 東京😀\r\n");
  assert.equal(result.result.inputBytes, Buffer.byteLength(result.originalText!));
  assert.equal(result.result.outputBytes, Buffer.byteLength(replacement + "\n\nresource 東京😀\r\n"));
  assert.deepEqual(result.blocks, [{ index: 0, family: "mcp-json", inputBytes: Buffer.byteLength(text), outputBytes: Buffer.byteLength(replacement) }]);
  assert.ok(result.blocks[0]!.inputBytes > text.length, "sizes are UTF-8 bytes, not UTF-16 indices");
  assert.equal(output.structuredContent.native, true); assert.equal(output.extra, "owned");
});

test("whole MCP failures, malformed flags, unknown carriers and blob resources refuse before reducers", () => {
  let calls = 0;
  const options = { reducers: [{ id: "mcp-json", reduce: () => { calls++; throw new Error("must not process"); } }] };
  const variants: unknown[] = [
    null, {}, { content: [] }, { content: {} }, { content: [null] }, { content: [{ type: "unknown" }] },
    { content: [{ type: "text", text: 1 }] }, { content: [{ type: "image", data: 1, mimeType: "x" }] },
    { content: [{ type: "audio", data: "x" }] }, { content: [{ type: "resource_link", uri: "x" }] },
    { content: [{ type: "resource", resource: { uri: "x", blob: "" } }, ...packet().content] },
    { content: [{ type: "resource", resource: { uri: "x", text: 1 } }, ...packet().content] },
  ];
  for (const isError of [true, "false", null, 0, {}, []]) variants.push({ ...packet(), isError });
  for (const key of ["metadata", "_meta"]) {
    for (const flags of [null, false, [], "false", { truncated: true }, { truncated: "false" }, { truncated: null },
      { exit: 1 }, { exit: "0" }, { exit: null }, { exit: NaN }, { exit: false }]) variants.push({ ...packet(), [key]: flags });
  }
  for (const output of variants) preserved(filterAutomaticMcp(input, output, options));
  for (const badInput of [null, {}, { tool: "", args: {} }, { tool: "x", args: [] }, { tool: "x", args: null }])
    preserved(filterAutomaticMcp(badInput, packet(), options));
  assert.equal(calls, 0);
  for (const flags of [{}, { truncated: false, exit: 0 }]) {
    assert.equal(filterAutomaticMcp(input, { ...packet(), isError: false, metadata: flags, _meta: flags }).result.status, "reduced");
  }
});

test("64 blocks admit, 65 refuse, and resource text counts towards aggregate limit with separators", () => {
  const content = Array.from({ length: 64 }, () => ({ type: "text", text }));
  const result = filterAutomaticMcp(input, { content });
  assert.equal(result.result.status, "reduced"); assert.equal(result.blocks.length, 64);
  assert.equal(result.result.inputBytes, Buffer.byteLength(content.map(block => block.text).join("\n\n")));
  preserved(filterAutomaticMcp(input, { content: [...content, content[0]] }));
  const limit = 1024 * 1024, resource = { type: "resource", resource: { uri: "x", text: " ".repeat(limit - Buffer.byteLength(text) - 2) } };
  const at = { content: [content[0], resource] };
  assert.equal(filterAutomaticMcp(input, at, { maxInputBytes: limit }).result.inputBytes, limit);
  assert.equal(filterAutomaticMcp(input, at, { maxInputBytes: limit }).result.status, "reduced");
  let calls = 0;
  const options = { maxInputBytes: limit, reducers: [{ id: "mcp-json", reduce: () => { calls++; throw new Error("must not process"); } }] };
  preserved(filterAutomaticMcp(input, { content: [content[0], { ...resource, resource: { ...resource.resource, text: resource.resource.text + "x" } }] }, options));
  preserved(filterAutomaticMcp(input, { content: [{ type: "text", text: " ".repeat(limit) }, content[0]] }, options));
  assert.equal(calls, 0);
  for (const maxInputBytes of [0, limit - 1, 16 * limit + 1, 1.5, NaN, "1048576", null]) {
    const result = filterAutomaticMcp(input, packet(), { maxInputBytes } as never);
    assert.equal(result.result.status, "failed_open"); preserved(result);
  }
});

test("text error markers and protocol failures preserve whole packets, including a final error block", () => {
  for (const error of ["### Error\nfailed", "...output truncated...\n{}", "...12 lines truncated...\n{}",
    '{"id":1,"error":{"code":-1,"message":"native failure"}}', '{"jsonrpc":"2.0","\\u0065rror":{"code":1,"message":"bad"}}']) {
    const content = [{ type: "text", text }, { type: "text", text: error }];
    const output = { content }, before = structuredClone(output);
    preserved(filterAutomaticMcp(input, output)); assert.deepEqual(output, before);
  }
});

test("heterogeneous CDP/JSON and recognized/unknown packets stay whole before settings", () => {
  const ax = JSON.stringify({ nodes: [{ nodeId: "1", ignored: false }, { nodeId: "2", ignored: false }] }, null, 2);
  for (const second of [ax, "unknown evidence", '{ "incomplete":']) {
    const output = { content: [{ type: "text", text }, { type: "text", text: second }] };
    for (const options of [{}, { enabledFamilies: ["mcp-json"] as const }, { reducers: automaticReducers.filter(entry => entry.id === "mcp-json") }]) {
      const result = filterAutomaticMcp(input, output, options);
      preserved(result); assert.equal(result.result.reason, "heterogeneous_or_unknown_mcp_family");
    }
  }
  const result = filterAutomaticMcp(input, { content: [{ type: "text", text: ax }] }, { enabledFamilies: ["mcp-json"] });
  preserved(result); assert.equal(result.blocks[0]!.family, "mcp-cdp-accessibility");
});

test("same-family blocks transform independently; compact blocks and text resources remain exact", () => {
  const compact = '{"already":"compact"}', output = { content: [{ type: "text", text }, { type: "text", text: compact },
    { type: "resource", resource: { uri: "x", text: ' { "do": "not transform" } ' } }] };
  const result = filterAutomaticMcp(input, output);
  assert.equal(result.result.status, "reduced"); assert.ok(result.content);
  assert.equal(result.content[1], output.content[1]); assert.equal(result.content[2], output.content[2]);
  assert.deepEqual(result.blocks[1], { index: 1, family: "mcp-json", inputBytes: compact.length, outputBytes: compact.length });
  const partial = { content: [{ type: "text", text: '{ "first":' }, { type: "text", text: '1 }' }] };
  preserved(filterAutomaticMcp(input, partial));
});

test("last-block reducer failure or invalid evidence discards all earlier candidates and attribution savings", () => {
  for (const mode of ["throw", "evidence"] as const) {
    let calls = 0;
    const reducers = [{ id: "mcp-json", reduce: (observation: AutomaticObservation) => {
      if (++calls === 2) {
        if (mode === "throw") throw new Error("last block failed");
        return { pieces: [[0, 1] as const], required: [[0, observation.output.length] as const] };
      }
      const entry = automaticReducers.find(entry => entry.id === "mcp-json")!;
      return entry.reduce(observation);
    } }];
    const output = { content: [{ type: "text", text }, { type: "text", text }] }, before = structuredClone(output);
    const result = filterAutomaticMcp(input, output, { reducers });
    assert.equal(calls, 2); assert.equal(result.result.status, "failed_open"); preserved(result); assert.deepEqual(output, before);
    assert.equal(result.blocks.length, 2);
  }
});

test("throwing getters fail open and packet reads use copied fields, without mutating originals", () => {
  const result = filterAutomaticMcp(input, { get content() { throw new Error("getter"); } });
  assert.equal(result.result.status, "failed_open"); preserved(result);
  let reads = 0;
  const block = { type: "text", get text() { reads++; return text; }, annotations: { priority: 1 } };
  const output = { content: [block] };
  assert.equal(filterAutomaticMcp(input, output).result.status, "reduced"); assert.equal(reads, 1);
  assert.equal(output.content[0], block);
});

test("hidden and inherited failure flags are preserved during initial and live packet snapshots", () => {
  for (const key of ["metadata", "_meta"]) {
    for (const [flag, value] of [["exit", 1], ["truncated", true]] as const) {
      for (const facts of [Object.create({ [flag]: value }), Object.defineProperty({}, flag, { value })]) {
        const result = filterAutomaticMcp(input, { ...packet(), [key]: facts });
        preserved(result); assert.equal(result.result.status, "passthrough");
      }
    }
  }
});
