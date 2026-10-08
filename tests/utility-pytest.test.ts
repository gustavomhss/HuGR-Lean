import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { filter } from "../src/core/index.js";
import type { Observation, Piece, Reduction, Span } from "../src/types.js";
import { pytestProfile } from "../src/profiles/pytest.js";

interface Artifact { file: string; bytes: number; sha256: string }
interface Anchor { text: string; occurrence: number }
interface NativeCase {
  id: string; profile: string; command: string; role: "noise" | "exact";
  expectedStatus: "reduced" | "passthrough"; exitCode: number; complete: boolean;
  signal: string | null; timedOut: boolean; material: boolean;
  capture: Artifact; original: Artifact; stdout: Artifact; stderr: Artifact; expected: Artifact;
  fixtureSources: (Artifact & { sourceFile?: string })[]; required: Anchor[];
}
interface Receipt {
  id: string; command: string; sourceHead: string; producer: { script: string; sourceSHA256: string };
  sourceInventorySHA256: string; versions: Record<string, string>;
  environment: { originalMIT: boolean; historicalCorpus: boolean; disabledPluginAutoload: boolean };
  facts: { command: string; exitCode: number; complete: boolean; signal: string | null;
    timedOut: boolean; nativeSpawned: boolean; nativeExitObserved: boolean;
    launchError: unknown; encodingError: unknown; killErrors: unknown[] };
  artifacts: { original: Artifact; stdout: Artifact; stderr: Artifact }; fixtureSources: Artifact[];
}
interface Manifest {
  schema: string; family: string; tools: { name: string; version: string; executable: string }[];
  producer: Receipt["producer"];
  provenance: { root: string; sourceHead: string; indexSHA256: string;
    sourceInventorySHA256: string; producer: Receipt["producer"] }[];
  cases: NativeCase[];
}
const base = new URL("../fixtures/utility/pytest/", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("manifest.json", base), "utf8")) as Manifest;
const bytes = (file: string): Buffer => {
  assert.match(file, /^(?:[\w.-]+\/)*[\w.-]+$/); assert.ok(!file.split("/").includes(".."));
  return readFileSync(new URL(file, base));
};
const text = (file: string): string => bytes(file).toString("utf8");
const digest = (b: Buffer): string => createHash("sha256").update(b).digest("hex");
function checkArtifact(a: Artifact): Buffer {
  const b = bytes(a.file); assert.equal(b.length, a.bytes, a.file); assert.equal(digest(b), a.sha256, a.file); return b;
}
function observation(c: NativeCase, output = text(c.original.file)): Observation {
  return { source: "shell", command: c.command, output, presentation: "unknown",
    termination: c.timedOut ? { kind: "timed_out" } : c.signal !== null ? { kind: "unknown" } : { kind: "exited", code: c.exitCode },
    completeness: c.complete ? "complete" : "unknown" };
}
function occurrence(output: string, a: Anchor): Span {
  assert.ok(a.text.length > 0); assert.ok(Number.isSafeInteger(a.occurrence) && a.occurrence >= 0);
  let start = -1;
  for (let i = 0; i <= a.occurrence; i++) { start = output.indexOf(a.text, start + 1); assert.ok(start >= 0, a.text); }
  return [start, start + a.text.length]; // UTF-16, including astral warning/skip text.
}
const isSpan = (p: Piece): p is Span => Array.isArray(p);
function spansValid(output: string, spans: readonly Span[]): void {
  let previous = 0;
  for (const [start, end] of spans) {
    assert.ok(Number.isSafeInteger(start) && Number.isSafeInteger(end) && start >= previous && end > start && end <= output.length);
    for (const n of [start, end]) assert.ok(!(output.charCodeAt(n - 1) >= 0xd800 && output.charCodeAt(n - 1) <= 0xdbff &&
      output.charCodeAt(n) >= 0xdc00 && output.charCodeAt(n) <= 0xdfff), "split surrogate");
    previous = end;
  }
}
function covered([start, end]: Span, spans: readonly Span[]): boolean {
  let cursor = start;
  for (const [lo, hi] of spans) { if (hi <= cursor) continue; if (lo > cursor) return false; cursor = hi; if (cursor >= end) return true; }
  return false;
}
function evidence(output: string, expected: string, anchors: readonly Anchor[], r: Reduction): void {
  assert.ok(anchors.length > 0, "empty oracle anchors"); assert.ok(r.required.length > 0, "empty declared evidence");
  const emitted = r.pieces.filter(isSpan); assert.ok(emitted.length > 0, "empty source emission");
  spansValid(output, r.required); spansValid(output, emitted);
  for (const a of anchors) {
    const span = occurrence(output, a);
    assert.ok(covered(span, r.required), `undeclared: ${a.text}`);
    assert.ok(covered(span, emitted), `unemitted: ${a.text}`);
  }
  assert.equal(r.pieces.map(p => isSpan(p) ? output.slice(...p) : p.text).join(""), expected);
}
const noise = manifest.cases.filter(c => c.role === "noise");
const find = (id: string): NativeCase => { const c = manifest.cases.find(c => c.id === id); assert.ok(c, id); return c; };
function reduced(c: NativeCase, output = text(c.original.file), expected = text(c.expected.file), command = c.command): void {
  const o = { ...observation(c, output), command }, result = filter(o);
  assert.equal(result.status, "reduced", `${c.id}: default registry`);
  if (result.status !== "reduced") assert.fail("missing reduction");
  assert.equal(result.profile, "pytest"); assert.equal(result.replacement, expected);
  assert.equal(result.inputBytes, Buffer.byteLength(output)); assert.equal(result.outputBytes, Buffer.byteLength(expected));
  const r = pytestProfile.reduce(output, o); assert.ok(r, `${c.id}: private reduce`); evidence(output, expected, c.required, r);
}
function exact(o: Observation): void {
  const result = filter(o); assert.equal(result.status, "passthrough"); assert.ok(!("replacement" in result));
  assert.equal(result.inputBytes, Buffer.byteLength(o.output)); assert.equal(result.outputBytes, result.inputBytes);
  assert.equal(pytestProfile.reduce(o.output, o), undefined, "private reducer must refuse");
}

