import assert from "node:assert/strict";
import test from "node:test";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { AutomaticObservation, AutomaticReducer } from "../src/core/automatic-types.js";
import type { Piece, Reduction, Span } from "../src/core/types.js";
import { filterAutomatic } from "../src/core/automatic.js";
import { renderReduction } from "../src/core/structured-render.js";
import { reduceAutomaticSnapshot } from "../src/profiles/auto-snapshot.js";

// Differential oracle for the snapshot performance rewrite: every observable result of the
// optimized reducer (rendered replacement, refusal, throw, default filterAutomatic result)
// must equal the original reducer's over real captures, authored counterexamples and a
// seeded mutator.

/* ---- Reference: src/profiles/auto-snapshot.ts verbatim at commit 716578a (perf/snapshot base);
   modification record: imports adjusted to tests/, export renamed to `referenceReduce`. ---- */
interface Row { text: string; start: number; end: number }
interface Attribute { start: number; end: number; text: string }

function rows(source: string, start = 0, end = source.length): Row[] {
  const result: Row[] = [];
  while (start < end) {
    const newline = source.indexOf("\n", start);
    const stop = newline < 0 || newline >= end ? end : newline + 1;
    result.push({ text: source.slice(start, stop).replace(/\n$/, ""), start, end: stop });
    start = stop;
  }
  return result;
}

/** Quotes own their brackets/colons; unquoted brackets must balance independently. */
function scan(text: string): { attributes: Attribute[]; colon: number } | undefined {
  const attributes: Attribute[] = [];
  let quoted = false, escaped = false, bracket = -1, colon = text.length;
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    if (char.charCodeAt(0) < 32) return undefined;
    if (quoted) {
      if (escaped) { escaped = false; continue; }
      if (char === "\\") escaped = true;
      else if (char === '"') quoted = false;
      continue;
    }
    if (char === '"') { quoted = true; continue; }
    if (char === "[") {
      if (bracket >= 0) return undefined;
      bracket = i;
    } else if (char === "]") {
      if (bracket < 0) return undefined;
      attributes.push({ start: bracket, end: i + 1, text: text.slice(bracket + 1, i) });
      bracket = -1;
    } else if (bracket < 0) {
      if (char === ":") colon = Math.min(colon, i);
      if (char === "…" || text.slice(i, i + 3) === "...") return undefined;
      if ((char === "|" || char === ">") && (i === 0 || /[\s:]/.test(text[i - 1]!))) return undefined;
    }
  }
  return quoted || bracket >= 0 ? undefined : { attributes, colon };
}

function builder(source: string) {
  const pieces: Piece[] = [], required: Span[] = [];
  const keep = (start: number, end: number) => {
    if (start < end) { const span: Span = [start, end]; pieces.push(span); required.push(span); }
  };
  const fixed = (text: string) => pieces.push({ text });
  const finish = (): Reduction | undefined => {
    const reduction = { pieces, required };
    return Buffer.byteLength(renderReduction(source, reduction)) < Buffer.byteLength(source) ? reduction : undefined;
  };
  return { keep, fixed, finish };
}

