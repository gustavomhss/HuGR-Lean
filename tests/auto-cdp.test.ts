import assert from "node:assert/strict";
import test from "node:test";
import { filterAutomatic } from "../src/core/automatic.js";
import { reduceAutomaticCdp } from "../src/profiles/auto-cdp.js";
import { reduceAutomaticJson } from "../src/profiles/auto-json.js";
import { renderReduction } from "../src/core/structured-render.js";
import { readFileSync } from "node:fs";

const run = (output: string, tool = "cdp") => filterAutomatic({ source: "mcp", tool, output, args: {}, metadata: {}, status: "success", completeness: "complete" },
  { reducers: [{ id: "cdp", reduce: reduceAutomaticCdp }, { id: "json", reduce: reduceAutomaticJson }] });
// Independent semantic oracle: no production parser, spans or column helpers.
function decode(table: { columns: string[]; rows: unknown[][][]; cellEncoding: string }): Record<string, unknown>[] {
  assert.equal(table.cellEncoding, "optional");
  assert.equal(new Set(table.columns).size, table.columns.length);
  return table.rows.map(row => {
    assert.equal(row.length, table.columns.length);
    const entries: [string, unknown][] = [];
    row.forEach((cell, i) => {
      assert.ok(Array.isArray(cell) && cell.length <= 1);
      if (cell.length) entries.push([table.columns[i]!, cell[0]]);
    });
    return Object.fromEntries(entries);
  });
}
const nodes = Array.from({ length: 8 }, (_, i) => ({ nodeId: String(i), ignored: i === 1,
  ...(i ? { parentId: String(i - 1) } : {}), childIds: i < 7 ? [String(i + 1)] : [],
  ignoredReasons: [{ name: "hidden", value: { type: "boolean", value: false } }],
  role: { type: "role", value: "button" }, name: { type: "computedString", value: "😀 opaque", sources: [{ type: "attribute", attribute: "aria-label", value: { type: "string", value: "opaque" } }] },
  properties: [{ name: "controls", value: { type: "idrefList", relatedNodes: [{ backendDOMNodeId: 19, idref: "target", text: "evidence" }] } }],
  ...(i === 7 ? { value: null, extension: { empty: {}, list: [], refs: ["0", "7"] } } : {}) }));

test("native nodes and JSON-RPC result.nodes independently reconstruct every field and envelope", () => {
  for (const native of [{ nodes, extension: { scope: "partial", hasMore: true } },
    { jsonrpc: "2.0", id: 4, result: { nodes, extension: [] }, sessionId: "session", opaque: { error: "data" } }]) {
    const input = JSON.stringify(native, null, 2), result = run(input);
    assert.equal(result.status, "reduced"); assert.equal(result.profile, "cdp");
    const compact = JSON.parse(result.replacement!);
    const holder = compact.result ?? compact;
    holder.nodes = decode(holder.nodes);
    assert.deepEqual(compact, native);
    holder.nodes.forEach((node: object, i: number) => assert.deepEqual(Object.keys(node), Object.keys(nodes[i]!)));
  }
});

test("sparse expansion budget falls back losslessly; CDP value lexemes remain exact", () => {
  const wide = { nodes: Array.from({ length: 180 }, (_, i) => ({ nodeId: String(i), [`extension${i}`]: {} })) };
  const result = run(JSON.stringify(wide, null, 2));
  assert.equal(result.status, "reduced"); assert.equal(result.profile, "json");
  assert.deepEqual(JSON.parse(result.replacement!), wide);
  const input = '{ "nodes": [ { "nodeId":"1", "ignored":false, "extension": 9007199254740993, "value": -0 }, { "nodeId":"2", "ignored":true, "extension":1e+03, "value": "\\u0061" } ] }';
  const compact = run(input); assert.equal(compact.status, "reduced");
  const table = renderReduction(input, reduceAutomaticCdp({ source: "mcp", tool: "cdp", output: input,
    args: {}, metadata: {}, status: "success", completeness: "complete" })!);
  for (const lexeme of ['9007199254740993', '-0', '1e+03', '"\\u0061"']) {
    assert.ok(compact.replacement.includes(lexeme)); assert.ok(table.includes(lexeme));
  }
});

