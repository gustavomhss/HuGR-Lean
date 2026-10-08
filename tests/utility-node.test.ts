import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { filter } from "../src/core/index.js";
import type { Observation, Profile, Reduction, Span } from "../src/types.js";
import { nodeTestProfile } from "../src/profiles/node-test.js";

type Artifact = { file: string; sha256: string; bytes: number };
type Anchor = { text: string; occurrence: number };
type Tool = { name: string; version: string; executable: string };
type Capture = {
  command: string; cwd: string; exitCode: number; complete: boolean; signal: string | null; timedOut: boolean;
  nativeSpawned: boolean; nativeExitObserved: boolean; encodingError: string | null; launchError: string | null;
  cleanupErrors: string[]; baselineSourceSHA: string; environmentPolicy: { reporterOverride: string };
  producer: { file: string; sha256: string; bytes: number }; fixtureSources: Artifact[];
  streams: { original: Artifact; stdout: Artifact; stderr: Artifact };
  tools: (Tool & { lockedIntegrity?: string; installation?: string })[];
};
type Case = {
  id: string; profile: string; command: string; role: "noise" | "exact";
  expectedStatus: "reduced" | "passthrough"; exitCode: number; complete: boolean;
  signal: null; timedOut: boolean; capture: Artifact; fixtureSources: (Artifact & { sourceFile?: string })[];
  original: Artifact; stdout: Artifact; stderr: Artifact; expected: Artifact; required: Anchor[]; material: boolean;
};
const root = new URL("../fixtures/utility/node/", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("manifest.json", root), "utf8")) as {
  schema: string; family: string; tools: Tool[];
  producer: { script: string; sourceSHA256: string }; cases: Case[];
};
const sha = (data: Uint8Array) => createHash("sha256").update(data).digest("hex");
function artifact(item: Artifact): Buffer {
  assert.match(item.file, /^(?:captures|sources)\/[\w-]+\/[\w.-]+$/);
  const data = readFileSync(new URL(item.file, root));
  assert.equal(data.length, item.bytes, `bytes: ${item.file}`);
  assert.equal(sha(data), item.sha256, `hash: ${item.file}`);
  return data;
}
const text = (item: Artifact) => artifact(item).toString("utf8");
const noise = manifest.cases.filter((item) => item.role === "noise");
function observation(item: Case, output = text(item.original)): Observation {
  return { source: "shell", command: item.command, output, completeness: item.complete ? "complete" : "truncated",
    termination: item.timedOut ? { kind: "timed_out" } : item.signal ? { kind: "unknown" } :
      { kind: "exited", code: item.exitCode }, presentation: "unknown" };
}
function lines(source: string): Span[] {
  return [...source.matchAll(/[^\n]*\n|[^\n]+$/g)].map((match) => [match.index, match.index + match[0].length]);
}
// Independent positional retain contract, not inferred from Profile or expected text matching.
function kept(item: Case, source: string): Span[] {
  return lines(source).filter((_, i) => item.role === "exact" || (item.id.includes("-flat-") ?
    i === 0 || i >= 73 && i <= 81 : i <= 1 || i >= 74 && i <= 98 || i >= 105 && i <= 113));
}
function anchorSpan(source: string, anchor: Anchor): Span {
  assert.ok(anchor.text.length > 0);
  assert.ok(Number.isSafeInteger(anchor.occurrence) && anchor.occurrence >= 0);
  let at = -anchor.text.length;
  for (let i = 0; i <= anchor.occurrence; i++) {
    at = source.indexOf(anchor.text, at + anchor.text.length);
    assert.ok(at >= 0, `missing occurrence: ${JSON.stringify(anchor)}`);
  }
  return [at, at + anchor.text.length];
}
function covers(spans: readonly Span[], [start, end]: Span): boolean {
  let cursor = start;
  for (const [first, last] of spans) {
    if (first > cursor) break;
    if (last > cursor) cursor = last;
    if (cursor >= end) return true;
  }
  return false;
}
// Private rendering deliberately accepts arbitrary text: emit-only mutants keep identical replacement.
const renderPrivate = (source: string, reduction: Reduction) => reduction.pieces.map((piece) =>
  "text" in piece ? piece.text : source.slice(...piece)).join("");
