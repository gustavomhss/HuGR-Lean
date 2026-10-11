import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import test from "node:test";
import { parseJson as liveParseJson, recordJson, scanJson, scanJsonValue, scanned, type JsonNode } from "../src/core/structured-json.js";
import { renderReduction } from "../src/core/structured-render.js";
import { filterAutomatic } from "../src/core/automatic.js";
import { automaticReducers } from "../src/core/automatic-registry.js";
import type { AutomaticEntry, AutomaticObservation, AutomaticReducer } from "../src/core/automatic-types.js";
import type { Piece, Reduction, Span } from "../src/core/types.js";
import * as next from "../src/profiles/auto-json.js";
import { reduceAutomaticCdp } from "../src/profiles/auto-cdp.js";
import { errorText } from "../src/opencode/automatic-mcp.js";
import { ref } from "./perf-stream-reference.js";

/*
 * Differential oracle for the round-4 streaming rewrite (no JsonNode tree on the auto-json, auto-cdp and MCP
 * error paths) against the verbatim f729c4b tree path in ./perf-stream-reference.ts (provenance recorded there).
 * Observable result: undefined-ness and the rendered bytes; the new reductions must also be piece-for-piece and
 * span-for-span identical (which implies the required-coverage superset, also checked independently).
 */

// ---- differential harness ----
type Obs = AutomaticObservation;
const success = { status: "success", completeness: "complete" } as const;
const mcp = (output: string, tool = "unknown_inventory"): Obs => ({ source: "mcp", tool, output, args: {}, metadata: {}, ...success });
const bash = (command: string, output: string, metadata: Record<string, unknown> = { exit: 0, truncated: false }): Obs =>
  ({ source: "native", tool: "bash", output, args: { command }, metadata, ...success });
const stats = { texts: 0, valid: 0, envelopes: 0, observations: 0, json: 0, cdp: 0, errorTexts: 0, errorPositive: 0 };
const SENTINEL: Piece = Object.freeze({ text: "" });

function outcome(reduction: Reduction | undefined, output: string): string {
  if (reduction === undefined) return "undefined";
  try { return `render:${renderReduction(output, reduction)}`; } catch { return "invalid"; }
}
/** Every byte the reference declared required is still required by the new reduction. */
function covers(nextSpans: readonly Span[], reference: readonly Span[]): boolean {
  const merged: [number, number][] = [];
  for (const [start, end] of [...nextSpans].sort((a, b) => a[0] - b[0])) {
    const last = merged[merged.length - 1];
    if (last && start <= last[1]) last[1] = Math.max(last[1], end); else merged.push([start, end]);
  }
  return reference.every(([start, end]) => merged.some(span => span[0] <= start && span[1] >= end));
}
function nodeCount(node: JsonNode): number {
  if (node.kind === "scalar") return 1;
  if (node.kind === "array") return 1 + node.items.reduce((sum, item) => sum + nodeCount(item), 0);
  return 1 + node.entries.reduce((sum, entry) => sum + 1 + nodeCount(entry.value), 0);
}
/** Expected records: every value at depth <= 4 in pre-order, with key span, enclosing start and compactness. */
function expectedRecords(text: string, root: JsonNode): number[][] {
  const rows: number[][] = [];
  const visit = (node: JsonNode, depth: number, parent: number, key: JsonNode | undefined): void => {
    if (depth > 4) return;
    const pieces: Piece[] = [], required: Span[] = [];
    ref.emitLexical(node, pieces, required);
    const compact = pieces.length === 1 && Array.isArray(pieces[0]) && (pieces[0] as Span)[0] === node.span[0] && (pieces[0] as Span)[1] === node.span[1];
    const escaped = key !== undefined && text.slice(...key.span).includes("\\");
    rows.push([depth, parent, key ? key.span[0] : -1, key ? key.span[1] : -1, node.span[0], node.span[1], (escaped ? 1 : 0) | (compact ? 2 : 0)]);
    if (node.kind === "array") for (const item of node.items) visit(item, depth + 1, node.span[0], undefined);
    else if (node.kind === "object") for (const entry of node.entries) visit(entry.value, depth + 1, node.span[0], entry.key);
  };
  visit(root, 0, -1, undefined);
  return rows;
}
function subnodes(node: JsonNode, into: JsonNode[], limit: number): JsonNode[] {
  if (into.length >= limit) return into;
  into.push(node);
  if (node.kind === "array") for (const item of node.items) subnodes(item, into, limit);
  else if (node.kind === "object") for (const entry of node.entries) subnodes(entry.value, into, limit);
  return into;
}