function playwright(source: string): Reduction | undefined {
  const lines = rows(source);
  const headings = lines.filter(row => row.text === "### Snapshot");
  if (headings.length !== 1) return undefined;
  const heading = headings[0]!, index = lines.indexOf(heading);
  const open = lines[index + 1];
  if (!open || open.text !== "```yaml" || open.end === source.length) return undefined;
  const closeIndex = lines.findIndex((row, i) => i > index + 1 && row.text === "```");
  if (closeIndex < 0) return undefined;
  // Error sections are protocol markers only outside fenced content.
  let fenced = false;
  for (const row of lines) {
    if (row.text.startsWith("```")) fenced = !fenced;
    else if (!fenced && row.text === "### Error") return undefined;
  }
  if (fenced) return undefined;
  const out = builder(source), refs = new Set<string>();
  out.keep(0, open.start + 3); out.fixed("text"); out.keep(open.start + 7, open.end);
  // Native hierarchy: root rows at depth 0, one 2-space level per step. Exactly the element
  // rows ending in an empty-valued unquoted colon (`- generic [ref=e1]:`) own children, and
  // each owns at least one; `text`/property rows are leaf-only. No space precedes the colon.
  let previousDepth = -1, previousContainer = false;
  for (const row of lines.slice(index + 2, closeIndex)) {
    const match = /^( *)(- )([a-z][a-z0-9-]*(?=[ :]|$)|\/(?:url|placeholder|description):)/.exec(row.text);
    if (!match || match[1]!.length % 2) return undefined;
    const indent = match[1]!.length, payloadStart = indent + 2;
    const payload = row.text.slice(payloadStart), parsed = scan(payload);
    if (!parsed) return undefined;
    if (parsed.colon < payload.length && payload[parsed.colon - 1] === " ") return undefined;
    // Native text pseudo-rows always carry inline value text: `- text: Name`.
    if (match[3] === "text" && !/^text: \S/.test(payload)) return undefined;
    const depth = indent / 2;
    if (previousDepth < 0 ? depth !== 0 : previousContainer ? depth !== previousDepth + 1 : depth > previousDepth) return undefined;
    previousDepth = depth;
    previousContainer = match[3] !== "text" && !match[3]!.startsWith("/") && parsed.colon === payload.length - 1;
    const candidates = parsed.attributes.filter(attr => /^ref(?:[^a-z0-9-]|$)/.test(attr.text));
    if (!candidates.length) { out.keep(row.start, row.end); continue; }
    if (candidates.length !== 1 || match[3]!.startsWith("/")) return undefined;
    const ref = candidates[0]!;
    if (ref.start >= parsed.colon || !/^ref=(?:e\d+|f\d+e\d+)$/.test(ref.text)) return undefined;
    const value = ref.text.slice(4);
    if (refs.has(value)) return undefined;
    refs.add(value);
    const base = row.start + payloadStart;
    out.keep(row.start, row.start + indent);
    out.keep(base + ref.start + 5, base + ref.end - 1); out.fixed(" ");
    out.keep(base, base + ref.start); out.keep(base + ref.end, row.end);
  }
  if (previousContainer || refs.size < 2) return undefined;
  out.keep(lines[closeIndex]!.start, source.length);
  return out.finish();
}

function devtools(source: string): Reduction | undefined {
  const header = "## Latest page snapshot\n";
  if (!source.startsWith(header)) return undefined;
  const out = builder(source), refs = new Set<string>();
  out.keep(0, header.length);
  // Native hierarchy: exactly one depth-0 RootWebArea first, then one 2-space level per step.
  let previousDepth = -1;
  for (const row of rows(source, header.length)) {
    const match = /^( *)uid=(\d+_\d+) (.+)$/.exec(row.text);
    if (!match || match[1]!.length % 2 || !scan(match[3]!)) return undefined;
    const depth = match[1]!.length / 2;
    if (previousDepth < 0 ? depth !== 0 || !/^RootWebArea(?: |$)/.test(match[3]!) : depth < 1 || depth > previousDepth + 1) return undefined;
    previousDepth = depth;
    const ref = match[2]!;
    if (refs.has(ref)) return undefined;
    refs.add(ref);
    const indent = match[1]!.length;
    out.keep(row.start, row.start + indent);
    out.keep(row.start + indent + 4, row.end);
  }
  return refs.size ? out.finish() : undefined;
}

/** Finite native text grammars only; producer conformance is a separate capture obligation. */
const referenceReduce: AutomaticReducer = observation => {
  const { source, tool, args, metadata, status, completeness, output } = observation;
  if (source !== "mcp" || status !== "success" || completeness !== "complete") return undefined;
  if (("truncated" in metadata && metadata.truncated !== false) ||
      ("exit" in metadata && (!Number.isSafeInteger(metadata.exit) || metadata.exit !== 0))) return undefined;
  const isPlaywright = tool === "browser_snapshot" || tool.endsWith("_browser_snapshot");
  const isDevtools = tool === "take_snapshot" || tool.endsWith("_take_snapshot");
  if (!isPlaywright && !isDevtools) return undefined;
  // pageId selects a whole page in the native default API, never an AX subtree.
  if (Object.keys(args).some(key => {
    if (isPlaywright) return key !== "boxes" || typeof args[key] !== "boolean";
    if (key === "pageId") return typeof args[key] !== "number" || !Number.isSafeInteger(args[key]) || args[key] <= 0;
    return key !== "verbose" || typeof args[key] !== "boolean";
  })) return undefined;
  if (/^\.\.\.(?:output truncated|\d+ (?:lines|bytes) truncated)\.\.\./.test(output)) return undefined;
  return isPlaywright ? playwright(output) : devtools(output);
};
/* ---- End reference. ---- */

