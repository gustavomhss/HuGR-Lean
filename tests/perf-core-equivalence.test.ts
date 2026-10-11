import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { filterStructured } from "../src/core/structured.js";
import { jsonReduction, parseJson, type JsonNode } from "../src/core/structured-json.js";
import { renderReduction } from "../src/core/structured-render.js";
import type { StructuredObservation } from "../src/core/structured-types.js";
import type { Piece, Reduction, Span } from "../src/core/types.js";

// Differential oracle for the perf rewrite of the shared JSON parser and renderers. The reference copies below are
// verbatim from git 716578a (perf/core base): src/core/structured-json.ts parseJson, src/core/structured-render.ts
// renderReduction and the inline renderer of src/core/structured.ts filterStructured. Only names were changed.
/* ---- reference: src/core/structured-json.ts@716578a parseJson (verbatim; renamed) ---- */
/** Bounded, duplicate-key-rejecting JSON parser. Keeps original lexemes and UTF-16 spans. */
function referenceParseJson(text: string): JsonNode | undefined {
  try {
    JSON.parse(text);
    let pos = 0, count = 0;
    const whitespace = () => { while (/[\t\n\r ]/.test(text[pos] ?? "x")) pos++; };
    function value(depth: number): JsonNode {
      if (depth > 64 || ++count > 25000) throw new Error("JSON admission limit");
      whitespace();
      const start = pos, token = text[pos++];
      if (token === "{" || token === "[") {
        const entries: { name: string; key: JsonNode; value: JsonNode }[] = [], items: JsonNode[] = [], names = new Set<string>();
        const close = token === "{" ? "}" : "]";
        whitespace();
        while (text[pos] !== close) {
          if (token === "{") {
            const key = value(depth + 1);
            if (key.kind !== "scalar" || typeof key.value !== "string" || names.has(key.value)) throw new Error("Invalid JSON key");
            names.add(key.value); whitespace();
            if (text[pos++] !== ":") throw new Error("Invalid JSON colon");
            entries.push({ name: key.value, key, value: value(depth + 1) });
          } else items.push(value(depth + 1));
          whitespace();
          if (text[pos] === close) break;
          if (text[pos++] !== ",") throw new Error("Invalid JSON comma");
          whitespace();
        }
        pos++;
        return token === "{" ? { kind: "object", entries, span: [start, pos] } : { kind: "array", items, span: [start, pos] };
      }
      if (token === '"') {
        while (pos < text.length) {
          const char = text[pos++];
          if (char === "\\") pos++;
          else if (char === '"') break;
        }
      } else while (pos < text.length && !/[\t\n\r ,\]}]/.test(text[pos]!)) pos++;
      return { kind: "scalar", value: JSON.parse(text.slice(start, pos)) as string | number | boolean | null, span: [start, pos] };
    }
    const result = value(0); whitespace();
    return pos === text.length ? result : undefined;
  } catch { return undefined; }
}

/* ---- reference: src/core/structured-render.ts@716578a (verbatim; renamed) ---- */
// Fixed representation syntax only. Every input-specific label/value remains a source span.
const REFERENCE_RENDER_FORMATTING = new Set(["", " ", "\t", "\n", ":", ",", "[", "]", "{", "}", "-", "=", ": ", '"scope":', '"columns":', '"rows":', '"cellEncoding":"optional"', "text"]);
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
function ensure(condition: unknown): asserts condition { if (!condition) throw new Error("Invalid source-backed reduction"); }
function checkedSpan(value: unknown, output: string): Span {
  ensure(Array.isArray(value) && value.length === 2);
  const [start, end] = value;
  ensure(Number.isSafeInteger(start) && Number.isSafeInteger(end) && start >= 0 && start < end && end <= output.length);
  for (const index of [start, end]) {
    const left = output.charCodeAt(index - 1), right = output.charCodeAt(index);
    ensure(!(left >= 0xd800 && left <= 0xdbff && right >= 0xdc00 && right <= 0xdfff));
  }
  return [start, end];
}

/** Shared intact-evidence renderer; execution admission stays with each caller. */
function referenceRenderReduction(output: string, reduction: Reduction): string {
  ensure(record(reduction));
  const { pieces, required: evidence } = reduction;
  ensure(Array.isArray(pieces) && pieces.length > 0 && Array.isArray(evidence) && evidence.length > 0);
  const emitted: [number, number][] = [], parts: string[] = [];
  let adjacent = false;
  for (const piece of pieces) {
    if (Array.isArray(piece)) {
      const span = checkedSpan(piece, output), last = emitted[emitted.length - 1];
      if (adjacent && last?.[1] === span[0]) last[1] = span[1];
      else emitted.push([span[0], span[1]]);
      parts.push(output.slice(...span)); adjacent = true;
    } else {
      ensure(record(piece));
      const { text } = piece;
      ensure(typeof text === "string" && REFERENCE_RENDER_FORMATTING.has(text));
      parts.push(text); if (text.length) adjacent = false;
    }
  }
  ensure(emitted.length > 0);
  emitted.sort((a, b) => a[0] - b[0]);
  const required = evidence.map(span => checkedSpan(span, output)).sort((a, b) => a[0] - b[0]);
  let cursor = 0, farthest = -1;
  for (const [start, end] of required) {
    while (cursor < emitted.length && emitted[cursor]![0] <= start) farthest = Math.max(farthest, emitted[cursor++]![1]);
    ensure(farthest >= end);
  }
  return parts.join("");
}