/** Scanner level: acceptance, exact node count and limit edge, envelope verdict, lexical emission, records, ranges. */
function checkText(text: string, label: string): void {
  stats.texts++;
  const tree = ref.parseJson(text), offset = 1 + (text.length % 7);
  const pieces: Piece[] = [SENTINEL], required: Span[] = [[0, 1]];
  const end = scanJson(text, offset, 25000, pieces, required);
  if (!tree) {
    if (end !== -1) assert.fail(`${label}: scanner accepted what the tree parser refuses: ${JSON.stringify(text.slice(0, 120))}`);
    assert.ok(pieces.length === 1 && pieces[0] === SENTINEL && required.length === 1, `${label}: failed scan left emission behind`);
    assert.equal(scanJson(text, 0, 25000), -1, label);
    assert.equal(recordJson(text, 25000), undefined, label);
    return;
  }
  stats.valid++;
  if (end < 0) assert.fail(`${label}: scanner refused what the tree parser accepts: ${JSON.stringify(text.slice(0, 120))}`);
  const expectedPieces: Piece[] = [SENTINEL], expectedRequired: Span[] = [[0, 1]];
  ref.emitLexical(tree, expectedPieces, expectedRequired, offset);
  assert.equal(JSON.stringify(pieces), JSON.stringify(expectedPieces), `${label}: pieces differ`);
  assert.equal(JSON.stringify(required), JSON.stringify(expectedRequired), `${label}: required differ`);
  const nodes = nodeCount(tree), envelope = ref.protocolError(tree);
  assert.equal(scanned.nodes, nodes, `${label}: node count`);
  assert.equal(scanned.envelope, envelope, `${label}: envelope verdict`);
  if (envelope) stats.envelopes++;
  assert.ok(scanJson(text, 0, nodes) >= 0 && scanned.nodes === nodes && scanned.envelope === envelope, `${label}: exact limit admits`);
  assert.equal(scanJson(text, 0, nodes - 1), -1, `${label}: one node over the limit refuses`);
  const records = recordJson(text, 25000);
  assert.ok(records, `${label}: records`);
  const rows = expectedRecords(text, tree);
  assert.equal(records.count, rows.length, `${label}: record count`);
  for (let i = 0; i < rows.length; i++) {
    const actual: number[] = [records.depth[i]!, records.parent[i]!, records.keyStart[i]!, records.keyEnd[i]!, records.valueStart[i]!, records.valueEnd[i]!, records.flags[i]!];
    if (actual.join() !== rows[i]!.join()) assert.fail(`${label}: record ${i} ${actual.join()} != ${rows[i]!.join()}`);
  }
  // Range scans (as auto-cdp emits cells): each value's own lexical emission, ending at its span end.
  for (const node of subnodes(tree, [], 40)) {
    const rangePieces: Piece[] = [], rangeRequired: Span[] = [], treePieces: Piece[] = [], treeRequired: Span[] = [];
    assert.equal(scanJsonValue(text, node.span[0], offset, Infinity, rangePieces, rangeRequired), node.span[1], `${label}: range end`);
    ref.emitLexical(node, treePieces, treeRequired, offset);
    assert.equal(JSON.stringify(rangePieces) + JSON.stringify(rangeRequired), JSON.stringify(treePieces) + JSON.stringify(treeRequired), `${label}: range emission`);
  }
}

const pairs: [string, AutomaticReducer, AutomaticReducer][] = [["auto-cdp", ref.reduceAutomaticCdp, reduceAutomaticCdp], ["auto-json", ref.reduceAutomaticJson, next.reduceAutomaticJson]];
const referenceRegistry: AutomaticEntry[] = automaticReducers.map(entry =>
  ({ id: entry.id, reduce: entry.id === "auto-cdp" ? ref.reduceAutomaticCdp : entry.id === "auto-json" ? ref.reduceAutomaticJson : entry.reduce }));
/** Reducer level: both reducers in registry order on one shared object per side, then reversed on fresh objects. */
function checkObservation(observation: Obs, label: string, endToEnd = false): void {
  stats.observations++;
  const left = Object.freeze({ ...observation }), right = Object.freeze({ ...observation });
  const reversedLeft = Object.freeze({ ...observation }), reversedRight = Object.freeze({ ...observation });
  const compare = (id: string, expected: Reduction | undefined, actual: Reduction | undefined, order: string) => {
    const a = outcome(expected, observation.output), b = outcome(actual, observation.output);
    if (a !== b) assert.fail(`${label} ${id} ${order}: reference ${a.slice(0, 160)} != new ${b.slice(0, 160)}`);
    if (expected && actual) {
      if (JSON.stringify(expected) !== JSON.stringify(actual)) assert.fail(`${label} ${id} ${order}: reduction differs`);
      assert.ok(covers(actual.required, expected.required), `${label} ${id}: required evidence weakened`);
      if (order === "registry") id === "auto-cdp" ? stats.cdp++ : stats.json++;
    }
  };
  for (const [id, reference, current] of pairs) compare(id, reference(left), current(right), "registry");
  for (const [id, reference, current] of [...pairs].reverse()) compare(id, reference(reversedLeft), current(reversedRight), "reversed");
  assert.equal(JSON.stringify(next.nativeJsonSection(right)), JSON.stringify(ref.nativeJsonSection(left)), `${label}: native section`);
  if (endToEnd) {
    const expected = filterAutomatic(observation, { reducers: referenceRegistry }), actual = filterAutomatic(observation);
    if (JSON.stringify(expected) !== JSON.stringify(actual)) assert.fail(`${label}: filterAutomatic differs`);
  }
}
function checkErrorText(text: string, label: string): void {
  stats.errorTexts++;
  const expected = ref.errorText(text);
  if (errorText(text) !== expected) assert.fail(`${label}: errorText ${!expected} != reference ${expected}: ${JSON.stringify(text.slice(0, 120))}`);
  if (expected) stats.errorPositive++;
}