function evidence(source: string, expected: string, anchors: readonly Span[], value: Reduction): void {
  assert.equal(renderPrivate(source, value), expected, "replacement bytes");
  const emitted = value.pieces.filter((piece): piece is Span => Array.isArray(piece));
  for (const spans of [value.required, emitted]) {
    let previous = 0;
    for (const [first, last] of spans) {
      assert.ok(Number.isSafeInteger(first) && Number.isSafeInteger(last) && first >= previous && last > first && last <= source.length);
      for (const boundary of [first, last]) assert.ok(!(source.codePointAt(boundary - 1)! > 0xffff), "surrogate boundary");
      previous = last;
    }
  }
  for (const anchor of anchors) {
    assert.ok(covers(value.required, anchor), `declared evidence: ${anchor}`);
    assert.ok(covers(emitted, anchor), `emitted evidence: ${anchor}`);
  }
}
function preserved(obs: Observation, profile: Profile = nodeTestProfile): void {
  const result = filter(obs, { profiles: [profile] });
  assert.equal(result.status, "passthrough");
  assert.ok(!("replacement" in result));
  assert.equal(result.inputBytes, Buffer.byteLength(obs.output));
  assert.equal(result.outputBytes, result.inputBytes);
}
function accepted(obs: Observation, expected: string, spans: Span[], profile = nodeTestProfile): Reduction {
  const result = filter(obs, { profiles: [profile] });
  assert.equal(result.status, "reduced", "NODE-TAP accepted baseline must be RED before implementation");
  assert.ok("replacement" in result);
  assert.equal(result.replacement, expected);
  assert.equal(result.profile, "node-test");
  assert.equal(result.inputBytes, Buffer.byteLength(obs.output));
  assert.equal(result.outputBytes, Buffer.byteLength(expected));
  const reduction = profile.reduce(obs.output, obs);
  assert.ok(reduction, "Profile.reduce must return source evidence");
  evidence(obs.output, expected, spans, reduction);
  return reduction;
}
function positive(item: Case, source = text(item.original), expected = text(item.expected), command = item.command, profile = nodeTestProfile, anchors = item.required): void {
  const reduction = accepted({ ...observation(item, source), command }, expected, kept(item, source), profile);
  for (const anchor of anchors) {
    const adjusted = { ...anchor, text: anchor.text.replace(/\r$/, "") };
    evidence(source, expected, [anchorSpan(source, adjusted)], reduction);
  }
}

