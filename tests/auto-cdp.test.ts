import assert from "node:assert/strict";
import test from "node:test";
import { filterAutomatic } from "../src/core/automatic.js";
import { reduceAutomaticCdp } from "../src/profiles/auto-cdp.js";
import { reduceAutomaticJson } from "../src/profiles/auto-json.js";
import { renderReduction } from "../src/core/structured-render.js";
import { readFileSync } from "node:fs";

const run = (output: string, tool = "cdp") => filterAutomatic({ source: "mcp", tool, output, args: {}, metadata: {}, status: "success", completeness: "complete" },
  { reducers: [{ id: "cdp", reduce: reduceAutomaticCdp }, { id: "json", reduce: reduceAutomaticJson }] });
const reduce = (output: string) => reduceAutomaticCdp({ source: "mcp", tool: "cdp", output,
  args: {}, metadata: {}, status: "success", completeness: "complete" });
const empties = [false, 0, "", null, {}, []] as const;
function guardControl(positive: string, refused: string): void {
  for (const input of [positive, refused]) {
    // Native validity: unique nonempty string IDs, boolean ignored, mutually consistent parent/child refs.
    const list: Record<string, unknown>[] = JSON.parse(input).nodes, byId = new Map<string, Record<string, unknown>>();
    for (const node of list) {
      assert.ok(typeof node.nodeId === "string" && node.nodeId.length && !byId.has(node.nodeId));
      assert.equal(typeof node.ignored, "boolean"); byId.set(node.nodeId, node);
    }
    for (const node of list) {
      if ("parentId" in node) assert.ok((byId.get(node.parentId as string)?.childIds as string[]).includes(node.nodeId as string));
      for (const child of node.childIds as string[]) assert.equal(byId.get(child)?.parentId, node.nodeId);
    }
  }
  const control = reduce(positive);
  assert.ok(control, "native-valid positive control must admit CDP");
  const decoded = JSON.parse(renderReduction(positive, control));
  decoded.nodes = decode(decoded.nodes);
  assert.deepEqual(decoded, JSON.parse(positive));
  assert.equal(JSON.stringify(decoded), JSON.stringify(JSON.parse(positive)), "field and row positions retained");
  // Boolean check: diffing a large admitted Reduction would stall the failure report.
  assert.ok(reduce(refused) === undefined, "intended guard must refuse native-valid data");
  const fallback = run(refused);
  assert.equal(fallback.status, "reduced"); assert.equal(fallback.profile, "json");
  // Independent lexical oracle: retain quoted tokens verbatim and every non-whitespace character.
  const tokens = (text: string) => text.match(/"(?:\\.|[^"\\])*"|[^\s]/g)!.join("\u0000");
  assert.ok(tokens(fallback.replacement!) === tokens(refused), "fallback token stream must equal the original");
}
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
  // 50 rows x 500 columns is exactly the 25000-cell sparse budget; one extra extension column exceeds it.
  const sparse = (extra: boolean) => ({ nodes: Array.from({ length: 50 }, (_, i) => {
    const node: Record<string, unknown> = { nodeId: String(i + 1), ignored: i % 2 === 1 };
    if (i) node.parentId = String(i);
    node.childIds = i < 49 ? [String(i + 2)] : [];
    for (let j = 0; j < 196; j++) node[`vendorExtensionSharedByEveryAxNode${j}`] = empties[(i + j) % 6];
    for (let j = 0; j < 6; j++) node[`vendorExtensionUniqueToNode${i}_${j}`] = empties[j];
    if (extra && i === 49) node.vendorExtensionBeyondBudget = null;
    return node;
  }) });
  const positive = JSON.stringify(sparse(false), null, 2);
  const boundary = JSON.parse(renderReduction(positive, reduce(positive)!)).nodes;
  assert.equal(boundary.columns.length * boundary.rows.length, 25000);
  guardControl(positive, JSON.stringify(sparse(true), null, 2));
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

test("field order guard rejects native-valid conflicting order with full lexical fallback", () => {
  const root = { nodeId: "1", ignored: false, extra: 0, childIds: ["2"], value: "" };
  const child = { nodeId: "2", ignored: true, parentId: "1", extra: false, childIds: [], value: [] };
  const reordered = { extra: false, nodeId: "2", ignored: true, parentId: "1", childIds: [], value: [] };
  guardControl(JSON.stringify({ nodes: [root, child] }, null, 2), JSON.stringify({ nodes: [root, reordered] }, null, 2));
});

test("key alias guard rejects native-valid escaped spellings with full lexical fallback", () => {
  const escaped = '"\\u0078":';
  const positive = JSON.stringify({ nodes: [{ nodeId: "1", ignored: false, x: 0, childIds: ["2"], value: "" },
    { nodeId: "2", ignored: true, parentId: "1", x: null, childIds: [], value: {} }] }, null, 2).replaceAll('"x":', escaped);
  assert.equal(positive.split(escaped).length, 3);
  const second = positive.lastIndexOf(escaped);
  guardControl(positive, `${positive.slice(0, second)}"x":${positive.slice(second + escaped.length)}`);
});

test("CDP refusal never drops unsupported shape; lexical fallback retains all data", () => {
  for (const native of [{ nodes: [] },
    { nodes: [{ role: {} }] }, { result: { nodes } }, { hugr: { nodes } }]) {
    const input = JSON.stringify(native, null, 2), result = run(input);
    assert.equal(result.status, "reduced");
    assert.equal(result.profile, "json");
    assert.deepEqual(JSON.parse(result.replacement!), native);
  }
  for (const input of ['{ "id":1, "error":{"code":-1,"message":"bad"} }', '{ "nodes": [']) {
    assert.notEqual(run(input).status, "reduced");
  }
});