// ---- seeded generators ----
function rng(seed: number) {
  let state = seed >>> 0;
  const nextValue = () => { state = (state + 0x6d2b79f5) >>> 0; let t = state; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const int = (n: number) => Math.floor(nextValue() * n), pick = <T>(list: readonly T[]): T => list[int(list.length)]!;
  return { int, pick, chance: (p: number) => nextValue() < p };
}
type R = ReturnType<typeof rng>;
const SPACES = [" ", "\n", "\t", "\r", "\r\n", "  ", "\n    ", "\n\t", " \r\n "];
/** Not JSON whitespace: NBSP, BOM, VT, FF, LINE SEPARATOR, IDEOGRAPHIC SPACE, NEL, NUL. */
const BAD_SPACES = [" ", "﻿", "\u000b", "\u000c", " ", "　", "\u0085", "\u0000"];
const BODY = ["a", "abc", "with space", "path/to/file.txt", "é", "東京", "😀", " ", " ", "\u007f", "\ud800", "\udfff", "x".repeat(40),
  "\\\"", "\\\\", "\\/", "\\b", "\\f", "\\n", "\\r", "\\t", "\\u00e9", "\\u00E9", "\\uD83D\\uDE00", "\\ud800", "\\u0000", "\\u0022", "\\u005c", "\\u0061"];
const BAD_BODY = ["\\x", "\\u12G4", "\\u12", "\\'", "\\", "\u0001", "\t", "\n", "\r", "\u001f", "\\U0041", "\\u{41}"];
const NUMBERS = ["0", "-0", "1", "42", "-17", "1.5", "-0.0", "1e3", "1E+3", "1e-3", "2.5E-10", "9007199254740993", "123456789012345678901234567890",
  "1e400", "-1e400", "0.1", "100", "123456789012345", "1234567890123456"];
const BAD_NUMBERS = ["01", "-01", "1.", ".5", "-", "+1", "1e", "1e+", "1.e3", "Infinity", "NaN", "0x10", "1_000", "--1", "1.2.3", "00",
  "1e.5", "1E.5", "1e+-1", "1ee1", "-.5", "1.5e", "0.e1", "1e+.5", "-e1", "1.5E+"];
const KEYS = ['"a"', '"\\u0061"', '"b"', '"ab1b"', '"ab2b"', '"ab1B"', '"aXb"', '""', '"error"', '"\\u0065rror"', '"err\\u006fr"', '"jsonrpc"', '"id"', '"\\u0069d"',
  '"result"', '"code"', '"message"', '"m\\u0065ssage"', '"nodes"', '"n\\u006fdes"', '"data"', '"k"', '"averyveryverylongkeyname"', '"averyveryverylongkeynamf"', '"😀"', '"\\uD83D\\uDE00"'];
function stringToken(r: R, bad: boolean): string {
  let body = "";
  for (let i = 0, n = r.int(4); i < n; i++) body += r.pick(BODY);
  if (bad) body += r.pick(BAD_BODY);
  return `"${body}"`;
}
interface Style { ws: () => string; bad: number }
function style(r: R): Style {
  const kind = r.int(4), bad = r.chance(0.08) ? 0.01 : 0;
  const base = kind === 0 ? () => "" : kind === 1 ? () => (r.chance(0.7) ? " " : "\n  ") : kind === 2 ? () => r.pick(["", "", "", ...SPACES]) : () => (r.chance(0.5) ? "" : " ");
  return { ws: () => (bad && r.chance(bad) ? r.pick(BAD_SPACES) : base()), bad };
}
/** Random JSON text with whitespace at every token boundary; `bad` occasionally plants an invalid token. */
function randomJson(r: R, depth: number, s: Style, maxDepth = 5): string {
  const bad = s.bad > 0 && r.chance(0.02);
  const roll = r.int(depth >= maxDepth ? 4 : 10);
  if (roll === 0) return bad ? r.pick(BAD_NUMBERS) : r.pick(NUMBERS);
  if (roll <= 2) return stringToken(r, bad);
  if (roll === 3) return bad ? r.pick(["tru", "nul", "True", "nulll", "falsey"]) : r.pick(["true", "false", "null"]);
  const count = r.chance(0.15) ? 0 : 1 + r.int(r.chance(0.1) ? 20 : 4), parts: string[] = [];
  if (roll <= 6) {
    for (let i = 0; i < count; i++) parts.push(s.ws() + randomJson(r, depth + 1, s, maxDepth) + s.ws());
    return `[${parts.join(",") || s.ws()}${bad ? "," : ""}]`;
  }
  const keys: string[] = [];
  for (let i = 0; i < count; i++) {
    let key = r.chance(0.7) ? r.pick(KEYS) : stringToken(r, false);
    // Mostly unique keys; sometimes an exact repeat or an escaped alias of an earlier key (both duplicates).
    if (keys.includes(key) && !r.chance(0.1)) key = `"u${depth}_${i}"`;
    keys.push(key);
    parts.push(`${s.ws()}${key}${s.ws()}:${s.ws()}${randomJson(r, depth + 1, s, maxDepth)}${s.ws()}`);
  }
  return `{${parts.join(",") || s.ws()}}`;
}
/** Top-level members that make, or nearly make, a protocol error envelope, in random order. */
function envelope(r: R, s: Style): string {
  const members: string[] = [];
  const code = r.pick(["1", "-32600", "1.5", "-0", "1e3", "-32601", "2", '"1"', "null", "true"]), message = r.pick(['"bad"', '""', '"\\u0062ad"', '"x y"', '"bad"', "1", "null", "[]"]);
  const errorValue = r.pick([`{"code":${code},"message":${message}}`, `{"code":${code},"message":${message}}`, `{"message":${message},"code":${code}}`,
    `{ "message" : ${message} , "code" : ${code} , "data" : ${randomJson(r, 2, s)} }`, `{"code":${code},"data":null,"message":${message}}`,
    `{"c\\u006fde":${code},"message":${message}}`, `{"code":${code}}`, `{"message":${message}}`, `{}`, `[]`, `"error"`, "null", `{"code":${code},"message":${message},"code":1}`]);
  if (r.chance(0.9)) members.push(`${r.pick(['"error"', '"\\u0065rror"', '"error"'])}:${errorValue}`);
  if (r.chance(0.5)) members.push(`${r.pick(['"jsonrpc"', '"js\\u006enrpc"'])}:${r.pick(['"2.0"', '"\\u0032.0"', '"2.00"', "2.0", '"1.0"', '"2.0 "'])}`);
  if (r.chance(0.6)) members.push(`${r.pick(['"id"', '"\\u0069d"'])}:${r.pick(["1", "0", "-1", "1.5e2", '"1"', "null", "{}"])}`);
  if (r.chance(0.3)) members.push(`"result":${r.pick(["null", "false", "{}", "0", randomJson(r, 2, s)])}`);
  if (r.chance(0.4)) members.push(`"extra":${randomJson(r, 2, s)}`);
  for (let i = members.length - 1; i > 0; i--) { const j = r.int(i + 1); [members[i], members[j]] = [members[j]!, members[i]!]; }
  const object = `{${members.map(member => s.ws() + member.replace(":", s.ws() + ":" + s.ws()) + s.ws()).join(",")}}`;
  return r.chance(0.05) ? `[${object}]` : r.chance(0.05) ? `{"nested":${object}}` : object;
}
/** A valid envelope, or the same with exactly one near miss (half each). */
function envelopeCase(r: R, s: Style): string {
  const errorKey = r.pick(['"error"', '"\\u0065rror"', '"err\\u006Fr"']), code = r.pick(["-32600", "1", "0", "-0", "1.5e3"]), message = r.pick(['"bad"', '""', '"\\u0062ad 😀"']);
  const members = new Map<string, string>([[errorKey, r.chance(0.5) ? `{"code":${code},"message":${message}}` : `{ "message" : ${message}, "data" : [1, {"code":"x"}], "code" : ${code} }`]]);
  const route = r.int(3);
  if (route !== 1) members.set(r.pick(['"jsonrpc"', '"js\\u006Enrpc"']), r.pick(['"2.0"', '"\\u0032.0"', '"2\\u002e0"']));
  if (route !== 0) members.set(r.pick(['"id"', '"\\u0069d"']), r.pick(["1", "0", "-7", "2.5", "1e2"]));
  if (route === 2 && r.chance(0.5)) members.set('"result"', "null");
  if (r.chance(0.3)) members.set('"extra"', randomJson(r, 2, s));
  let text = `{${[...members].map(([key, value]) => `${s.ws()}${key}${s.ws()}:${s.ws()}${value}${s.ws()}`).join(",")}}`;
  if (r.chance(0.5)) {
    const misses: (() => string)[] = [
      () => text.replace(`"code":${code}`, `"code":"${code}"`).replace(`"code" : ${code}`, `"code" : "${code}"`),
      () => text.replace(`"message":${message}`, '"message":1').replace(`"message" : ${message}`, '"message" : null'),
      () => text.replace(/"2(?:\.|\\u002e)0"|"\\u0032\.0"/, '"2.00"').replace(/(\{|,)\s*"(?:id|\\u0069d)"\s*:\s*[-0-9.e]+/, "$1\"id\":\"1\""),
      () => route === 1 ? text.replace(/\}$/, ',"result":0}') : text.replace(/"2(?:\.|\\u002e)0"|"\\u0032\.0"/, '"1.0"'),
      () => `[${text}]`, () => `{"wrapped":${text}}`, () => text.replace(errorKey, '"errors"'), () => text.replace(/\}$/, `,${errorKey}:{}}`),
      () => text.replace(/^\{/, "{ \"error\" : [ ] ,").replace(errorKey, '"other"'), () => text + " x", () => "\ufeff" + text];
    text = r.pick(misses)();
  }
  return text;
}
function mutate(r: R, text: string): string {
  const at = r.int(text.length + 1);
  switch (r.int(10)) {
    case 0: return text.slice(0, at) + r.pick([...SPACES, ...BAD_SPACES]) + text.slice(at);
    case 1: return text.slice(0, at) + text.slice(at + 1);
    case 2: return text.slice(0, at);
    case 3: return text + r.pick(["x", " x", "}", "]", ",", "\u0000", "﻿", " 1", '""']);
    case 4: return r.pick(["﻿", " ", "\u000b", "\u000c"]) + text;
    case 5: return text.slice(0, at) + r.pick(["\\", '"', "{", "[", ",", ":", "\\u", "0", "-", "e", "\u0001"]) + text.slice(at);
    case 6: return text.replace(/"[a-z]/, match => `"\\u00${match.charCodeAt(1).toString(16)}`);
    default: return text;
  }
}
function nested(depth: number, object: boolean, empty: boolean, space: string): string {
  const open = object ? `{${space}"k"${space}:${space}` : `[${space}`, close = object ? `${space}}` : `${space}]`;
  return open.repeat(depth) + (empty ? (object ? `{${space}}` : `[${space}]`) : `${space}0${space}`) + close.repeat(depth);
}
const JSON_COMMANDS = ["curl -fsS http://127.0.0.1/x", "jq . file.json", "node script.js", "python3 script.py", "gh api user", "kubectl get pods -o json",
  "docker ps --format json", "npm ls --json", "system_profiler -json", "pwsh -Command ConvertTo-Json", "git status", "node --test x.js"];
/** One payload under every carrier family: unknown MCP, curl-style shell, and the three exact native wrappers. */
function carriers(r: R, payload: string): Obs[] {
  return [mcp(payload), bash(r.pick(JSON_COMMANDS), payload, r.chance(0.95) ? { exit: 0, truncated: false } : { exit: 1, truncated: false }),
    mcp(`### Result\n${payload}\n### Ran Playwright code\n\`\`\`js\nreturn x;\n\`\`\``, r.pick(["browser_evaluate", "pw_browser_run_code_unsafe", "browser_run_code_unsafe"])),
    mcp(`Script ran on page and returned:\n\`\`\`json\n${payload}${r.pick(["\n```\n", "\n```"])}`, r.pick(["evaluate_script", "x_evaluate_script"]))];
}
function serialize(value: unknown, ws: () => string): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(item => ws() + serialize(item, ws) + ws()).join(",") || ws()}]`;
  return `{${Object.entries(value).filter(([, v]) => v !== undefined).map(([k, v]) => `${ws()}${JSON.stringify(k)}${ws()}:${ws()}${serialize(v, ws)}${ws()}`).join(",") || ws()}}`;
}
/** CDP AX node lists: placements, field order, aliases, ids, ignored flags, envelopes; compact, pretty or mixed. */
function cdpPayload(r: R): string {
  const FIELDS = ["nodeId", "ignored", "ignoredReasons", "role", "name", "properties", "parentId", "childIds", "backendDOMNodeId", "value", "extension"];
  const values: unknown[] = [false, 0, "", null, {}, [], { type: "role", value: "button" }, [{ name: "hidden", value: { type: "boolean", value: false } }], "😀", 9, "a\nb", { deep: { deeper: [1, { x: [] }] } }];
  const length = r.chance(0.03) ? 0 : 1 + r.int(r.chance(0.1) ? 40 : 6), nodes: unknown[] = [];
  for (let n = 0; n < length; n++) {
    if (r.chance(0.01)) { nodes.push(r.pick([[], "node", null, 1])); continue; }
    const node: Record<string, unknown> = {};
    for (const field of FIELDS) {
      if (field === "nodeId") node.nodeId = r.chance(0.97) ? String(r.chance(0.97) ? n + 1 : 1) : r.pick(["", 7, undefined, null, ["1"]]);
      else if (field === "ignored") { if (r.chance(0.97)) node.ignored = r.chance(0.95) ? r.chance(0.5) : r.pick(["false", 0, null]); }
      else if (r.chance(0.5)) node[field] = r.pick(values);
    }
    if (r.chance(0.1)) { const keys = Object.keys(node); const k = keys[r.int(keys.length)]; if (k) { const v = node[k]; delete node[k]; node[k] = v; } }
    nodes.push(node);
  }
  const envelopeValue: unknown = r.pick([() => ({ nodes }), () => ({ id: 4, result: { nodes, extra: [] }, sessionId: "s" }), () => ({ result: { nodes } }),
    () => ({ accessibility: { nodes, tree: "full" }, control: { hasMore: true } }), () => ({ jsonrpc: "2.0", id: 1, result: { nodes } }),
    () => ({ id: 1, error: { code: -1, message: "bad" } }), () => ({ hugr: { nodes } }), () => ({ nodes: null, accessibility: { nodes } }),
    () => ({ id: null, result: { nodes }, accessibility: { nodes: [] } }), () => ({ result: [], accessibility: { nodes } }), () => ({ before: [1, 2], nodes, after: { a: "b" } }),
    () => ({ id: 3, result: "x", accessibility: { nodes } }), () => [{ nodes }], () => ({ jsonrpc: "2.0", error: { code: -1, message: "bad" }, nodes }),
    () => ({ id: 2, error: { code: 1, message: "m" }, accessibility: { nodes } }), () => ({ id: 2, error: { code: "1", message: "m" }, accessibility: { nodes } })])();
  const kind = r.int(3), ws = style(r).ws;
  let text = kind === 0 ? JSON.stringify(envelopeValue) : kind === 1 ? JSON.stringify(envelopeValue, null, r.pick([1, 2, "\t"])) : serialize(envelopeValue, ws);
  if (r.chance(0.15)) { const key = `"${r.pick([...FIELDS, "nodes", "id", "result", "accessibility"])}":`; const at = text.lastIndexOf(key); if (at >= 0) text = `${text.slice(0, at)}"\\u00${key.charCodeAt(1).toString(16)}${key.slice(2)}${text.slice(at + key.length)}`; }
  if (r.chance(0.05)) { const key = `"${r.pick(FIELDS)}":`; const at = text.indexOf(key); if (at >= 0) text = `${text.slice(0, at)}"\\u00${key.charCodeAt(1).toString(16)}${key.slice(2)}${text.slice(at + key.length)}`; }
  if (r.chance(0.1)) {
    // Escaped key spellings per occurrence: equal decoded names whose lexemes differ only in hex case refuse.
    const key = r.pick(["role", "name", "value", "extension", "parentId"]), hex = key.charCodeAt(0).toString(16);
    text = text.replaceAll(`"${key}":`, () => `"\\u00${r.chance(0.5) ? hex : hex.toUpperCase()}${key.slice(1)}":`);
  }
  if (r.chance(0.04)) text = mutate(r, text);
  return text;
}
function cdpCarrier(r: R, text: string): Obs {
  return r.chance(0.3) ? mcp(`### Result\n${text}\n### Ran Playwright code\n\`\`\`js\nreturn x;\n\`\`\``, "browser_run_code_unsafe")
    : r.chance(0.2) ? bash("node ax.js", text) : r.chance(0.1) ? mcp(`Script ran on page and returned:\n\`\`\`json\n${text}\n\`\`\``, "evaluate_script") : mcp(text, "cdp");
}