test("PY-CORPUS: typed statuses, receipts, relocated sources, versions, independent KEEP/material", () => {
  assert.equal(manifest.schema, "hugr-lean/utility-corpus/1"); assert.equal(manifest.family, "pytest");
  assert.deepEqual(manifest.cases.map(c => c.id).sort(), ["assertion-failure", "default", "doctest-path", "literal-path", "opaque-summary", "quiet"]);
  assert.deepEqual(manifest.tools.map(t => [t.name, t.version]), [["python", "3.14.5"], ["pytest", "9.0.3"], ["pluggy", "1.6.0"]]);
  assert.ok(manifest.tools.every(t => t.executable.length > 0)); assert.equal(manifest.provenance.length, 2);
  assert.deepEqual(manifest.producer, manifest.provenance[0]!.producer);
  assert.ok(noise.length > 0); assert.ok(noise.some(c => c.material));
  const payloadPaths = new Set<string>();
  for (const c of manifest.cases) {
    assert.equal(c.profile, "pytest"); assert.equal(c.expectedStatus, c.role === "noise" ? "reduced" : "passthrough");
    for (const a of [c.capture, c.original, c.stdout, c.stderr, c.expected]) {
      assert.ok(!payloadPaths.has(a.file), `aliased artifact: ${a.file}`); payloadPaths.add(a.file); checkArtifact(a);
    }
    const raw = text(c.original.file); assert.deepEqual(Buffer.from(raw), bytes(c.original.file));
    assert.equal(c.original.bytes, c.stdout.bytes + c.stderr.bytes);
    const receipt = JSON.parse(text(c.capture.file)) as Receipt;
    assert.equal(receipt.id, c.id); assert.equal(receipt.command, c.command); assert.equal(receipt.facts.command, c.command);
    for (const k of ["exitCode", "complete", "signal", "timedOut"] as const) assert.equal(receipt.facts[k], c[k], `${c.id}/${k}`);
    assert.equal(receipt.facts.nativeSpawned, true); assert.equal(receipt.facts.nativeExitObserved, true);
    assert.equal(receipt.facts.launchError, null); assert.equal(receipt.facts.encodingError, null); assert.deepEqual(receipt.facts.killErrors, []);
    assert.equal(receipt.environment.originalMIT, true); assert.equal(receipt.environment.historicalCorpus, false);
    assert.equal(receipt.environment.disabledPluginAutoload, true);
    const provenance = manifest.provenance.find(p => p.sourceHead === receipt.sourceHead); assert.ok(provenance);
    assert.match(provenance.indexSHA256, /^[a-f0-9]{64}$/); assert.deepEqual(receipt.producer, provenance.producer);
    assert.equal(receipt.sourceInventorySHA256, provenance.sourceInventorySHA256);
    for (const tool of manifest.tools) assert.equal(receipt.versions[tool.name], tool.version);
    for (const k of ["original", "stdout", "stderr"] as const) {
      assert.equal(receipt.artifacts[k].file, `captures/${c.id}/${k}.log`);
      assert.equal(receipt.artifacts[k].bytes, c[k].bytes); assert.equal(receipt.artifacts[k].sha256, c[k].sha256);
    }
    assert.deepEqual(c.fixtureSources.map(s => ({ ...s, file: s.sourceFile ?? s.file, sourceFile: undefined })).map(({ sourceFile: _, ...s }) => s), receipt.fixtureSources);
    for (const source of c.fixtureSources) checkArtifact(source);
    const saved = c.original.bytes - c.expected.bytes;
    assert.equal(c.material, c.role === "noise" && saved >= 1024 && saved / c.original.bytes >= .1);
    if (c.role === "exact") { assert.equal(text(c.expected.file), raw); continue; }
    const rows = raw.split("\n");
    const keep = c.id === "quiet" ? Array.from({ length: 11 }, (_, i) => i + 17) : [2, 3, 4, 7, 23, 25, 26, 27, 28, 29, 30, 31, 32, 33];
    assert.equal(text(c.expected.file), keep.map(n => rows[n - 1] + "\n").join(""));
    assert.deepEqual(c.required.map(a => raw.slice(...occurrence(raw, a))), keep.map(n => rows[n - 1]!).filter(Boolean));
  }
  const raw = bytes(find("default").original.file), corrupt = Buffer.from(raw); corrupt[0] = corrupt[0]! ^ 1;
  assert.notEqual(digest(raw), digest(corrupt), "digest corruption control");
  assert.throws(() => checkArtifact({ ...find("default").original, sha256: digest(corrupt) }), /original.log/);
});