test("NODE-CORPUS: ten native receipts, commands, source names/hashes and exact goldens", () => {
  assert.equal(manifest.schema, "hugr-lean/utility-corpus/1");
  assert.equal(manifest.family, "node");
  const ids = ["node", "tsx"].flatMap((runner) => ["flat", "nested", "failure", "opaque", "diagnostic"].map((kind) => `${runner}-${kind}-default`));
  assert.deepEqual(manifest.cases.map((item) => item.id).sort(), ids.sort());
  assert.deepEqual(readdirSync(new URL("captures/", root)).sort(), ids);
  assert.deepEqual(manifest.tools.map(({ name, version }) => ({ name, version })),
    [{ name: "node", version: "v22.17.1" }, { name: "tsx", version: "4.23.15" }]);
  assert.deepEqual(manifest.producer, { script: "scripts/utility-native-node.mjs",
    sourceSHA256: "5b9f2059081fb482ff059ea71dbda1372206a1dafd57e1d1d57965c8cfac8d19" });
  assert.equal(noise.length, 4);
  for (const item of manifest.cases) {
    const receipt = JSON.parse(text(item.capture)) as Capture;
    assert.equal(item.capture.file, `captures/${item.id}/capture.json`);
    assert.equal(item.command, item.id.startsWith("node-") ? "node --test fixture.mjs" : "tsx --test fixture.test.ts");
    for (const key of ["command", "exitCode", "complete", "signal", "timedOut"] as const) assert.equal(receipt[key], item[key]);
    assert.equal(receipt.nativeSpawned, true); assert.equal(receipt.nativeExitObserved, true);
    assert.equal(receipt.encodingError, null); assert.equal(receipt.launchError, null);
    assert.deepEqual(receipt.cleanupErrors, []);
    assert.deepEqual(receipt.tools.map(({ name, version, executable }) => ({ name, version, executable })), manifest.tools);
    for (const tool of manifest.tools) assert.deepEqual(Object.keys(tool).sort(), ["executable", "name", "version"]);
    assert.equal(receipt.tools[1]!.installation, "existing pinned project; never installed");
    assert.match(receipt.tools[1]!.lockedIntegrity!, /^sha512-/);
    assert.deepEqual(receipt.producer, { file: manifest.producer.script, sha256: manifest.producer.sourceSHA256, bytes: 14960 });
    assert.equal(receipt.baselineSourceSHA, "882585e5f916821a482d14bc7bfe7d6a102b772a");
    assert.equal(receipt.environmentPolicy.reporterOverride, "none on default cases");
    for (const key of ["original", "stdout", "stderr"] as const) assert.deepEqual(receipt.streams[key], item[key]);
    const original = artifact(item.original), expected = artifact(item.expected);
    assert.deepEqual(Buffer.from(original.toString("utf8")), original, "UTF-8 roundtrip");
    assert.equal(original.length, artifact(item.stdout).length + artifact(item.stderr).length);
    assert.equal(item.fixtureSources.length, receipt.fixtureSources.length);
    item.fixtureSources.forEach((source, i) => {
      const { sourceFile, ...stored } = source;
      assert.deepEqual({ ...stored, file: sourceFile ?? source.file }, receipt.fixtureSources[i]);
      artifact(source);
    });
    const source = original.toString("utf8"), spans = kept(item, source);
    assert.equal(spans.map((span) => source.slice(...span)).join(""), expected.toString("utf8"));
    assert.equal(item.required.length, spans.length, "every retained nonempty line has an anchor");
    item.required.forEach((anchor, i) => {
      const span = spans[i]!;
      assert.deepEqual(anchorSpan(source, anchor), [span[0], span[1] - 1]);
      assert.equal(anchor.text, source.slice(...span).replace(/\n$/, ""));
    });
    const saved = original.length - expected.length;
    assert.equal(item.material, saved >= 1024 && saved >= original.length * 0.1);
    assert.equal(item.expectedStatus, item.role === "noise" ? "reduced" : "passthrough");
    if (item.role === "exact") assert.deepEqual(expected, original);
  }
  assert.ok(noise.some((item) => item.material));
  const corrupt = { ...manifest.cases[0]!.original, sha256: "0".repeat(64) };
  assert.throws(() => artifact(corrupt), /hash:/, "digest instrument must see corruption");
});

for (const item of manifest.cases) test(`NODE-NATIVE ${item.id}: ${item.expectedStatus}`, () => {
  if (item.role === "noise") positive(item);
  else {
    preserved(observation(item));
    preserved({ ...observation(item), termination: { kind: "exited", code: 0 } });
  }
});