// ---- fixed corpora ----
const ROOT = new URL("../fixtures/", import.meta.url);
function jsonFixtureFiles(directory: URL, into: URL[] = []): URL[] {
  for (const name of readdirSync(directory).sort()) {
    const url = new URL(name, directory);
    if (statSync(url).isDirectory()) jsonFixtureFiles(new URL(`${name}/`, directory), into);
    else if (/\.(?:json|jsonl|ndjson)$/.test(name)) into.push(url);
  }
  return into;
}
/** Strings embedded in a fixture that carry JSON or NDJSON (captured tool outputs, MCP text blocks). */
function embedded(value: unknown, into: Set<string>): void {
  if (typeof value === "string") { const trimmed = value.trimStart(); if ((trimmed.startsWith("{") || trimmed.startsWith("[") || value.startsWith("### Result\n") || value.startsWith("Script ran on page")) && value.length < 600000) into.add(value); }
  else if (Array.isArray(value)) for (const item of value) embedded(item, into);
  else if (value !== null && typeof value === "object") for (const item of Object.values(value)) embedded(item, into);
}
/** Real MCP captures: every tools/call text block with its exact tool name, a prefixed alias and an unknown tool. */
function captureBlocks(text: string): { tool: string; text: string }[] {
  const blocks: { tool: string; text: string }[] = [];
  let capture: { records?: { direction: string; message: { id?: number; method?: string; params?: { name?: string }; result?: { content?: { type: string; text?: string }[] } } }[] };
  try { capture = JSON.parse(text); } catch { return blocks; }
  const calls = new Map<number, string>();
  for (const record of capture.records ?? []) {
    const message = record.message;
    if (record.direction === "send" && message.method === "tools/call" && message.id !== undefined) calls.set(message.id, message.params?.name ?? "");
    if (record.direction !== "receive" || message.id === undefined || !calls.has(message.id)) continue;
    for (const block of message.result?.content ?? []) if (block.type === "text" && block.text !== undefined) blocks.push({ tool: calls.get(message.id)!, text: block.text });
  }
  return blocks;
}