for (const c of noise) {
  test(`PY-NATIVE-${c.id}: default registry exact independent golden`, () => reduced(c));
  test(`PY-DECLARED-${c.id}: private required AND pieces`, () => {
    const o = observation(c), r = pytestProfile.reduce(o.output, o); assert.ok(r, "native grammar must reduce");
    evidence(o.output, text(c.expected.file), c.required, r);
    for (const a of c.required) {
      const span = occurrence(o.output, a);
      // Delete declaration coverage only; rendered bytes remain identical.
      const required = r.required.filter(s => s[1] <= span[0] || s[0] >= span[1]);
      assert.throws(() => evidence(o.output, text(c.expected.file), c.required, { ...r, required }));
      const pieces = r.pieces.filter(p => !isSpan(p) || p[1] <= span[0] || p[0] >= span[1]);
      assert.throws(() => evidence(o.output, text(c.expected.file), c.required, { ...r, pieces }));
    }
  });
  test(`PY-CRLF-${c.id}: native source spans retain CRLF`, () => reduced(c, text(c.original.file).replaceAll("\n", "\r\n"), text(c.expected.file).replaceAll("\n", "\r\n")));
  test(`PY-PRESERVE-${c.id}: nonzero/incomplete/source/control/unknown`, () => {
    const o = observation(c);
    for (const patch of [{ termination: { kind: "exited", code: 1 } }, { termination: { kind: "unknown" } },
      { termination: { kind: "timed_out" } }, { completeness: "unknown" }, { completeness: "truncated" }, { source: "other" }] satisfies Partial<Observation>[]) exact({ ...o, ...patch });
    for (const code of [...Array.from({ length: 32 }, (_, i) => i), ...Array.from({ length: 33 }, (_, i) => i + 127)].filter(n => ![9, 10, 13].includes(n))) {
      exact({ ...o, output: o.output.replace("café", `ca${String.fromCharCode(code)}fé`) });
    }
    for (const output of ["unknown café 雪 🧪\n" + o.output, o.output + "unknown café 雪 🧪\n",
      o.output.replace("warnings summary", "custom warnings summary"), o.output.replace("café", "ca\rfé")]) exact({ ...o, output });
  });
}
for (const c of manifest.cases.filter(c => c.role === "exact")) test(`PY-EXACT-${c.id}: native and incorrect exit0`, () => {
  assert.equal(text(c.expected.file), text(c.original.file)); exact(observation(c));
  exact({ ...observation(c), termination: { kind: "exited", code: 0 } });
});