test("real before/modal native AX and captured MCP Result reconstruct entire compound root", () => {
  for (const state of ["before", "modal"]) {
    const input = readFileSync(new URL(`../fixtures/automatic/browser/native/cdp-${state}.json`, import.meta.url), "utf8");
    const original = JSON.parse(input), result = run(input);
    assert.equal(result.status, "reduced"); assert.equal(result.profile, "cdp");
    const compact = JSON.parse(result.replacement);
    compact.accessibility.nodes = decode(compact.accessibility.nodes);
    assert.deepEqual(compact, original);
    compact.accessibility.nodes.forEach((node: object, i: number) => assert.deepEqual(Object.keys(node), Object.keys(original.accessibility.nodes[i])));
  }
  const capture = JSON.parse(readFileSync(new URL("../fixtures/automatic/browser/native/playwright.json", import.meta.url), "utf8"));
  let checked = 0;
  const calls = new Map<number, string>();
  for (const record of capture.records) {
    const message = record.message;
    if (record.direction === "send" && message.method === "tools/call") calls.set(message.id, message.params.name);
    if (record.direction !== "receive" || !["browser_run_code_unsafe", "browser_evaluate"].includes(calls.get(message.id) ?? "")) continue;
    for (const block of record.message.result?.content ?? []) {
      if (block.type !== "text" || !block.text.startsWith("### Result\n")) continue;
      const start = "### Result\n".length, end = block.text.indexOf("\n### Ran Playwright code\n", start);
      const original = JSON.parse(block.text.slice(start, end));
      if (!original?.accessibility?.nodes) continue;
      const result = run(block.text, "capture_browser_run_code_unsafe");
      assert.equal(result.status, "reduced"); assert.equal(result.profile, "cdp");
      const suffix = block.text.slice(end);
      assert.ok(result.replacement.startsWith(block.text.slice(0, start)) && result.replacement.endsWith(suffix));
      const compact = JSON.parse(result.replacement.slice(start, -suffix.length));
      compact.accessibility.nodes = decode(compact.accessibility.nodes);
      assert.deepEqual(compact, original); checked++;
    }
  }
  assert.equal(checked, 2);
});

test("AX nodes require nonempty unique IDs and boolean ignored", () => {
  for (const invalid of [[{ nodeId: "", ignored: false }], [{ nodeId: "x" }], [{ nodeId: "x", ignored: "false" }],
    [{ nodeId: "x", ignored: false }, { nodeId: "x", ignored: true }]]) {
    const result = run(JSON.stringify({ accessibility: { nodes: invalid }, control: { hasMore: true } }, null, 2));
    assert.equal(result.status, "reduced"); assert.equal(result.profile, "json");
  }
});

test("CDP refusal never drops incompatible keys/order; lexical fallback retains all data", () => {
  for (const native of [{ nodes: [] }, { nodes: [{ nodeId: "1", extra: 1 }, { extra: 2, nodeId: "2" }] },
    { nodes: [{ role: {} }] }, { result: { nodes } }, { hugr: { nodes } }]) {
    const input = JSON.stringify(native, null, 2), result = run(input);
    assert.equal(result.status, "reduced");
    assert.equal(result.profile, "json");
    assert.deepEqual(JSON.parse(result.replacement!), native);
  }
  const escaped = '{ "nodes": [ { "nodeId":"1", "\\u0078":1 }, { "nodeId":"2", "x":2 } ] }';
  const result = run(escaped); assert.equal(result.status, "reduced"); assert.equal(result.profile, "json");
  assert.deepEqual(JSON.parse(result.replacement!), JSON.parse(escaped));
  for (const input of ['{ "id":1, "error":{"code":-1,"message":"bad"} }', '{ "nodes": [']) {
    assert.notEqual(run(input).status, "reduced");
  }
});