test("fixtures: every JSON-bearing fixture, embedded capture and MCP text block matches the tree path", () => {
  const r = rng(0xf17e);
  const strings = new Set<string>();
  let files = 0, blocks = 0;
  for (const url of jsonFixtureFiles(ROOT)) {
    const text = readFileSync(url, "utf8"), label = url.pathname.slice(ROOT.pathname.length);
    files++;
    checkText(text, label); checkErrorText(text, label);
    for (const observation of carriers(r, text)) checkObservation(observation, label, true);
    if (url.pathname.endsWith(".jsonl") || url.pathname.endsWith(".ndjson")) {
      for (const line of text.split("\n")) if (line) { try { embedded(JSON.parse(line), strings); } catch { /* not JSON */ } }
    } else { try { embedded(JSON.parse(text), strings); } catch { /* not JSON */ } }
    for (const block of captureBlocks(text)) {
      blocks++;
      for (const tool of [block.tool, `capture_${block.tool}`, "unknown"]) checkObservation(mcp(block.text, tool), `${label} ${tool}`, true);
      checkErrorText(block.text, `${label} block`);
    }
  }
  for (const state of ["before", "modal"]) {
    const input = readFileSync(new URL(`automatic/browser/native/cdp-${state}.json`, ROOT), "utf8");
    for (const text of [input, JSON.stringify(JSON.parse(input)), JSON.stringify(JSON.parse(input), null, 2)]) {
      checkText(text, `cdp-${state}`);
      for (const observation of [mcp(text, "cdp"), cdpCarrier(r, text), bash("node ax.js", text)]) checkObservation(observation, `cdp-${state}`, true);
    }
  }
  let count = 0;
  for (const text of [...strings].sort()) {
    if (++count > 4000) break;
    checkText(text, "embedded"); checkErrorText(text, "embedded");
    checkObservation(mcp(text), "embedded"); checkObservation(bash("curl -fsS http://127.0.0.1/x", text), "embedded curl");
  }
  assert.ok(files >= 500 && blocks >= 20 && count >= 50, `${files} files, ${blocks} MCP blocks, ${count} embedded payloads`);
});

