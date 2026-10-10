import assert from "node:assert/strict";
import test from "node:test";
import { filterAutomatic } from "../src/core/automatic.js";
import { reduceAutomaticCdp } from "../src/profiles/auto-cdp.js";
import { reduceAutomaticJson } from "../src/profiles/auto-json.js";

const run = (output: string) => filterAutomatic({ source: "mcp", tool: "cdp", output, args: {}, metadata: {}, status: "success", completeness: "complete" },
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