test("PY-ORACLE: declaration-only, emit-only, forged text, wrong occurrence cannot pass", () => {
  const output = "discard\nwarning café 雪 🧪\nwarning café 雪 🧪\nfooter\n";
  const anchors = [{ text: "warning café 雪 🧪", occurrence: 1 }, { text: "footer", occurrence: 0 }];
  const first = output.indexOf(anchors[0]!.text), second = output.indexOf(anchors[0]!.text, first + 1), end = output.indexOf("footer");
  const spans: Span[] = [[second, end], [end, output.length]], good: Reduction = { required: spans, pieces: spans };
  const expected = output.slice(second); evidence(output, expected, anchors, good);
  assert.throws(() => evidence(output, expected, anchors, { ...good, required: spans.slice(1) }), /undeclared/);
  assert.throws(() => evidence(output, expected, anchors, { ...good, pieces: [spans[1]!] }), /unemitted/);
  assert.throws(() => evidence(output, expected, anchors, { ...good, pieces: [{ text: expected }] }), /source emission/);
  assert.throws(() => evidence(output, expected, anchors, { required: [[first, second], spans[1]!], pieces: spans }), /undeclared/);
  assert.throws(() => evidence(output, expected, [], good), /empty oracle/);
});

for (const mode of ["default", "quiet"] as const) test(`PY-IDENTITY-${mode}: literal paths/color/python/doctest`, () => {
  const c = find(mode);
  for (const launcher of ["pytest", "python -m pytest", "python3 -m pytest"]) {
    for (const flags of ["", " --color=no", " test_native.py", " ./tests", " --doctest-modules test_native.py --color=no"]) {
      const command = launcher + (mode === "quiet" ? " -q" : "") + flags;
      assert.equal(pytestProfile.match(command.split(" ")), true, command); reduced(c, undefined, undefined, command);
    }
  }
});
test("PY-IDENTITY-REFUSE: closed flags, launchers, expansions and incompatible mode", () => {
  const quiet = observation(find("quiet"));
  assert.equal(filter({ ...quiet, command: "pytest" }).status, "passthrough");
  assert.equal(pytestProfile.reduce(quiet.output, { ...quiet, command: "pytest" }), undefined);
  const native = observation(find("default"));
  for (const command of ["pytest -v", "pytest -s", "pytest --junitxml=x", "pytest -p custom", "pytest --unknown", "pytest -qq",
    "python3.14 -m pytest", "uv run pytest", "pytest *.py", "pytest; echo ok", "pytest && echo ok", "X=1 pytest", "pytest --color=yes"]) {
    assert.equal(filter({ ...native, command }).status, "passthrough", command);
  }
});