test("boundaries: nesting 63/64/65, node counts 24,999/25,000/25,001, NDJSON budget, whitespace, BOM and trailing junk", () => {
  const texts: string[] = [];
  for (const depth of [62, 63, 64, 65]) for (const object of [false, true]) for (const empty of [false, true]) for (const space of ["", " ", "\n "]) texts.push(nested(depth, object, empty, space));
  for (const n of [24997, 24998, 24999, 25000]) for (const space of ["", " ", "\n"]) {
    texts.push(`[${space}${Array(n).fill("1").join(`${space},${space}`)}${space}]`); // n + 1 nodes
    texts.push(`[${Array(n - 1).fill('"s"').join(",")},[]]`); // n + 1 nodes, empty tail
  }
  for (const keys of [12498, 12499, 12500]) for (const tail of ["", ',"z":[1]', ',"z":{}', ',"z":[ ]']) {
    texts.push(`{${Array.from({ length: keys }, (_, i) => `"k${i}":${i % 3 ? "null" : i}`).join(",")}${tail}}`);
  }
  // NDJSON: 25,000 one-node records admit, 25,001 refuse; three-node records against the shared budget.
  for (const lines of [24999, 25000, 25001]) for (const end of ["", "\n"]) texts.push(Array(lines).fill("1").join("\n") + end);
  for (const [lines, last] of [[8333, "1"], [8333, "[1]"], [8333, "[1,1]"], [8332, "[1,1]"]] as const) texts.push(Array(lines).fill("[1,1]").join("\n") + `\n${last}\n`);
  const small = ['{"a":1}', "[1, 2]", '"x"', "0", "{ }", "[ ]", "true"];
  for (const value of small) {
    for (const space of [...SPACES, ...BAD_SPACES]) texts.push(space + value, value + space, value.replace(/[,:]/, match => space + match + space));
    for (const junk of ["x", " x", "}", "]", ",", "\u0000", " 1", '""', "\n{}", "{}"]) texts.push(value + junk);
    texts.push("﻿" + value, "﻿ " + value);
  }
  // CDP at the node limit: few cells, one long value (10 + n and 14 + (n - 4) nodes).
  for (const n of [24989, 24990, 24991]) for (const indent of [0, 1]) {
    texts.push(JSON.stringify({ nodes: [{ nodeId: "1", ignored: false, v: Array(n).fill(1) }] }, null, indent));
    texts.push(JSON.stringify({ id: 1, result: { nodes: [{ nodeId: "1", ignored: true, v: Array(n - 4).fill(0) }] } }, null, indent));
  }
  for (const text of texts) {
    const wrapped = mcp(`### Result\n${text}\n### Ran Playwright code\n`, "browser_run_code_unsafe");
    checkText(text, `boundary ${text.length}`);
    for (const observation of [mcp(text), bash("jq . big.json", text), wrapped, mcp(text, "cdp")]) checkObservation(observation, `boundary ${text.length}`, true);
    checkErrorText(text, "boundary");
  }
  // Positive controls for the arithmetic above: exactly 25,000 nodes admit, 25,001 refuse.
  for (const [n, admitted] of [[24999, true], [25000, false]] as const) {
    const text = `[ ${Array(n).fill("1").join(" , ")} ]`;
    assert.equal(next.reduceAutomaticJson(Object.freeze(mcp(text))) !== undefined, admitted, `json at ${n + 1} nodes`);
  }
  for (const [n, admitted] of [[24990, true], [24991, false]] as const) {
    const text = JSON.stringify({ nodes: [{ nodeId: "1", ignored: false, v: Array(n).fill(1) }] }, null, 1);
    assert.equal(reduceAutomaticCdp(Object.freeze(mcp(text, "cdp"))) !== undefined, admitted, `cdp at ${10 + n} nodes`);
  }
  // Duplicate keys around the 16-key switch to a Set, exact and through escaped aliases, plus signature collisions.
  for (let keys = 14; keys <= 19; keys++) for (const duplicate of ['"k3"', '"\\u006b3"', '"k3 "', '"k' + (keys - 1) + '"', '"\\u006b' + (keys - 1) + '"', '"ab1b"', '"ab2b"', '"ab1B"', '"ab\\u0031b"']) {
    const members = Array.from({ length: keys }, (_, i) => `"k${i}":${i}`);
    if (keys % 2) members.splice(2, 0, '"ab1b":0');
    const text = `{${members.join(",")},${duplicate}:true}`;
    checkText(text, `duplicates ${keys} ${duplicate}`); checkObservation(mcp(text), `duplicates ${keys}`, true);
  }
});