type Outcome = string | undefined | { thrown: true };
function outcome(reduce: AutomaticReducer, input: AutomaticObservation): Outcome {
  try {
    const reduction = reduce(input);
    return reduction && renderReduction(input.output, reduction);
  } catch { return { thrown: true }; }
}
const optimized = { reducers: [{ id: "auto-snapshot", reduce: reduceAutomaticSnapshot }] };
const reference = { reducers: [{ id: "auto-snapshot", reduce: referenceReduce }] };
const tally = { cases: 0, reduced: 0, refused: 0 };
function same(input: AutomaticObservation, label: string): void {
  const expected = outcome(referenceReduce, input);
  assert.deepEqual(outcome(reduceAutomaticSnapshot, input), expected, `${label}: reducer outcome differs`);
  assert.deepEqual(filterAutomatic(input, optimized), filterAutomatic(input, reference), `${label}: default result differs`);
  tally.cases++;
  if (typeof expected === "string") tally.reduced++; else tally.refused++;
}
function observation(output: string, tool = "browser_snapshot", patch: Partial<AutomaticObservation> = {}): AutomaticObservation {
  return { source: "mcp", tool, output, args: {}, metadata: {}, status: "success", completeness: "complete", ...patch };
}

/* Real captures: every text response of the native producer records plus native page/tree files. */
interface Seed { output: string; tool: string; args: Record<string, unknown> }
const fixtures = fileURLToPath(new URL("../fixtures/automatic/browser/", import.meta.url));
const preamble = '### Page state\n- Page URL: https://example.test/😀\n- Page Title: Form\n### Events\n- dialog opened\n### Snapshot\n```';
const suffix = '```\n### Modal state\n- dialog: "Keep me"\n### Events\n- console: ready\n';
const captures: Seed[] = [];
for (const variant of ["native", "native-default"]) {
  const directory = resolve(fixtures, variant);
  for (const producer of ["playwright", "devtools"]) {
    const { records } = JSON.parse(readFileSync(resolve(directory, `${producer}.json`), "utf8")) as {
      records: { direction: string; message: { id?: number; method?: string; params?: { name: string; arguments?: Record<string, unknown> };
        result?: { content?: { type: string; text?: string }[] } } }[] };
    const calls = new Map<number | undefined, { name: string; arguments?: Record<string, unknown> }>();
    for (const { direction, message } of records) {
      if (direction === "send" && message.method === "tools/call") calls.set(message.id, message.params!);
      const call = direction === "receive" ? calls.get(message.id) : undefined;
      for (const block of call ? message.result?.content ?? [] : []) {
        if (block.type === "text" && typeof block.text === "string") captures.push({ output: block.text, tool: call!.name, args: call!.arguments ?? {} });
      }
    }
  }
  for (const file of readdirSync(directory).sort()) {
    const text = readFileSync(resolve(directory, file), "utf8");
    if (file.endsWith(".yml")) captures.push({ output: `${preamble}yaml\n${text}${text.endsWith("\n") ? "" : "\n"}${suffix}`, tool: "browser_snapshot", args: {} });
    if (file.endsWith(".txt")) captures.push({ output: text, tool: "take_snapshot", args: {} });
  }
}