for (const id of ["default", "quiet"]) test(`PY-MALFORMED-${id}: summary/skip/warnings/progress reject whole output`, () => {
  const c = find(id), o = observation(c), rows = o.output.split("\n");
  const warning = rows.find(r => r.includes("warnings summary"))!, short = rows.find(r => r.includes("short test summary info"))!;
  const record = rows.find(r => r.startsWith("SKIPPED") || r.startsWith("SUBSKIPPED"))!, footer = rows.at(-2)!;
  const warningContext = rows.find(r => r.includes("::test_warning_context"))!, docs = rows.find(r => r.startsWith("-- Docs:"))!;
  const changes: [string, string][] = [["1202 passed", "1201 passed"], ["[1] test_native.py:", "[2] test_native.py:"],
    ["[1] test_native.py:", "[0] test_native.py:"], ["[1] test_native.py:", "[01] test_native.py:"],
    ["[1] test_native.py:", "[9007199254740992] test_native.py:"], [record, record + "\n" + record],
    [record, record.replace(/test_native\.py:\d+:/, "invalid-location:")], [record, "OPAQUE SUMMARY"], [record + "\n", ""],
    [warning, warning + "\n" + warning], [warningContext, warningContext + "\n" + warningContext],
    [warningContext + "\n", ""], ["UserWarning:", "UnknownThing:"], [docs + "\n", ""],
    [docs, "-- Docs: https://unknown.invalid/warnings"], [short, short + "\n" + short],
    [footer + "\n", ""], [footer, footer + "\n" + footer], ["[100%]", "[99%]"], ["[100%]", "[101%]"],
    ["1 warning", "2 warnings"], ["1 warning", "0 warnings"], [" in ", " in NaN"],
    [warningContext, warningContext + "\nUNKNOWN SOURCE ROW"]];
  if (id === "default") changes.push(["collected 1203", "collected 1204"], ["[  4%]", "[  5%]"], [".................................................................", ".................................................................F"]);
  else changes.push(["uu-", "u-"], ["uu-", "uuu-"], ["uu-", "uus"], ["2 subtests passed", "1 subtests passed"], ["2 skipped", "1 skipped"]);
  for (const [from, to] of changes) {
    const output = o.output.replace(from, to); assert.notEqual(output, o.output, `inert mutation: ${from}`); exact({ ...o, output });
  }
});

test("PY-QUIET-COUNTS: dots/s parent counts exclude u/- for percentage, retain native SUBSKIPPED", () => {
  const c = find("quiet"); reduced(c);
  const raw = text(c.original.file), progress = raw.slice(0, raw.indexOf("=============================== warnings"));
  assert.equal([...progress].filter(m => m === ".").length, 1202); assert.equal([...progress].filter(m => m === "s").length, 1);
  assert.equal([...progress].filter(m => m === "u").length, 2); assert.equal([...progress].filter(m => m === "-").length, 1);
  assert.ok(text(c.expected.file).includes("SUBSKIPPED(case='skip') [1] test_native.py:20:"));
});

test("PY-QUIET-PARENT-PERCENT: u/- excluded before 100%, skip/subtest counts reconciled", () => {
  // Original MIT grammar control, supplemental to frozen native captures.
  const tail = [".uu- [ 90%]", "s [100%]", "=========================== short test summary info ============================",
    "SUBSKIPPED(case='skip') [1] test_control.py:17: subtest café 雪 🧪",
    "SUBSKIPPED(case='skip') [1] test_control.py:20: parent café 雪 🧪",
    "9 passed, 2 skipped, 2 subtests passed in 0.01s"].join("\n") + "\n";
  const output = "........ [ 80%]\n" + tail;
  const anchors = tail.trimEnd().split("\n").map(text => ({ text, occurrence: 0 }));
  const c = { ...find("quiet"), required: anchors }; reduced(c, output, tail);
  for (const [from, to] of [["[ 90%]", "[ 92%]"], ["9 passed", "11 passed"], ["2 skipped", "1 skipped"],
    ["2 subtests passed", "3 subtests passed"], [".uu-", ".uuu-"], [".uu-", ".uu--"]]) {
    exact(observation(c, output.replace(from!, to!)));
  }
});
for (const id of ["default", "quiet"]) test(`PY-NO-SHORT-${id}: mixed progress still required without reasons section`, () => {
  const c = find(id), raw = text(c.original.file), expected = text(c.expected.file);
  const short = raw.indexOf("=========================== short test summary info"), footer = raw.lastIndexOf("\n", raw.length - 2) + 1;
  const removed = raw.slice(short, footer), output = raw.replace(removed, ""), golden = expected.replace(removed, "");
  assert.notEqual(output, raw); assert.notEqual(golden, expected);
  const required = c.required.filter(a => !removed.includes(a.text)); reduced({ ...c, required }, output, golden);
});