for (const item of noise) {
  test(`NODE-ORACLE ${item.id}: every retained occurrence catches declare-only and emit-only loss`, () => {
    const source = text(item.original), expected = text(item.expected), spans = kept(item, source);
    const valid: Reduction = { pieces: spans, required: spans };
    evidence(source, expected, spans, valid);
    for (let i = 0; i < spans.length; i++) {
      const declareOnly = { ...valid, required: spans.filter((_, index) => index !== i) };
      assert.equal(renderPrivate(source, declareOnly), expected);
      assert.throws(() => evidence(source, expected, spans, declareOnly), /declared evidence/);
      const emitOnly: Reduction = { required: spans, pieces: spans.map((span, index) => index === i ?
        { text: source.slice(...span) } : span) };
      assert.equal(renderPrivate(source, emitOnly), expected);
      assert.throws(() => evidence(source, expected, spans, emitOnly), /emitted evidence/);
    }
    evidence(source, expected, spans, valid); // exact private fixture restored, no production mutation
  });
  test(`NODE-REFUSE ${item.id}: every observation refusal`, () => {
    const obs = observation(item);
    const variants: Partial<Observation>[] = [{ source: "other" }, { completeness: "truncated" },
      { completeness: "unknown" }, { termination: { kind: "unknown" } },
      { termination: { kind: "timed_out" } }, { termination: { kind: "exited", code: 1 } }];
    for (const change of variants) {
      const changed = { ...obs, ...change };
      preserved(changed); assert.equal(nodeTestProfile.reduce(changed.output, changed), undefined);
    }
  });
  test(`NODE-UTF16 ${item.id}: ordinary Unicode and CRLF reduce with source-backed native durations`, () => {
    const source = text(item.original), expected = text(item.expected);
    assert.ok(source.includes("Ω 🚀")); assert.ok(Buffer.byteLength(source) > source.length);
    positive(item, source.replace(/\n/g, "\r\n"), expected.replace(/\n/g, "\r\n"));
  });
  test(`NODE-CONTROLS ${item.id}: C0/C1 in removable and protected context never disappears`, () => {
    const source = text(item.original);
    const controls = Array.from({ length: 160 }, (_, i) => i).filter((i) => i <= 8 || i === 11 || i === 12 || i >= 14 && i <= 31 || i >= 127);
    for (const code of controls) {
      const changed = source.replace(/Ω/g, `Ω${String.fromCharCode(code)}`);
      assert.notEqual(changed, source); preserved(observation(item, changed));
      assert.equal(nodeTestProfile.reduce(changed, observation(item, changed)), undefined);
    }
    preserved(observation(item, source.replace("Ω", "Ω\r")));
  });
}