/* Authored counterexamples, copied from tests/auto-snapshot.test.ts. */
const nodes = [
  { indent: "", ref: "e1", before: 'document "Form 😀" ', after: ':' },
  { indent: "  ", ref: "f2e3", before: 'button "Pay [ref=e99]: \\"now\\"" [disabled] ', after: ' [pressed=false]:' },
  { indent: "    ", ref: "e4", before: 'textbox "Account" [required] ', after: ' [focused]: "abc: [ref=e99] opaque"' },
  { indent: "  ", ref: "e5", before: 'mystery-role "Extension" [level=3] [box=1,2,3,4] [description="literal [ref=e99]"] ', after: ': false' },
  { indent: "  ", ref: "e6", before: 'link "Plain" [cursor=pointer] ', after: ':' },
];
const plain = '    - /url: https://example.test/path\n    - /placeholder: "Name"\n    - /description: "### Error [ref=e99]"\n    - text: "No ref, keep dash"\n';
const pwSample = `${preamble}yaml\n${nodes.map(n => `${n.indent}- ${n.before}[ref=${n.ref}]${n.after}\n`).join("")}${plain}${suffix}`;
const chromeSample = '## Latest page snapshot\nuid=1_0 RootWebArea "Form 😀" url="https://example.test"\n  uid=1_1 button "Pay [ref=e99]" disabled focused\n    uid=1_2 textbox "Account" value="a:b" required\n  uid=1_3 tab "Panel" selected\n';
const wrap = (tree: string) => `${preamble}yaml\n${tree}${suffix}`;
const authoredPlaywright = [
  pwSample, wrap('- generic [ref=e1]:\n  - textbox [ref=e2]\n  - button [ref=e3]\n'),
  pwSample.replace('[ref=e5]', '[ref=e99]'), `${preamble}yaml\n- button "[ref=e1]"\n- button "[ref=e2]"\n${suffix}`,
  pwSample.replace('[ref=e5]', '[ref=e4]'), pwSample.replace('[ref=e5]', '[ref=unknown]'), pwSample.replace('[ref=e5]', '[ref=f2]'),
  pwSample.replace('[ref=e5]', '[ref=e5] [ref=e6]'), pwSample.replace('[ref=e5]', '[ref=e5'), pwSample.replace('[ref=e5]', ']: [ref=e5]'),
  pwSample.replace('[ref=e5]', ': value [ref=e5]'), pwSample.replace('[ref=e5]', '[ref =e5]'), pwSample.replace('[ref=e5]', '[ref:e5]'),
  pwSample.replace('"Extension"', '"Extension'), pwSample.replace('"Extension"', '"Extension\ncontinued"'),
  pwSample.replace('  - mystery-role', '   - mystery-role'), pwSample.replace('  - mystery-role', '  mystery-role'),
  pwSample.replace('  - mystery-role', '  - UnknownRole'), pwSample.replace('  - mystery-role', '  - /unsupported:'),
  pwSample.replace(': false', ': |'), pwSample.replace(': false', ': >'), pwSample.replace(': false', ': ...'), pwSample.replace(': false', ': …'),
  pwSample.replace('[level=3]', '[level=[3]]'), pwSample.replace('```yaml', '```yml'), pwSample.replace('```yaml\n', '```yaml\n```yaml\n'),
  pwSample.replace(suffix, ''), pwSample + '### Snapshot\n```yaml\n- button [ref=e8]\n```\n', pwSample + '### Error\nFailure\n',
  `${preamble}yaml\n- document [ref=e1]\n${suffix}`, `${preamble}yaml\n${suffix}`,
  pwSample.replace('    - text:', '    continuation:'), pwSample.replace('\n  -', '\r\n  -'),
  pwSample.replace('    - textbox "Account"', '      - textbox "Account"'),
  wrap('- button [ref=e1]\n  - textbox [ref=e2]\n'), wrap('- textbox [ref=e1]: hello\n  - button [ref=e2]\n'),
  wrap('- generic [ref=e1]:\n  - text: foo\n    - button [ref=e2]\n'), wrap('- link [ref=e1]:\n  - /url:\n    - button [ref=e2]\n'),
  wrap('- generic [ref=e1]: "x:"\n  - button [ref=e2]\n'), wrap('  - button [ref=e1]\n  - button [ref=e2]\n'),
  wrap('- generic [ref=e1]:\n      - button [ref=e2]\n'), wrap('- generic [ref=e1]:\n  - text:\n    - button [ref=e2]\n'),
  wrap('- generic [ref=e1]:\n  - text\n  - button [ref=e2]\n'), wrap('- generic [ref=e1]:\n  - text:\n  - button [ref=e2]\n'),
  wrap('- text:\n  - button [ref=e1]\n  - button [ref=e2]\n'), wrap('- generic [ref=e1] :\n  - button [ref=e2]\n'),
  wrap('- textbox [ref=e1] : hello\n- button [ref=e2]\n'), wrap('- generic [ref=e1]:\n- button [ref=e2]\n'),
  wrap('- button [ref=e1]\n- generic [ref=e2]:\n'), wrap('- generic [ref=e1]:\n  - generic [ref=e2]:\n  - button [ref=e3]\n'),
  ...["x", " x", "\u00a0x", "\u3000x", "\ufeffx", "\u2028x", "\ud83dx", ""].map(value => wrap(`- generic [ref=e1]:\n  - text: ${value}\n  - button [ref=e2]\n`)),
];
const authoredChrome = [
  chromeSample, chromeSample.trimEnd(),
  chromeSample.replace('uid=1_3', 'uid=1_2'), chromeSample.replace('uid=1_3', 'uid=unknown'), chromeSample.replace('  uid=1_3', '   uid=1_3'),
  chromeSample.replace('"Panel"', '"Panel'), chromeSample.replace('"Panel"', '"Panel\ncontinued"'), chromeSample + 'note: clipped\n', chromeSample + '\n',
  chromeSample.replace('## Latest page snapshot', '### Latest page snapshot'), chromeSample.replace('RootWebArea', '...'), chromeSample.replace('tab "Panel" selected', ''),
  '## Latest page snapshot\nuid=1_0 RootWebArea "Page"\n      uid=1_1 button "Child"\n', '## Latest page snapshot\nuid=1_0 RootWebArea "Page"\nuid=1_1 RootWebArea "Second"\n',
  '## Latest page snapshot\nuid=1_0 RootWebArea "Page"\n  uid=1_1 button "A"\nuid=1_2 button "B"\n', '## Latest page snapshot\n  uid=1_0 RootWebArea "Page"\n  uid=1_1 button "A"\n',
  '## Latest page snapshot\nuid=1_0 generic "Page"\n  uid=1_1 button "A"\n', chromeSample.replace('    uid=1_2', '      uid=1_2'),
];
// Real-capture mutations from tests/auto-snapshot.test.ts.
const captureMutations: [RegExp | string, string][] = [
  ['\n  - heading "Account', '\n      - heading "Account'], ['    - textbox "Name', '      - textbox "Name'], [': Zoë\n', ': Zoë\n      - text: child\n'],
  ['    - /url: /details\n', '    - /url: /details\n      - text: child\n'], ['[ref=e9] [cursor=pointer]:', '[ref=e9] [cursor=pointer]'],
  ['    - option "Paris"', '      - option "Paris"'], ['    - /url: /details\n', ''], ['[ref=e9] [cursor=pointer]:', '[ref=e9] [cursor=pointer] :'],
  ['    - text: Name "東京"\n', '    - text:\n      - text: Name "東京"\n'], ['    - text: Name "東京"\n', '    - text\n'],
  ['\n  uid=1_1 ', '\n      uid=1_1 '], ['\n  uid=1_1 ', '\nuid=1_1 '], ['\n  uid=2_0 ', '\n      uid=2_0 '], ['\n  uid=2_0 ', '\nuid=2_0 '],
  ['\nuid=1_0 ', '\n  uid=1_0 '], ['"Dialog name"', '"Dialog\nname"'],
];
const admission: [string, Partial<AutomaticObservation>][] = [
  ...["browser_snapshot", "mcp_playwright_browser_snapshot", "take_snapshot", "mcp_chrome_take_snapshot", "snapshot", "browser_snapshot_extra", "prefixbrowser_snapshot", "take_snapshot_extra"]
    .map(tool => [tool, {}] as [string, Partial<AutomaticObservation>]),
  ...([{ source: "native" }, { status: "failure" }, { status: "unknown" }, { completeness: "truncated" }, { completeness: "unknown" },
    { metadata: { truncated: true } }, { metadata: { truncated: "false" } }, { metadata: { truncated: false } }, { metadata: { exit: 1 } }, { metadata: { exit: "0" } }, { metadata: { exit: 0 } },
    { args: { target: "e1" } }, { args: { depth: 1 } }, { args: { filename: "x" } }, { args: { boxes: 1 } }, { args: { boxes: true } }, { args: { verbose: true } },
    { args: { boxes: false, other: false } }, { args: { filePath: "x" } }, { args: { verbose: 1 } }, { args: { pageId: 1 } }, { args: { pageId: 0 } },
    { args: { pageId: 1.5 } }, { args: { pageId: Number.MAX_SAFE_INTEGER + 1 } }, { args: { pageId: "1" } }, { args: { pageId: 1, verbose: false } }] as Partial<AutomaticObservation>[])
    .flatMap(patch => [["browser_snapshot", patch], ["take_snapshot", patch]] as [string, Partial<AutomaticObservation>][]),
];