/* ---- reference: src/core/structured.ts@716578a inline renderer (verbatim lines 47-72; wrapped, returns the join;
   its own ensure message differs but every throw there becomes failed_open) ---- */
const REFERENCE_STRUCTURED_FORMATTING = new Set(["", " ", "\t", "\n", ":", ",", "[", "]", "{", "}", "-", "=", ": ", '"scope":']);
function referenceStructuredRender(output: string, reduction: Reduction): string {
    ensure(record(reduction));
    const { pieces, required: evidence } = reduction;
    ensure(Array.isArray(pieces) && pieces.length > 0 && Array.isArray(evidence) && evidence.length > 0);
    const emitted: [number, number][] = [], parts: string[] = [];
    let adjacent = false;
    for (const piece of pieces) {
      if (Array.isArray(piece)) {
        const span = checkedSpan(piece, output), last = emitted[emitted.length - 1];
        if (adjacent && last?.[1] === span[0]) last[1] = span[1];
        else emitted.push([span[0], span[1]]);
        parts.push(output.slice(...span)); adjacent = true;
      } else {
        ensure(record(piece));
        const { text } = piece;
        ensure(typeof text === "string" && REFERENCE_STRUCTURED_FORMATTING.has(text));
        parts.push(text); if (text.length) adjacent = false;
      }
    }
    ensure(emitted.length > 0);
    emitted.sort((a, b) => a[0] - b[0]);
    const required = evidence.map(span => checkedSpan(span, output)).sort((a, b) => a[0] - b[0]);
    let cursor = 0, farthest = -1;
    for (const [start, end] of required) {
      while (cursor < emitted.length && emitted[cursor]![0] <= start) farthest = Math.max(farthest, emitted[cursor++]![1]);
      ensure(farthest >= end);
    }
    return parts.join("");
}