const flat = noise.find((item) => item.id === "node-flat-default")!;
const nested = noise.find((item) => item.id === "node-nested-default")!;
function changed(source: string, before: string | RegExp, after: string): string {
  const output = source.replace(before, after); assert.notEqual(output, source, `mutation did not apply: ${before}`); return output;
}
const corruptions: [string, Case, string | RegExp, string][] = [
  ["TAP version", flat, "TAP version 13", "TAP version 12"],
  ["root plan count", flat, "1..12", "1..13"], ["empty plan", flat, "1..12", "1..0"],
  ["missing plan", flat, "1..12\n", ""], ["duplicate plan", flat, "1..12", "1..12\n1..12"],
  ["sequence index", flat, "ok 1 -", "ok 2 -"], ["duplicate index", flat, "ok 2 -", "ok 1 -"],
  ["name mismatch", flat, "ok 1 - utility", "ok 1 - other"],
  ["missing test header", flat, /# Subtest:[^\n]+\n/, ""],
  ["duration NaN", flat, /duration_ms: [\d.]+/, "duration_ms: NaN"],
  ["duration infinite", flat, /duration_ms: [\d.]+/, "duration_ms: Infinity"],
  ["duration negative", flat, /duration_ms: [\d.]+/, "duration_ms: -1"],
  ["duration overflow", flat, /duration_ms: [\d.]+/, "duration_ms: 1e309"],
  ["unknown YAML key", flat, "  type: 'test'", "  arbitrary: 'lost'\n  type: 'test'"],
  ["suite type", flat, "type: 'test'", "type: 'suite'"],
  ["missing YAML type", flat, "  type: 'test'\n", ""],
  ["unclosed YAML", flat, "  ...\n", ""],
  ["summary tests", flat, "# tests 12", "# tests 13"], ["summary pass", flat, "# pass 12", "# pass 11"],
  ["summary suites", flat, "# suites 0", "# suites 1"], ["summary failure", flat, "# fail 0", "# fail 1"],
  ["summary cancellation", flat, "# cancelled 0", "# cancelled 1"],
  ["missing footer", flat, /# duration_ms[^\n]+\n$/, ""],
  ["duplicate footer", flat, /(# duration_ms[^\n]+\n)$/, "$1$1"],
  ["reordered footer", flat, "# tests 12\n# suites 0", "# suites 0\n# tests 12"],
  ["unknown root comment", flat, "TAP version 13\n", "TAP version 13\n# opaque user log Ω 🚀\n"],
  ["extra footer", flat, /$/, "opaque tail Ω 🚀\n"],
  ["child plan count", nested, "    1..15", "    1..14"],
  ["missing child plan", nested, "    1..15\n", ""],
  ["child sequence", nested, "ok 15 -", "ok 14 -"],
  ["parent identity", nested, "ok 1 - UTILITY_SERIAL_PARENT", "ok 1 - DIFFERENT_PARENT"],
  ["parent indentation", nested, "    # Subtest: UTILITY_SKIP_CHILD", "  # Subtest: UTILITY_SKIP_CHILD"],
  ["hierarchy tests", nested, "# tests 17", "# tests 2"],
  ["hierarchy pass", nested, "# pass 15", "# pass 17"],
  ["hierarchy skip", nested, "# skipped 1", "# skipped 0"],
  ["hierarchy todo", nested, "# todo 1", "# todo 0"],
  ["unknown YAML parent", nested, "  duration_ms: 219.17975", "  duration_ms: 219.17975\n  arbitrary: 1"],
];
const coldCounterexamples: typeof corruptions = [
  ["EOF midfooter missing duration value", flat, /# duration_ms[^\n]+\n$/, "# duration_ms"],
  ["parent duration NaN", nested, "  duration_ms: 219.17975", "  duration_ms: NaN"],
  ["footer duration NaN", flat, /# duration_ms [\d.]+/, "# duration_ms NaN"],
  ["footer duration negative", flat, /# duration_ms [\d.]+/, "# duration_ms -1"],
  ["flat todo inconsistent", flat, "# todo 0", "# todo 1"],
  ["flat skipped inconsistent", flat, "# skipped 0", "# skipped 1"],
  ["unknown YAML type", flat, "type: 'test'", "type: 'unknown'"],
  ["nested root plan 3", nested, "\n1..2\n", "\n1..3\n"],
  ["child zero plan", nested, "    1..15", "    1..0"],
  ["root sibling index 3", nested, "ok 2 - UTILITY_ROOT_SIBLING", "ok 3 - UTILITY_ROOT_SIBLING"],
];
corruptions.push(...coldCounterexamples);
function refusalCase(item: Case, before: string | RegExp, after: string, profile = nodeTestProfile): void {
  positive(item, undefined, undefined, undefined, profile); // accepted correct native baseline in this same test
  const output = changed(text(item.original), before, after);
  preserved(observation(item, output), profile); assert.equal(profile.reduce(output, observation(item, output)), undefined);
}
for (const [name, item, before, after] of corruptions) test(`NODE-MALFORMED ${name}: whole output exact`, () => {
  refusalCase(item, before, after);
});
test("NODE-ORACLE: cold counterfeit accepting all ten new malformed inputs fails each refusal case", () => {
  for (const [, item, before, after] of coldCounterexamples) {
    const counterfeit: Profile = { id: "node-test", match: nodeTestProfile.match, reduce: (source) => {
      const spans = kept(item, source); return { pieces: spans, required: spans };
    } };
    assert.throws(() => refusalCase(item, before, after, counterfeit), /reduced/);
  }
});
test("NODE-ORACLE: unchanged replacement cannot hide required spans splitting a surrogate pair", () => {
  const source = text(nested.original), expected = text(nested.expected), spans = kept(nested, source);
  const valid: Reduction = { pieces: spans, required: spans }, emoji = source.indexOf("🚀");
  const profile = (value: Reduction): Profile => ({ id: "node-test", match: () => true, reduce: () => value });
  accepted(observation(nested), expected, spans, profile(valid));
  for (const split of [[emoji, emoji + 1], [emoji + 1, emoji + 2]] as const) {
    const broken = { ...valid, required: [split] };
    assert.equal(renderPrivate(source, broken), expected);
    assert.throws(() => evidence(source, expected, [], broken), /surrogate boundary/);
    assert.equal(filter(observation(nested), { profiles: [profile(broken)] }).status, "failed_open");
  }
  evidence(source, expected, spans, valid);
});

test("NODE-ORACLE: refusal assertion catches private count-guard bypass", () => {
  const source = changed(text(flat.original), "1..12", "1..13"), spans = kept(flat, source);
  const mutant: Profile = { id: "private-count-guard-mutant", match: () => true,
    reduce: () => ({ pieces: spans, required: spans }) };
  assert.throws(() => preserved(observation(flat, source), mutant), /reduced/);
  preserved(observation(flat, source));
});

test("NODE-NAMES: duplicate descriptions stay valid when numeric scope is unambiguous", () => {
  const source = changed(text(flat.original), /utility passing item 02/g, "utility passing item 01");
  positive(flat, source);
});
test("NODE-SYNTHETIC HIERARCHY: accepted depth 32 baseline precedes depth 33 refusal", () => {
  function block(depth: number, maximum: number): string {
    const indent = "    ".repeat(depth), name = `depth ${depth}`;
    return `${indent}# Subtest: ${name}\n${depth < maximum ? `${block(depth + 1, maximum)}${indent}    1..1\n` : ""}` +
      `${indent}ok 1 - ${name}\n${indent}  ---\n${indent}  duration_ms: 0\n${indent}  type: 'test'\n${indent}  ...\n`;
  }
  const outputAt = (depth: number) => `TAP version 13\n${block(0, depth)}1..1\n# tests ${depth + 1}\n# suites 0\n# pass ${depth + 1}\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n# duration_ms 0\n`;
  const baseline = outputAt(32), leaf = block(32, 32), start = baseline.indexOf(leaf);
  assert.ok(start >= 0);
  const spans: Span[] = [[0, start], [start + leaf.length, baseline.length]];
  accepted(observation(flat, baseline), spans.map((span) => baseline.slice(...span)).join(""), spans);
  const output = outputAt(33);
  preserved(observation(flat, output)); assert.equal(nodeTestProfile.reduce(output, observation(flat, output)), undefined);
});
for (const [item, before] of [[flat, "utility passing item 01"], [nested, "UTILITY_TODO_CHILD"]] as const) {
  test(`NODE-SYNTHETIC directive-shaped full name: ${item.id}`, () => {
    const rename = (source: string) => source.replaceAll(before, "utility # TODO literal description");
    positive(item, rename(text(item.original)), rename(text(item.expected)), undefined, undefined,
      item.required.map((anchor) => ({ ...anchor, text: rename(anchor.text) })));
  });
}
for (const runner of ["node", "tsx"]) {
  const item = noise.find((entry) => entry.id === `${runner}-flat-default`)!;
  const file = runner === "node" ? "fixture.mjs" : "fixture.test.ts";
  for (const tail of ["", file, `--test-reporter=tap ${file}`, `--test-concurrency=2 ${file}`,
    `--test-reporter=tap --test-concurrency=2 ${file}`]) test(`NODE-SYNTHETIC command replay admit ${runner} --test ${tail}`, () => {
    const command = `${runner} --test${tail ? ` ${tail}` : ""}`;
    assert.equal(nodeTestProfile.match(command.split(" ")), true); positive(item, undefined, undefined, command);
  });
  for (const tail of [`--test-reporter=spec ${file}`, `--test-reporter=json ${file}`, `--eval x`,
    `--unknown ${file}`, `--test-concurrency=0 ${file}`, `--test-concurrency=x ${file}`,
    `--test-reporter=tap --test-reporter=tap ${file}`, `*.mjs`]) test(`NODE-SYNTHETIC command replay refuse ${runner} --test ${tail}`, () => {
    positive(item);
    const command = `${runner} --test ${tail}`;
    assert.equal(nodeTestProfile.match(command.split(" ")), false); preserved({ ...observation(item), command });
  });
}
for (const command of ["node fixture.mjs", "node -e x", "node --trace-warnings --test fixture.mjs",
  "npm test", "npm exec tsx --test fixture.test.ts", "NODE_OPTIONS=x node --test fixture.mjs",
  "node --test fixture.mjs && node --test fixture.mjs", "node --test fixture.mjs | tee result"]) {
  test(`NODE-IDENTITY refuse ${command}`, () => preserved({ ...observation(flat), command }));
}