test("real captures, authored counterexamples and admission facts match the original reducer", () => {
  const before = tally.cases;
  for (const [i, seed] of captures.entries()) {
    for (const tool of new Set([seed.tool, "browser_snapshot", "take_snapshot"])) same(observation(seed.output, tool, tool === seed.tool ? { args: seed.args } : {}), `capture ${i} as ${tool}`);
    for (const [from, to] of captureMutations) {
      const output = seed.output.replace(from, to);
      if (output !== seed.output) same(observation(output, seed.tool, { args: seed.args }), `capture ${i} mutation ${String(from)}`);
    }
  }
  for (const [i, output] of authoredPlaywright.entries()) same(observation(output), `authored pwSample ${i}`);
  for (const [i, output] of authoredChrome.entries()) same(observation(output, "take_snapshot"), `authored chromeSample ${i}`);
  for (const marker of ['...output truncated...', '...12 lines truncated...', '...3 bytes truncated...']) {
    same(observation(marker + pwSample), `marker ${marker}`);
    same(observation(marker + chromeSample, "take_snapshot"), `marker ${marker} chromeSample`);
  }
  for (const output of [pwSample, chromeSample]) for (const [tool, patch] of admission) same(observation(output, tool, patch), `admission ${tool} ${JSON.stringify(patch)}`);
  for (const output of ["", "\n", "### Snapshot", "### Snapshot\n```yaml", "### Snapshot\n```yaml\n", "### Snapshot\n```yaml\n```", "## Latest page snapshot\n",
    "## Latest page snapshot", "## Latest page snapshot\nuid=1_0 RootWebArea", "## Latest page snapshot\nuid=1_0 RootWebArea ", "## Latest page snapshot\nuid=1_0 RootWebAreaX",
    "## Latest page snapshot\nuid=1_0 RootWebArea ", "## Latest page snapshot\nuid=1_0 RootWebArea  x", "## Latest page snapshot\nuid=_0 RootWebArea", "## Latest page snapshot\nuid=1_ RootWebArea"]) {
    same(observation(output), `edge ${JSON.stringify(output)}`);
    same(observation(output, "take_snapshot"), `edge chromeSample ${JSON.stringify(output)}`);
  }
  // Positive controls: the oracle must see real reductions, not only refusals.
  for (const output of [pwSample, chromeSample]) assert.equal(typeof outcome(referenceReduce, observation(output, output === chromeSample ? "take_snapshot" : "browser_snapshot")), "string");
  assert.ok(captures.filter(seed => /_snapshot$/.test(seed.tool)).length >= 8, "all native snapshot captures loaded");
  assert.ok(tally.cases - before > 300);
});