test("seeded: generated JSON, NDJSON, envelopes and mutations under every carrier, scanner and errorText", () => {
  const r = rng(0x5eed2026);
  for (let i = 0; i < 64000; i++) {
    const s = style(r);
    let payload: string;
    const kind = r.int(10);
    if (kind < 5) payload = randomJson(r, 0, s);
    else if (kind < 7) payload = envelope(r, s);
    else if (kind < 9) payload = Array.from({ length: 1 + r.int(5) }, () => r.chance(0.2) ? envelope(r, s).replace(/[\r\n]/g, " ") : randomJson(r, 1, s).replace(/[\r\n]/g, " "))
      .join(r.pick(["\n", "\r\n", "\n\n", "\n \n"])) + r.pick(["", "\n", "\n\n"]);
    else payload = randomJson(r, 0, s, 8);
    if (r.chance(0.25)) payload = mutate(r, payload);
    if (r.chance(0.1)) payload = r.pick(SPACES) + payload + r.pick(SPACES);
    const label = `seeded#${i}`;
    checkText(payload, label);
    checkErrorText(payload, label);
    const observations = carriers(r, payload);
    checkObservation(observations[0]!, label, i % 16 === 0);
    checkObservation(observations[1 + r.int(3)]!, label, i % 16 === 8);
    if (i % 4 === 0) checkErrorText(observations[2]!.output, `${label} wrapped`);
  }
  // Envelopes and near misses on their own: positive controls for the verdict and for errorText.
  for (let i = 0; i < 12000; i++) {
    const payload = envelopeCase(r, style(r)), label = `envelope#${i}`;
    checkText(payload, label); checkErrorText(payload, label);
    checkObservation(r.chance(0.5) ? mcp(payload) : bash("curl -fsS http://127.0.0.1/rpc", payload), label);
  }
});