/* ---- differential harness ---- */
const ROOT = fileURLToPath(new URL("../", import.meta.url));
function rng(seed: number): () => number {
  let state = seed >>> 0;
  return () => { state = (state + 0x6d2b79f5) >>> 0; let t = state; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
type Random = () => number;
const int = (random: Random, n: number): number => Math.floor(random() * n);
const pick = <T>(random: Random, list: readonly T[]): T => list[int(random, list.length)]!;
let parseCases = 0, parsedCases = 0, renderCases = 0, renderedCases = 0;
/** Cheap structural fingerprint (node count + rolling hash of kinds, spans and values), computed iteratively. */
function fingerprint(root: JsonNode): string {
  let count = 0, hash = 0x811c9dc5;
  const mix = (value: string) => { for (let i = 0; i < value.length; i++) hash = Math.imul(hash ^ value.charCodeAt(i), 0x01000193) >>> 0; };
  const stack: JsonNode[] = [root];
  while (stack.length) {
    const node = stack.pop()!;
    count++; mix(`${node.kind}:${node.span[0]}:${node.span[1]};`);
    if (node.kind === "scalar") mix(`${typeof node.value}:${String(Object.is(node.value, -0) ? "-0" : node.value)};`);
    else if (node.kind === "array") for (let i = node.items.length - 1; i >= 0; i--) stack.push(node.items[i]!);
    else for (let i = node.entries.length - 1; i >= 0; i--) { const entry = node.entries[i]!; mix(`${entry.name};`); stack.push(entry.value, entry.key); }
  }
  return `${count}/${hash.toString(16)}`;
}
function sameParse(text: string): void {
  const actual = parseJson(text), expected = referenceParseJson(text);
  parseCases++; if (expected !== undefined) parsedCases++;
  const label = () => JSON.stringify(text.slice(0, 160));
  // Admission and a cheap fingerprint first: a diverging large tree fails as a clean assertion, never by diffing it.
  if ((actual === undefined) !== (expected === undefined)) assert.fail(`parseJson admission diverged (${actual === undefined ? "refused" : "admitted"}) for ${label()}`);
  if (actual === undefined || expected === undefined) return;
  const left = fingerprint(actual), right = fingerprint(expected);
  if (left !== right) assert.fail(`parseJson tree diverged (${left} != ${right}) for ${label()}`);
  assert.deepStrictEqual(actual, expected, `parseJson diverged for ${label()}`);
}
type Outcome = { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly type: string; readonly message: string };
function outcome(run: () => unknown): Outcome {
  try { return { ok: true, value: run() }; }
  catch (error) { return { ok: false, type: (error as Error).constructor.name, message: (error as Error).message }; }
}
function structuredExpected(output: string, reduction: unknown): unknown {
  const inputBytes = Buffer.byteLength(output, "utf8");
  if (reduction === undefined) return { status: "passthrough", reason: "unsupported_output", inputBytes, outputBytes: inputBytes };
  const result = outcome(() => referenceStructuredRender(output, reduction as Reduction));
  if (!result.ok) return { status: "failed_open", reason: "invalid_structured_input_or_reduction", inputBytes, outputBytes: inputBytes };
  const replacement = result.value as string, outputBytes = Buffer.byteLength(replacement, "utf8");
  if (!replacement.length || outputBytes >= inputBytes) return { status: "passthrough", reason: "not_smaller", inputBytes, outputBytes: inputBytes };
  return { status: "reduced", profile: "structured-json", reason: "structured_reduction", replacement, inputBytes, outputBytes };
}
const observation = (output: string): StructuredObservation => ({ format: "json", output, completeness: "complete", termination: { kind: "exited", code: 0 } });
function sameRender(output: string, reduction: unknown): void {
  const expected = outcome(() => referenceRenderReduction(output, reduction as Reduction));
  renderCases++; if (expected.ok) renderedCases++;
  assert.deepStrictEqual(outcome(() => renderReduction(output, reduction as Reduction)), expected, `renderReduction diverged for ${JSON.stringify(output)}`);
  const actual = filterStructured(observation(output), { reducers: { json: () => reduction as Reduction } });
  assert.deepStrictEqual(actual, structuredExpected(output, reduction), `filterStructured diverged for ${JSON.stringify(output)}`);
}

/* ---- seeded JSON generator ---- */
const WHITESPACE = ["", "", "", " ", "\n", "\t", "\r\n  ", "  \t"];
const STRING_PARTS = ["a", "Z", "0", " ", "key", "é", "é", "🦀", "中", "\\\"", "\\\\", "\\/", "\\b", "\\f", "\\n", "\\r", "\\t", "\\u0041", "\\u00e9", "\\ud83e\\udd80", "\\ud800", "\\udfff", "\udc00", "\ud800", "{", "}", "[", "]", ":", ",", "'"];
const NUMBERS = ["0", "-0", "-0.0", "0e0", "1", "-1", "42", "1.5", "-12.25", "1e400", "-1e400", "1e-400", "5e-324", "1.7976931348623157e308", "12345678901234567890123", "-9007199254740993", "9007199254740992", "1E2", "1e+2", "2e-7", "123.456e-2", "0.1", "1.50E+10"];
const KEYS = ['"a"', '"\\u0061"', '"b"', '"id"', '"\\u0069d"', '""', '"__proto__"', '"constructor"'];
function jsonString(random: Random): string {
  let text = '"';
  for (let index = int(random, 6); index > 0; index--) text += pick(random, STRING_PARTS);
  return text + '"';
}
function jsonValue(random: Random, depth: number): string {
  const ws = () => pick(random, WHITESPACE), roll = random();
  if (depth < 6 && roll < 0.22) {
    const keys: string[] = [];
    for (let index = int(random, 5); index > 0; index--) keys.push(random() < 0.35 ? pick(random, KEYS) : jsonString(random));
    return `{${ws()}${keys.map(key => `${key}${ws()}:${ws()}${jsonValue(random, depth + 1)}`).join(`${ws()},${ws()}`)}${ws()}}`;
  }
  if (depth < 6 && roll < 0.4) {
    const items: string[] = [];
    for (let index = int(random, 5); index > 0; index--) items.push(jsonValue(random, depth + 1));
    return `[${ws()}${items.join(`${ws()},${ws()}`)}${ws()}]`;
  }
  if (roll < 0.65) return jsonString(random);
  if (roll < 0.88) return random() < 0.5 ? pick(random, NUMBERS) : String(int(random, 1e6) * (random() < 0.5 ? -1 : 1)) + (random() < 0.3 ? `.${int(random, 1000)}` : "") + (random() < 0.2 ? `e${int(random, 40) - 20}` : "");
  return pick(random, ["true", "false", "null"]);
}
const JUNK = ["{", "}", "[", "]", ",", ":", '"', "\\", "x", " ", " ", "﻿", " ", "0", "-", ".", "e", "tru", "nul"];
function mutate(random: Random, text: string): string {
  const at = int(random, text.length + 1);
  switch (int(random, 6)) {
    case 0: return text.slice(0, at) + text.slice(at + 1);
    case 1: return text.slice(0, at) + pick(random, JUNK) + text.slice(at);
    case 2: return text.slice(0, at);
    case 3: return text + pick(random, JUNK);
    case 4: return pick(random, JUNK) + text;
    default: return text.slice(0, at) + pick(random, JUNK) + text.slice(at + 1);
  }
}

test("parseJson equals the original parser on every fixture and every JSON-looking embedded output", () => {
  const files: string[] = [];
  const walk = (directory: string) => {
    for (const name of readdirSync(directory).sort()) {
      const file = path.join(directory, name);
      if (statSync(file).isDirectory()) walk(file); else files.push(file);
    }
  };
  walk(path.join(ROOT, "fixtures"));
  const random = rng(0x5eed);
  let jsonFiles = 0, embedded = 0;
  const embeddedOutputs = (value: unknown, sink: string[]): void => {
    if (typeof value === "string") { const head = value.trimStart()[0]; if (head === "{" || head === "[" || head === '"') sink.push(value); }
    else if (Array.isArray(value)) for (const item of value) embeddedOutputs(item, sink);
    else if (value && typeof value === "object") for (const item of Object.values(value)) embeddedOutputs(item, sink);
  };
  let reductions = 0;
  const exercise = (text: string): void => {
    sameParse(text);
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch { return; }
    // Real compact reductions (pretty source and already-compact source) through both renderers.
    for (const source of [text, JSON.stringify(parsed)]) {
      const node = referenceParseJson(source);
      if (node) { reductions++; sameRender(source, jsonReduction(node)); }
    }
    sameParse(mutate(random, text)); sameParse(text.slice(0, int(random, text.length)));
    const nested: string[] = [];
    embeddedOutputs(parsed, nested);
    for (const output of nested) { embedded++; sameParse(output); sameParse(mutate(random, output)); }
  };
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    if (/\.json$/i.test(file)) jsonFiles++;
    exercise(text);
    if (/\.(jsonl|ndjson|txt|log|out)$/i.test(file) || text.includes("\n{")) for (const line of text.split("\n")) if (/^\s*[[{]/.test(line)) exercise(line);
  }
  // Positive control: the corpus must really contain admitted JSON documents and embedded tool outputs.
  assert.ok(jsonFiles >= 300 && embedded >= 100 && parsedCases >= 1000 && reductions >= 1000, `thin corpus: ${jsonFiles} json files, ${embedded} embedded, ${parsedCases} parsed, ${reductions} reductions`);
});

test("parseJson equals the original parser on seeded random valid and invalid JSON", () => {
  const random = rng(20261011);
  const before = parsedCases;
  for (let index = 0; index < 20000; index++) {
    const ws = () => pick(random, WHITESPACE), text = `${ws()}${jsonValue(random, 0)}${ws()}`;
    sameParse(text);
    sameParse(mutate(random, text));
  }
  assert.ok(parsedCases - before >= 15000, "generator produced too few admitted documents");
});

test("parseJson equals the original parser at the depth, node-count and duplicate-key boundaries", () => {
  for (let depth = 60; depth <= 68; depth++) {
    sameParse("[".repeat(depth) + "]".repeat(depth));
    sameParse("[".repeat(depth) + "1" + "]".repeat(depth));
    sameParse("[".repeat(depth) + "{}" + "]".repeat(depth));
    sameParse('{"k":'.repeat(depth) + "1" + "}".repeat(depth));
    sameParse('{"k":'.repeat(depth) + "{}" + "}".repeat(depth));
    sameParse('{"k":'.repeat(depth) + '{"x":0}' + "}".repeat(depth));
    sameParse(" [ ".repeat(depth) + " ] ".repeat(depth));
  }
  for (const items of [0, 1, 12498, 12499, 12500, 24997, 24998, 24999, 25000, 25001]) {
    sameParse(`[${Array.from({ length: items }, (_, index) => index % 3 ? String(index) : `"${index}"`).join(",")}]`);
    if (items <= 12500) sameParse(`{${Array.from({ length: items }, (_, index) => `"k${index}":${index}`).join(",")}}`);
  }
  for (const size of [8, 9, 10, 40]) {
    const keys = Array.from({ length: size }, (_, index) => `"k${index}"`);
    sameParse(`{${keys.map(key => `${key}:1`).join(",")}}`);
    for (const alias of ['"k0"', '"\\u006b0"', `"k${size - 1}"`, `"\\u006b${size - 1}"`, '"k"']) sameParse(`{${[...keys, alias].map(key => `${key}:1`).join(",")}}`);
  }
  for (const text of ['{"a":1,"a":2}', '{"a":1,"\\u0061":2}', '{"\\ud83e\\udd80":1,"🦀":2}', '{"a":{"a":1}}', '{"__proto__":1,"__proto__":2}', '{"":1,"":2}']) sameParse(text);
  for (const text of ["", " ", "x", "1 2", "[1,]", '{"a":1,}', "﻿1", " 1", "1 ", "[1]x", "01", "-", "1.", ".5", "+1", "NaN", "Infinity", '"\u0001"', "'a'", "[", "]", "{}}", "nulll", "-0", "1e400", '"\\ud800"', '"\udc00"']) sameParse(text);
});

/* ---- seeded reduction generator ---- */
const OUTPUT_PARTS = ["a", "b", "Z", "0", " ", "\n", "\t", ":", ",", "[", "]", "{", "}", "-", "=", ": ", "é", "🦀", "𝒳", "\ud800", "\udc00", '"scope":', "text"];
const TEXTS = [...new Set([...REFERENCE_RENDER_FORMATTING, ...REFERENCE_STRUCTURED_FORMATTING])];
const BAD_TEXTS = ["x", "  ", "::", ":\n", "TEXT", " "];
const splits = (output: string, index: number): boolean => /[\ud800-\udbff]/.test(output[index - 1] ?? "") && /[\udc00-\udfff]/.test(output[index] ?? "");
function span(random: Random, output: string, from?: number, valid = false): unknown {
  const length = output.length;
  let start = from ?? int(random, length + 1), end = start + 1 + int(random, Math.max(1, Math.min(8, length - start)));
  if (valid) {
    if (splits(output, start)) start--;
    if (splits(output, end)) end++;
    if (start < 0 || start >= length) return [0, Math.max(1, length - (splits(output, length - 1) ? 2 : 1))].map(index => Math.min(index, length));
    end = Math.min(end, length);
  }
  return [start, end];
}
function badSpan(random: Random, output: string): unknown {
  const length = output.length;
  return pick(random, [[1], [0, 1, 2], [0.5, 2], [-1, 1], [2, 2], [3, 1], [0, length + 1], ["0", "1"], [0, Number.MAX_SAFE_INTEGER + 1], [NaN, 1], null, undefined, "0,1", 3, {}]);
}
function reduction(random: Random, output: string): unknown {
  return random() < 0.5 ? validReduction(random, output) : anyReduction(random, output);
}
/** Mostly-accepted shape: code-point aligned spans, whitelisted text, required drawn from emitted spans. */
function validReduction(random: Random, output: string): unknown {
  const pieces: unknown[] = [], spans: [number, number][] = [];
  let cursor = int(random, output.length);
  for (let index = 1 + int(random, 12); index > 0; index--) {
    if (random() < 0.6) {
      const next = span(random, output, random() < 0.6 ? cursor : undefined, true) as [number, number];
      if (next[0] < next[1] && next[1] <= output.length) { pieces.push(next); spans.push(next); cursor = next[1]; }
    } else {
      const text = random() < 0.4 ? output.slice(cursor, cursor + 1) : pick(random, [...REFERENCE_STRUCTURED_FORMATTING]);
      pieces.push({ text: REFERENCE_STRUCTURED_FORMATTING.has(text) ? text : ":" }); if (text === output.slice(cursor, cursor + 1)) cursor++;
    }
  }
  const required = spans.filter(() => random() < 0.7).map(([start, end]) => [start, end]);
  if (!required.length && spans.length) required.push([...spans[0]!]);
  if (random() < 0.3) required.reverse();
  if (random() < 0.1) required.push(span(random, output, undefined, true) as number[]);
  return { pieces, required: required.length ? required : [[0, 1]] };
}
function anyReduction(random: Random, output: string): unknown {
  const pieces: unknown[] = [], spans: [number, number][] = [];
  let cursor = int(random, output.length + 1);
  for (let index = int(random, 14); index > 0; index--) {
    const roll = random();
    if (roll < 0.45) {
      const next = span(random, output, random() < 0.5 ? cursor : undefined) as [number, number];
      pieces.push(next); spans.push(next); cursor = next[1];
    } else if (roll < 0.55) { pieces.push({ text: output.slice(cursor, cursor + 1 + int(random, 2)) }); cursor += 1; }
    else if (roll < 0.85) pieces.push({ text: pick(random, TEXTS) });
    else if (roll < 0.9) pieces.push({ text: pick(random, BAD_TEXTS) });
    else if (roll < 0.96) pieces.push(random() < 0.5 ? badSpan(random, output) : pick(random, [{ text: 5 }, {}, null, "a", 1, [[0, 1]]]));
    else pieces.length += 1;
  }
  if (random() < 0.15 && pieces.length > 1) pieces.reverse();
  const required: unknown[] = [];
  for (let index = int(random, 6); index > 0; index--) {
    const roll = random(), chosen = spans.length ? pick(random, spans) : undefined;
    if (chosen && roll < 0.45) required.push([chosen[0], chosen[1]]);
    else if (chosen && roll < 0.6) { const start = chosen[0] + int(random, chosen[1] - chosen[0]); required.push([start, start + 1 + int(random, chosen[1] - start)]); }
    else if (roll < 0.85) required.push(span(random, output));
    else if (roll < 0.93) required.push(badSpan(random, output));
    else required.length += 1 + int(random, 2);
  }
  if (random() < 0.2) required.sort(() => random() - 0.5);
  const shape = random();
  if (shape < 0.02) return pick(random, [null, undefined, [], "x", { pieces }]);
  if (shape < 0.04) return { pieces: [], required };
  if (shape < 0.06) return { pieces, required: [] };
  if (shape < 0.08) return { pieces: pick(random, [null, "x", { 0: [0, 1] }]), required };
  return { pieces, required };
}

test("renderReduction and filterStructured equal the original renderers on seeded valid and invalid reductions", () => {
  const random = rng(0xc0ffee), acceptedBefore = renderedCases;
  for (let index = 0; index < 40000; index++) {
    let output = "";
    for (let part = int(random, 24); part > 0; part--) output += pick(random, OUTPUT_PARTS);
    sameRender(output, reduction(random, output));
  }
  assert.ok(renderedCases - acceptedBefore >= 10000 && renderCases - renderedCases >= 10000, `unbalanced render corpus: ${renderedCases}/${renderCases} accepted`);
});

test("renderers equal the original on real JSON reductions, coalesced runs, unsorted spans and sparse lists", () => {
  const output = '{"a":[1,2,{"b":"🦀"}],"c":"x"}';
  const root = referenceParseJson(output)!;
  const spans: Span[] = [];
  const visit = (node: JsonNode): void => {
    spans.push(node.span);
    if (node.kind === "array") node.items.forEach(visit);
    else if (node.kind === "object") for (const entry of node.entries) { spans.push(entry.key.span); visit(entry.value); }
  };
  visit(root);
  const pieces: Piece[] = [];
  for (const [index, item] of spans.entries()) { pieces.push(item); if (index % 2) pieces.push({ text: "," }); }
  const cases: unknown[] = [
    { pieces: [[0, 5], [5, 9], { text: "" }, [9, 12]], required: [[0, 12]] },
    { pieces: [[0, 5], { text: '"' }, [6, 9]], required: [[0, 9]] },
    { pieces: [[0, 5], { text: ":" }, [5, 9]], required: [[0, 5], [5, 9]] },
    { pieces: [[0, 4], { text: ":" }, [5, 9]], required: [[0, 9]] },
    { pieces: [[0, 4], { text: ":" }, [5, 9]], required: [[5, 9], [0, 4], [1, 3], [6, 9]] },
    { pieces: [[20, 25], [0, 4], [10, 12], [4, 6]], required: [[21, 25], [0, 6], [10, 11], [2, 6], [0, 1]] },
    { pieces: [[0, 4]], required: [, [0, 4]] },
    { pieces: [[0, 4]], required: [, [0, 5]] },
    { pieces: [[0, 4]], required: [, [0, 5, 1]] },
    { pieces: [, [0, 4]], required: [[0, 4]] },
    { pieces: [[0, 1]], required: new Array(3) },
    { pieces, required: spans },
    { pieces, required: [...spans].reverse() },
  ];
  for (const candidate of cases) sameRender(output, candidate);
  const sparse = outcome(() => renderReduction(output, { pieces: [[0, 4]], required: [, [0, 4]] } as unknown as Reduction));
  assert.equal(sparse.ok, false); assert.equal((sparse as { type: string }).type, "TypeError");
});

/* ---- round 3: the scanner validates in place of JSON.parse; the oracle is JSON.parse acceptance itself ---- */
let acceptanceCases = 0;
/** Equal to the original parser, and never admitting text JSON.parse rejects (the validator's own contract). */
function sameAcceptance(text: string): void {
  acceptanceCases++;
  let accepted = true;
  try { JSON.parse(text); } catch { accepted = false; }
  if (!accepted && parseJson(text) !== undefined) assert.fail(`parseJson admitted text JSON.parse rejects: ${JSON.stringify(text.slice(0, 160))}`);
  sameParse(text);
}
const LONG = "abcdefghijklmnopqrstuvwxyz0123456789"; // pushes a string past the short inline scan
test("in-scanner validation equals JSON.parse acceptance on >= 100,000 adversarial cases", () => {
  const before = acceptanceCases;
  // Every number-like token over -+019.eE up to five units, bare and in each value position.
  const alphabet = ["-", "+", "0", "1", "9", ".", "e", "E"];
  let tokens = [""];
  for (let size = 1; size <= 5; size++) {
    tokens = tokens.flatMap(prefix => alphabet.map(unit => prefix + unit));
    for (const token of tokens) { sameAcceptance(token); sameAcceptance(`[${token}]`); sameAcceptance(`{"a":${token}}`); }
  }
  for (const token of ["1.5e+10", "-0.0e-0", "10", "100", "123456789", "1.25", "0.000", "1E400", "-1e-400", "2.", "2.e1", "2e", "2e+", "00.1", "-00", "0x1", "1_0", "١"]) {
    for (const text of [token, ` ${token} `, `[${token},${token}]`, `{"a":${token},"b":[${token}]}`, `${token}x`, `[${token} 1]`]) sameAcceptance(text);
  }
  // Every code unit after a backslash, in short and long strings, plain and between other escapes.
  for (let unit = 0; unit <= 0xffff; unit++) {
    const char = String.fromCharCode(unit);
    sameAcceptance(`"\\${char}"`);
    if (unit < 0x100 || unit % 61 === 0) { sameAcceptance(`["${LONG}\\${char}x"]`); sameAcceptance(`{"\\n\\${char}":1}`); }
  }
  // \u with every four-unit combination over hex-boundary units, and short forms.
  const hex = ["0", "9", "a", "f", "A", "F", "g", "G", '"', "\\", " "];
  for (const a of hex) for (const b of hex) for (const c of hex) for (const d of hex) {
    sameAcceptance(`"\\u${a}${b}${c}${d}"`);
    if ((a + b).includes("0")) sameAcceptance(`["${LONG}\\u${a}${b}${c}${d}${LONG}"]`);
  }
  for (const tail of ["", "0", "00", "000", "\\u", "x"]) { sameAcceptance(`"\\u${tail}"`); sameAcceptance(`"\\u${tail}`); sameAcceptance(`"${LONG}\\u${tail}"`); }
  // Every raw code unit below U+0100 plus separators, surrogates and BOM, inside short, long and escaped strings.
  const raw = [...Array.from({ length: 0x100 }, (_, unit) => unit), 0x2028, 0x2029, 0xd800, 0xdbff, 0xdc00, 0xdfff, 0xfeff, 0xfffe, 0xffff];
  for (const unit of raw) {
    const char = String.fromCharCode(unit);
    for (const text of [`"${char}"`, `"a${char}b"`, `"${LONG}${char}"`, `"${LONG}${char}${LONG}"`, `"${char}${LONG}"`, `"${LONG.slice(0, 15)}${char}"`, `"${LONG.slice(0, 16)}${char}"`,
      `"\\n${char}"`, `"${LONG}\\n${char}"`, `"${LONG}${char}\\n"`, `{"${char}":1}`, `{"${LONG}${char}":1}`, `[${char}1]`, `[1${char}]`, `${char}1`, `1${char}`,
      `["${LONG}", "${LONG}${char}"]`, `["${LONG}"${char},"${LONG}"]`, `["${LONG}",
"${LONG}${char}"]`, `["\\t${LONG}",
	"${char}${LONG}"]`]) sameAcceptance(text);
  }
  // Lone and paired surrogates, raw and escaped, as values and keys.
  for (const surrogate of ["\ud800", "\udbff", "\udc00", "\udfff", "\ud83d\ude00", "\ude00\ud83d", "\\ud800", "\\udc00", "\\ud83d\\ude00", "\\ud83d\ude00"]) {
    for (const text of [`"${surrogate}"`, `{"${surrogate}":1}`, `["${LONG}${surrogate}"]`, `{"${surrogate}":1,"${surrogate}":2}`]) sameAcceptance(text);
  }
  // Literal prefixes, extensions and one-unit edits.
  for (const literal of ["true", "false", "null"]) {
    for (let cut = 0; cut <= literal.length; cut++) { sameAcceptance(literal.slice(0, cut)); sameAcceptance(`[${literal.slice(0, cut)}]`); }
    for (let at = 0; at < literal.length; at++) for (const unit of ["x", "T", "", " ", literal[at]!.toUpperCase()]) {
      const edited = literal.slice(0, at) + unit + literal.slice(at + 1);
      sameAcceptance(edited); sameAcceptance(`{"a":${edited}}`);
    }
    for (const text of [`${literal}x`, `${literal}1`, `${literal} ${literal}`, `[${literal}${literal}]`, `[${literal},]`]) sameAcceptance(text);
  }
  // Structure: every token sequence of up to four tokens.
  const structure = ["[", "]", "{", "}", ",", ":", '"a"', "1", " ", "\n"];
  let sequences = [""];
  for (let size = 1; size <= 4; size++) {
    sequences = sequences.flatMap(prefix => structure.map(unit => prefix + unit));
    for (const text of sequences) sameAcceptance(text);
  }
  // Stateful multi-string documents: long strings, escapes and rare controls between pretty-printing whitespace.
  const random = rng(0xacce97);
  const parts = ["a", "é", "🦀", "\ud800", " ", "\\n", "\\t", "\\\"", "\\\\", "\\u0041", "\\u12", "\\x", "\t", "\n", "\r", "\u0001", "\u001f", "\u000b", LONG];
  const spaces = ["", " ", "\n", "\r\n", "\t", "\n    ", " \t "];
  for (let index = 0; index < 20000; index++) {
    const items: string[] = [];
    for (let count = 1 + int(random, 5); count > 0; count--) {
      let body = "";
      for (let length = int(random, 6); length > 0; length--) body += random() < 0.85 ? pick(random, parts.slice(0, 11).concat(LONG)) : pick(random, parts);
      items.push(random() < 0.3 ? `"k${index}${count}":${pick(random, spaces)}"${body}"` : `"${body}"`);
    }
    const object = items.every(item => item.includes(":")), join = () => `${pick(random, spaces)},${pick(random, spaces)}`;
    sameAcceptance(object ? `{${pick(random, spaces)}${items.join(join())}${pick(random, spaces)}}` : `[${pick(random, spaces)}${items.map(item => item.includes(":") ? `{${item}}` : item).join(join())}]`);
  }
  assert.ok(acceptanceCases - before >= 100000, `only ${acceptanceCases - before} acceptance cases`);
});

/* ---- round 3: large renderer inputs (nearly sorted, reversed past the insertion budget, shuffled) ---- */
test("renderers equal the original on large reordered reductions, both span lists, and past the insertion budget", () => {
  const random = rng(0x5ca1e), acceptedBefore = renderedCases;
  // Span bounds sit on part boundaries, so no span splits a surrogate pair.
  let output = "";
  const bounds: number[] = [0];
  for (let index = 0; index < 4000; index++) { output += pick(random, ["ab", "c", "é", "🦀", "\n", "xyz", " "]); bounds.push(output.length); }
  const spans: [number, number][] = [];
  for (let at = 0; at < bounds.length - 4; ) {
    const end = at + 1 + int(random, 3);
    spans.push([bounds[at]!, bounds[end]!]); at = end + int(random, 2);
  }
  const shuffle = <T>(list: T[]): T[] => { const copy = [...list]; for (let i = copy.length - 1; i > 0; i--) { const j = int(random, i + 1); [copy[i], copy[j]] = [copy[j]!, copy[i]!]; } return copy; };
  // Snapshot-like rows: each group of three spans is emitted as [b, a, c] (a local inversion per row).
  const local = spans.flatMap((_, i) => i % 3 === 1 ? [spans[i]!, spans[i - 1]!] : i % 3 === 0 && i + 1 < spans.length ? [] : [spans[i]!]);
  const orders: [number, number][][] = [spans, local, [...spans].reverse(), shuffle(spans), [...spans.slice(0, 600)].reverse().concat(spans.slice(600))];
  let cases = 0;
  for (const emitted of orders) {
    const pieces: Piece[] = emitted.flatMap((span, i) => i % 5 === 4 ? [[span[0], span[1]] as Span, { text: pick(random, [",", ":", " ", "\n"]) }] : [[span[0], span[1]] as Span]);
    const requiredSets: unknown[][] = [emitted.map(span => [...span]), [...emitted].reverse().map(span => [...span]), shuffle(emitted).map(span => [...span]),
      emitted.filter((_, i) => i % 7 === 0).map(span => [...span])];
    for (const required of requiredSets) {
      for (const variant of [required, [...required, [0, output.length]], [...required.slice(0, 50), [spans[3]![0], spans[4]![1]], ...required.slice(50)], (() => { const sparse = [...required]; delete sparse[sparse.length >> 1]; return sparse; })(),
        [...required.slice(0, 9), [1, 0.5], ...required.slice(9)], [...required.slice(0, 9), , ...required.slice(9)]]) {
        sameRender(output, { pieces, required: variant }); cases++;
      }
    }
    sameRender(output, { pieces: [...pieces, [Number.MAX_SAFE_INTEGER, 1]], required: emitted.map(span => [...span]) }); cases++;
  }
  assert.ok(cases >= 100 && renderedCases - acceptedBefore >= 20, `${renderedCases - acceptedBefore} of ${cases} large reductions accepted`);
});

test("a required list whose species fakes sort() cannot pass coverage with an unemitted span", () => {
  // The pre-round-1 renderer sorted evidence.map(...) through Symbol.species; the current one reads indices directly.
  class Faked extends Array<unknown> { override sort(): this { return [[0, 1]] as unknown as this; } }
  class Evidence extends Array<unknown> { static override get [Symbol.species](): ArrayConstructor { return Faked as unknown as ArrayConstructor; } }
  const output = "abcdefgh", required = Evidence.from([[2, 4]]);
  const result = outcome(() => renderReduction(output, { pieces: [[0, 1]], required } as unknown as Reduction));
  assert.equal(result.ok, false, "renderReduction must refuse the unemitted span");
  const structured = filterStructured(observation(output), { reducers: { json: () => ({ pieces: [[0, 1]], required } as unknown as Reduction) } });
  assert.equal(structured.status, "failed_open");
  assert.equal(outcome(() => referenceRenderReduction(output, { pieces: [[0, 1]], required } as unknown as Reduction)).ok, true, "the species trick fooled the original");
});

test("pieces appended during iteration (by a text getter) are rendered and counted like the original", () => {
  const output = "abcdefghij";
  const make = (extra: readonly Span[], required: readonly Span[]) => {
    const pieces: unknown[] = [[0, 1]];
    pieces.push({ get text() { pieces.push(...extra.map(span => [...span])); return ":"; } });
    return { pieces, required: required.map(span => [...span]) } as unknown as Reduction;
  };
  for (const [extra, required] of [[[[2, 4], [5, 6], [7, 9]], [[7, 9], [0, 1]]], [[[2, 4], [4, 6], [6, 9]], [[2, 9]]], [[[2, 4]], [[2, 5]]], [[[9, 10], [1, 2], [3, 4]], [[1, 2], [9, 10]]]] as [Span[], Span[]][]) {
    const expected = outcome(() => referenceRenderReduction(output, make(extra, required)));
    assert.deepStrictEqual(outcome(() => renderReduction(output, make(extra, required))), expected, `appended ${JSON.stringify(extra)}`);
    assert.deepStrictEqual(filterStructured(observation(output), { reducers: { json: () => make(extra, required) } }), structuredExpected(output, make(extra, required)));
  }
});

test("differential corpus size", t => { t.diagnostic(`parse cases ${parseCases} (${parsedCases} admitted); acceptance cases ${acceptanceCases}; render cases ${renderCases} (${renderedCases} accepted)`); });