/* Seeded mutator over real snapshot captures, authored trees and unique-ref replicas. */
function mulberry32(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function replicate(seed: Seed, copies: number): Seed {
  // Duplicate the non-root body with fresh refs/uids so the result stays admissible.
  const lines = seed.output.split("\n");
  let next = 1000;
  if (seed.tool === "take_snapshot") {
    const body = lines.slice(2, -1);
    const extra = Array.from({ length: copies }, () => body.map(line => line.replace(/uid=\d+_\d+/, () => `uid=9_${next++}`))).flat();
    return { ...seed, output: [...lines.slice(0, 2), ...body, ...extra, ""].join("\n") };
  }
  const open = lines.indexOf("```yaml"), close = lines.indexOf("```", open + 1);
  const body = lines.slice(open + 2, close);
  const extra = Array.from({ length: copies }, () => body.map(line => line.replace(/\[ref=e\d+\]/g, () => `[ref=e${next++}]`))).flat();
  return { ...seed, output: [...lines.slice(0, open + 2), ...body, ...extra, ...lines.slice(close)].join("\n") };
}
const snapshotSeeds: Seed[] = [
  ...captures.filter(seed => seed.tool.endsWith("snapshot") && /^(?:## Latest page snapshot\n|[\s\S]*### Snapshot\n```yaml\n)/.test(seed.output)),
  { output: pwSample, tool: "browser_snapshot", args: {} }, { output: chromeSample, tool: "take_snapshot", args: {} },
];
snapshotSeeds.push(...snapshotSeeds.filter(seed => seed.output !== pwSample && seed.output !== chromeSample).map(seed => replicate(seed, 2)));
const inserts = ['"', "[", "]", "[x]", "[ref=e7]", "[ref=f1e2]", "[ref]", "[refx=e1]", "[ref-a=1]", ":", " :", ": ", "...", "..", "…", "|", " |", ":>", ">", "\\",
  '\\"', "- ", "text: ", "text:", "\n", "\r", "\t", " ", "  ", "😀", "東京", " ", " ", " ", "　", "́", "\ud83d", "\ude00",
  "### Error", "```", "### Snapshot", "RootWebArea ", "uid=1_0 ", "uid=1_1 ", "/url:", "e1", "_"];
const lineStarts = (text: string) => [0, ...[...text.matchAll(/\n/g)].map(m => m.index! + 1).filter(i => i < text.length)];
function mutateOnce(text: string, random: () => number): string {
  const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)]!;
  const at = Math.floor(random() * (text.length + 1));
  const starts = lineStarts(text), row = pick(starts), rowEnd = text.indexOf("\n", row) < 0 ? text.length : text.indexOf("\n", row) + 1;
  switch (Math.floor(random() * 12)) {
    case 0: return text.slice(0, row) + pick([" ", "  ", "   "]) + text.slice(row); // indent deeper
    case 1: return text.slice(0, row) + text.slice(row).replace(/^ {1,2}/, ""); // indent shallower
    case 2: { // colon insert/delete
      const colons = [...text.matchAll(/:/g)].map(m => m.index!);
      return random() < 0.5 || !colons.length ? text.slice(0, at) + ":" + text.slice(at) : (i => text.slice(0, i) + text.slice(i + 1))(pick(colons));
    }
    case 3: return text.slice(0, at) + pick(['"', "[", "]", '\\"', "[x]", '"[ref=e1]"']) + text.slice(at); // quote/bracket injection
    case 4: { // ref duplication
      const refs = [...text.matchAll(/\[ref=[^\]\n]*\]|uid=\d+_\d+/g)];
      if (refs.length < 2) return text;
      const source = pick(refs), target = pick(refs);
      return text.slice(0, target.index!) + source[0] + text.slice(target.index! + target[0].length);
    }
    case 5: return text.slice(0, row) + text.slice(rowEnd); // row deletion
    case 6: return text.slice(0, rowEnd) + text.slice(row, rowEnd) + text.slice(rowEnd); // row duplication
    case 7: return random() < 0.3 ? text.replace(/\n/g, "\r\n") : text.slice(0, row).replace(/\n$/, "\r\n") + text.slice(row); // CRLF
    case 8: return text.slice(0, at) + pick(["😀", "東京", " ", " ", " ", "　", "́", "\ud83d", "\ude00", "…", "﻿"]) + text.slice(at); // unicode
    case 9: return text.slice(0, at) + pick(inserts) + text.slice(at);
    case 10: { // fresh ref spelling keeps admissible shapes
      const refs = [...text.matchAll(/\[ref=e\d+\]|uid=\d+_\d+/g)];
      if (!refs.length) return text;
      const ref = pick(refs), fresh = ref[0].startsWith("uid") ? `uid=${Math.floor(random() * 99)}_${Math.floor(random() * 9999)}` : pick([`[ref=e${Math.floor(random() * 9999)}]`, `[ref=f${Math.floor(random() * 9)}e${Math.floor(random() * 99)}]`]);
      return text.slice(0, ref.index!) + fresh + text.slice(ref.index! + ref[0].length);
    }
    default: return text.slice(0, at) + text.slice(Math.min(text.length, at + 1 + Math.floor(random() * 3))); // small deletion
  }
}