test("seeded CDP: placements, aliases, ids and whitespace under every carrier", () => {
  const r = rng(0xc0d9);
  for (let i = 0; i < 12000; i++) {
    const text = cdpPayload(r), label = `cdp#${i}`;
    checkText(text, label);
    checkObservation(cdpCarrier(r, text), label, i % 8 === 0);
    if (i % 3 === 0) checkObservation(mcp(text, "cdp"), `${label} plain`);
  }
  // Cell bound and compactness: compact rows reuse recorded spans; spaced rows go through range scans.
  for (const [columns, rows] of [[25, 1000], [23, 1087], [20, 1250], [20, 1251]] as const) for (const indent of [0, 1]) {
    const text = JSON.stringify({ nodes: Array.from({ length: rows }, (_, i) => ({ nodeId: String(i + 1), ignored: false, [`k${i % (columns - 2)}`]: i % 3 ? null : { v: [i, " "] } })) }, null, indent);
    checkText(text, `cells ${columns}x${rows}`); checkObservation(mcp(text, "cdp"), `cells ${columns}x${rows} ${indent}`, true);
  }
});

test("state: memo reuse, interleaved texts and failed scans leave no state behind", () => {
  const r = rng(0x57a7e);
  // A reused, mutated observation object never receives another text's verdict, records or tree.
  const observation = { ...mcp('{ "nodes": [ { "nodeId": "1", "ignored": false } ] }', "cdp") };
  const reference = { ...observation };
  for (let i = 0; i < 3000; i++) {
    const payload = r.chance(0.5) ? cdpPayload(r) : randomJson(r, 0, style(r));
    const wrapped = r.chance(0.3), tool = wrapped ? "browser_evaluate" : r.pick(["cdp", "unknown"]);
    observation.output = reference.output = wrapped ? `### Result\n${payload}\n### Ran Playwright code\n` : payload;
    (observation as { tool: string }).tool = (reference as { tool: string }).tool = tool;
    for (const [id, expected, current] of pairs) {
      const a = outcome(expected(reference), reference.output), b = outcome(current(observation), observation.output);
      if (a !== b) assert.fail(`memo ${id} #${i}: ${a.slice(0, 120)} != ${b.slice(0, 120)}`);
    }
    // Interleaving: a failing scan of another text, then range scans of this text, keep results exact.
    scanJson(payload.slice(0, payload.length >> 1), 0, 25000, [], []);
    const tree = ref.parseJson(payload);
    if (tree) for (const node of subnodes(tree, [], 12)) {
      const pieces: Piece[] = [], required: Span[] = [], expectedPieces: Piece[] = [], expectedRequired: Span[] = [];
      scanJsonValue(payload, node.span[0], 0, Infinity, pieces, required); ref.emitLexical(node, expectedPieces, expectedRequired);
      assert.equal(JSON.stringify(pieces) + JSON.stringify(required), JSON.stringify(expectedPieces) + JSON.stringify(expectedRequired), `interleaved #${i}`);
    }
  }
  // The live tree path stays available and identical (jsonSectionRoot still parses on demand).
  for (const text of ['{"a":[1, 2]}', "[1,", '### Result\n{ "z" : 1 }\n### Ran Playwright code\n']) {
    const o = Object.freeze(mcp(text, "browser_evaluate")), root = next.jsonSectionRoot(o)?.root;
    assert.equal(JSON.stringify(root), JSON.stringify(ref.parseJson(next.nativeJsonSection(o)?.output ?? "") ?? undefined), text);
    assert.equal(JSON.stringify(liveParseJson(text)), JSON.stringify(ref.parseJson(text)), text);
  }
});

test("totals: at least 200,000 differential cases with substantial admitted and positive shares", () => {
  const total = stats.texts + stats.observations + stats.errorTexts;
  console.log(`stream differential: ${JSON.stringify({ total, ...stats })}`);
  assert.ok(total >= 200000, `only ${total} cases`);
  assert.ok(stats.valid >= 20000 && stats.envelopes >= 2000 && stats.json >= 20000 && stats.cdp >= 2000 && stats.errorPositive >= 2000,
    `positive controls too small: ${JSON.stringify(stats)}`);
});