test("seeded mutator: optimized reducer matches the original on >= 5,000 mutated captures", () => {
  const random = mulberry32(0x5eed5), before = { ...tally };
  const target = Number(process.env.HUGR_SNAPSHOT_DIFF_CASES ?? 6000);
  for (let i = 0; i < target; i++) {
    const seed = snapshotSeeds[i % snapshotSeeds.length]!;
    let output = seed.output;
    const steps = i % 7 === 0 ? 0 : 1 + Math.floor(random() * 3);
    for (let step = 0; step < steps; step++) output = mutateOnce(output, random);
    const tool = random() < 0.05 ? (seed.tool === "take_snapshot" ? "browser_snapshot" : "take_snapshot") : seed.tool;
    same(observation(output, tool, tool === seed.tool ? { args: seed.args } : {}), `mutant ${i} (seed ${i % snapshotSeeds.length}): ${JSON.stringify(output)}`);
  }
  const reduced = tally.reduced - before.reduced, refused = tally.refused - before.refused;
  // Non-vacuity: both admitted and refused mutants are exercised in volume.
  assert.ok(reduced >= target / 10 && refused >= target / 10, `mutants reduced ${reduced}, refused ${refused}`);
  console.log(`differential cases: ${tally.cases} total (mutants ${target}: reduced ${reduced}, refused ${refused})`);
});

test("fence-scoped ### Error markers and the control-character bound match the original", () => {
  const tree = "### Snapshot\n```yaml\n- button [ref=e1]\n- button [ref=e2]\n```\n";
  const fencedError = observation("```\n### Error\n```\n" + tree), bareError = observation("### Error\n" + tree);
  same(fencedError, "### Error inside an unrelated fence");
  same(bareError, "unfenced ### Error");
  assert.equal(typeof outcome(reduceAutomaticSnapshot, fencedError), "string", "fenced ### Error is content, not a protocol marker");
  assert.equal(outcome(reduceAutomaticSnapshot, bareError), undefined, "unfenced ### Error refuses");
  // Code units below 32 refuse anywhere in a payload (names, quoted text, attributes); DEL (0x7f) is ordinary text.
  for (const [char, admitted] of [["\x00", false], ["\x1e", false], ["\x1f", false], ["\x7f", true], [" ", true]] as const) {
    const label = `U+${char.charCodeAt(0).toString(16).padStart(4, "0")}`;
    for (const input of [
      observation(wrap(`- generic [ref=e1]:\n  - button "a${char}b" [ref=e2]\n`)),
      observation(wrap(`- generic [ref=e1]:\n  - textbox [ref=e2]: x${char}y\n`)),
      observation(wrap(`- generic [ref=e1]:\n  - button [ref=e2] [data=${char}]\n`)),
      observation(`## Latest page snapshot\nuid=1_0 RootWebArea "a${char}b"\n  uid=1_1 button x${char}y\n`, "take_snapshot"),
    ]) {
      same(input, `${label} in ${input.tool}`);
      assert.equal(typeof outcome(reduceAutomaticSnapshot, input), admitted ? "string" : "undefined", `${label} in ${input.tool}`);
    }
  }
});
