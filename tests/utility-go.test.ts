import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { relative } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { filter } from "../src/core/engine.js";
import { goProfile } from "../src/profiles/go.js";
import type { Observation, Profile, Reduction, Span } from "../src/types.js";

type Artifact = { file: string; sha256: string; bytes: number; sourceFile?: string };
type Anchor = { text: string; occurrence: number };
type Case = {
  id: string; profile: string; command: string; role: "noise" | "exact";
  expectedStatus: "reduced" | "passthrough"; exitCode: number; complete: boolean;
  signal: null; timedOut: boolean; capture: Artifact; fixtureSources: Artifact[];
  original: Artifact; stdout: Artifact; stderr: Artifact; expected: Artifact;
  required: Anchor[]; material: boolean;
};
const root = new URL("../fixtures/utility/go/", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("manifest.json", root), "utf8")) as {
  schema: string; family: string; tools: { name: string; version: string; executable: string }[];
  producer: { script: string; sourceSHA256: string }; cases: Case[];
};
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
function bytes(a: Artifact): Buffer {
  assert.match(a.file, /^(?:[\w.-]+\/)*[\w.-]+$/);
  assert.ok(!a.file.split("/").includes(".."), "artifact traversal");
  const b = readFileSync(new URL(a.file, root));
  assert.equal(b.length, a.bytes, a.file);
  assert.equal(sha(b), a.sha256, a.file);
  assert.deepEqual(Buffer.from(b.toString("utf8")), b, "UTF-8 roundtrip");
  return b;
}
const text = (a: Artifact) => bytes(a).toString("utf8");
function entry(id: string): Case {
  const found = manifest.cases.find(c => c.id === id);
  assert.ok(found, `missing native case ${id}`);
  return found;
}
function observation(output: string, command = "go test -v ./..."): Observation {
  return { source: "shell", command, output, termination: { kind: "exited", code: 0 },
    completeness: "complete", presentation: "unknown" };
}
function locate(input: string, anchor: Anchor): Span {
  assert.ok(anchor.text.length > 0 && Number.isInteger(anchor.occurrence) && anchor.occurrence >= 0);
  let start = -1;
  for (let i = 0; i <= anchor.occurrence; i++) {
    start = input.indexOf(anchor.text, start + 1);
    assert.ok(start >= 0, `missing occurrence ${anchor.occurrence}: ${anchor.text}`);
  }
  return [start, start + anchor.text.length];
}
function evidence(input: string, result: Reduction, anchors: readonly Anchor[], expected: string): void {
  assert.ok(anchors.length > 0 && result.required.length > 0, "nonempty evidence");
  const spans: Span[] = result.pieces.map(p => {
    assert.ok(!("text" in p), "evidence must be emitted as source spans");
    assert.ok(Number.isInteger(p[0]) && Number.isInteger(p[1]) && p[0] >= 0 && p[0] < p[1] && p[1] <= input.length);
    return p;
  });
  for (let i = 1; i < spans.length; i++) assert.ok(spans[i - 1]![1] <= spans[i]![0], "ordered disjoint pieces");
  assert.equal(spans.map(s => input.slice(...s)).join(""), expected, "independent golden");
  const covers = (list: readonly Span[], s: Span) => list.some(p => p[0] <= s[0] && p[1] >= s[1]);
  for (const a of anchors) {
    const s = locate(input, a);
    assert.ok(covers(result.required, s), `required declaration missing: ${a.occurrence}:${a.text}`);
    assert.ok(covers(spans, s), `emitted evidence missing: ${a.occurrence}:${a.text}`);
  }
  for (const s of result.required) {
    assert.ok(Number.isInteger(s[0]) && Number.isInteger(s[1]) && s[0] >= 0 && s[0] < s[1] && s[1] <= input.length);
    assert.ok(covers(spans, s), "declared evidence not emitted");
  }
}
function accepted(input: string, expected: string, anchors: readonly Anchor[], command = "go test -v ./..."): void {
  const obs = observation(input, command);
  assert.equal(goProfile.match(command.split(" ")), true, "Go identity must match");
  const reduction = goProfile.reduce(input, obs);
  assert.ok(reduction, "Go profile must reduce native grammar");
  evidence(input, reduction, anchors, expected);
  const out = filter(obs);
  assert.equal(out.status, "reduced", "default registry must reduce Go");
  assert.ok("replacement" in out);
  assert.equal(out.profile, "go-test-verbose");
  assert.equal(out.replacement, expected);
  assert.equal(out.inputBytes, Buffer.byteLength(input));
  assert.equal(out.outputBytes, Buffer.byteLength(expected));
  assert.ok(out.outputBytes < out.inputBytes, "strictly smaller");
}
function exact(obs: Observation, profiles?: readonly Profile[]): void {
  const out = filter(obs, profiles ? { profiles } : {});
  assert.equal(out.status, "passthrough", "preserve whole original");
  assert.equal("replacement" in out, false);
  assert.equal(out.inputBytes, Buffer.byteLength(obs.output));
  assert.equal(out.outputBytes, out.inputBytes);
}
function rejected(input: string, obs = observation(input)): void {
  assert.equal(goProfile.reduce(input, obs), undefined, "unsupported grammar/facts must decline");
  exact(obs);
}

test("native Go inventory: byte digests, direct receipts, source names, tool versions and contract goldens", () => {
  assert.equal(manifest.schema, "hugr-lean/utility-corpus/1");
  assert.equal(manifest.family, "go");
  assert.deepEqual(manifest.cases.map(c => c.id), ["cold", "cached", "failure", "diagnostic", "opaque"]);
  assert.deepEqual(manifest.tools.map(t => [t.name, t.version]), [["node", "v22.17.1"], ["go", "go version go1.27.1 darwin/amd64"]]);
  assert.deepEqual(manifest.producer, { script: "scripts/utility-native-go.mjs",
    sourceSHA256: "6baace859cc099780cce0b561f96c6f7af310f9e739378813846894fca53ecfc" });
  const inventory = new Set<string>(["manifest.json", "SOURCES.md"]);
  for (const c of manifest.cases) {
    const receipt = JSON.parse(text(c.capture));
    assert.equal(receipt.baseline, "882585e5f916821a482d14bc7bfe7d6a102b772a");
    assert.equal(receipt.nativeSpawned, true); assert.equal(receipt.nativeExitObserved, true);
    for (const key of ["command", "exitCode", "complete", "signal", "timedOut"] as const) assert.equal(receipt[key], c[key], key);
    assert.deepEqual(receipt.tools.map(({ name, version, executable }: typeof manifest.tools[number]) => ({ name, version, executable })), manifest.tools);
    assert.equal(receipt.producer.sourceSHA256, manifest.producer.sourceSHA256);
    assert.equal(receipt.producer.script, manifest.producer.script);
    assert.deepEqual(receipt.errors, { launch: null, encoding: null, cleanup: [], preparation: null });
    assert.equal(receipt.captureDefinition, "stdout/stderr arrival order; no text rewriting");
    assert.equal(c.profile, "go-test-verbose"); assert.equal(c.command, "go test -v ./...");
    assert.equal(c.original.bytes, c.stdout.bytes + c.stderr.bytes);
    const original = text(c.original), expected = text(c.expected);
    for (const key of ["original", "stdout", "stderr"] as const) assert.deepEqual(receipt[key], c[key]);
    assert.equal(receipt.fixtureSources.length, c.fixtureSources.length);
    assert.ok(c.fixtureSources.length > 0);
    for (const source of c.fixtureSources) {
      const native = receipt.fixtureSources.find((s: Artifact) => s.file === (source.sourceFile ?? source.file));
      assert.ok(native, `unbound source name ${source.file}`);
      assert.equal(source.sha256, native.sha256); assert.equal(source.bytes, native.bytes);
      bytes(source); inventory.add(source.file);
    }
    for (const a of [c.capture, c.original, c.stdout, c.stderr, c.expected]) { bytes(a); inventory.add(a.file); }
    const rows = original.match(/[^\n]*\n|[^\n]+$/g)!;
    const positions = c.role === "noise" ? [1, 2, 3, 14, 15, 16, 17, 18, 31, 32, 33] : rows.map((_, i) => i + 1);
    const keep = positions.map(n => ({ text: rows[n - 1]!, occurrence: rows.slice(0, n - 1).filter(r => r === rows[n - 1]).length }));
    assert.deepEqual(c.required, keep, "every retained physical line, occurrence-aware");
    assert.equal(expected, keep.map(a => a.text).join(""), "explicit retain contract, no filter calls");
    for (const a of c.required) assert.equal(original.slice(...locate(original, a)), a.text);
    const saved = c.original.bytes - c.expected.bytes;
    assert.equal(c.material, saved >= 1024 && saved >= c.original.bytes * .1);
    assert.equal(c.expectedStatus, c.role === "noise" ? "reduced" : "passthrough");
    if (c.role === "exact") assert.equal(expected, original);
  }
  assert.ok(manifest.cases.some(c => c.role === "noise" && c.material), "MATERIAL: native family witness");
  const disk = readdirSync(root, { recursive: true, withFileTypes: true })
    .filter(d => d.isFile()).map(d => relative(fileURLToPath(root), `${d.parentPath}/${d.name}`));
  assert.deepEqual(disk.sort(), [...inventory].sort(), "bidirectional owned artifact inventory");
});

for (const [id, label] of [["cold", "GO-PACKAGES"], ["cached", "GO-CACHE"]] as const) {
  test(`${label}: native ${id}, independent golden, default registry, declared and emitted context`, () => {
    const c = entry(id);
    accepted(text(c.original), text(c.expected), c.required, c.command);
  });
  test(`${label}: CRLF, unterminated final row, Unicode UTF-16 spans and UTF-8 metrics`, () => {
    const c = entry(id), input = text(c.original), expected = text(c.expected);
    accepted(input.replaceAll("\n", "\r\n"), expected.replaceAll("\n", "\r\n"), c.required.map(a => ({ ...a, text: a.text.replaceAll("\n", "\r\n") })));
    accepted(input.slice(0, -1), expected.slice(0, -1), c.required.map((a, i) => i === c.required.length - 1 ? { ...a, text: a.text.slice(0, -1) } : a));
    const changed = (s: string) => s.replaceAll("TestNativePackageEvidence01", "Test𐐀Café01");
    assert.equal("𐐀".length, 2); assert.equal(Buffer.byteLength("𐐀"), 4);
    accepted(changed(input), changed(expected), c.required.map(a => ({ ...a, text: changed(a.text) })));
  });
  test(`${label}: nonzero, timeout, truncation, unknown facts and non-shell refuse`, () => {
    const input = text(entry(id).original), base = observation(input);
    for (const delta of [
      { termination: { kind: "exited", code: 1 } }, { termination: { kind: "exited", code: 7 } },
      { termination: { kind: "timed_out" } }, { termination: { kind: "unknown" } },
      { completeness: "truncated" }, { completeness: "unknown" }, { source: "other" },
    ] as const) rejected(input, { ...base, ...delta });
  });
  test(`${label}: unknown rows and C0/C1 at every physical boundary refuse`, () => {
    const input = text(entry(id).original);
    const offsets = [0, ...[...input.matchAll(/\n/g)].map(m => m.index + 1)];
    for (const offset of offsets) for (const row of ["opaque café 🧭\n", "PASS user log\n", "    free-floating continuation\n"])
      rejected(input.slice(0, offset) + row + input.slice(offset));
    for (const code of [...Array.from({ length: 32 }, (_, i) => i), ...Array.from({ length: 33 }, (_, i) => i + 127)]) {
      if (code === 9 || code === 10 || code === 13) continue;
      rejected(input.replace("HUGR_GO_CRITICAL_SENTINEL", `HUGR_${String.fromCharCode(code)}GO_CRITICAL_SENTINEL`));
    }
    rejected(input.replace("café", "ca\rfé"));
  });
}

test("Go identities: closed positive argv and unsupported wrappers/options", () => {
  for (const tail of [[], ["."], ["./..."]]) assert.equal(goProfile.match(["go", "test", "-v", ...tail]), true);
  for (const argv of [[], ["go", "test"], ["go", "test", "-v", "./pkg"], ["go", "test", "-v", "./...", "."],
    ["go", "test", "-v", "-race"], ["go", "test", "-v", "-json"], ["go", "test", "-v", "./...", "-count=1"],
    ["env", "go", "test", "-v"], ["/tmp/go", "test", "-v"], ["go", "test", "-v", "&&", "echo"]])
    assert.equal(goProfile.match(argv), false, argv.join(" "));
  for (const command of ["go test -v ./... | cat", "go test -v ./... && echo done", "GOFLAGS=-race go test -v ./..."])
    exact(observation(text(entry("cold").original), command));
});

for (const id of ["failure", "diagnostic", "opaque"]) test(`native ${id}: exact bytes; incorrect exit0 positive control`, () => {
  const c = entry(id), input = text(c.original);
  exact({ ...observation(input), termination: { kind: "exited", code: c.exitCode } });
  exact(observation(input));
  if (id !== "diagnostic") assert.equal(goProfile.reduce(input, observation(input)), undefined);
  const destructive: Profile = { id: "go-test-verbose", match: () => true,
    reduce: () => ({ pieces: [[0, 1]], required: [[0, 1]] }) };
  assert.throws(() => exact(observation(input), [destructive]), /preserve whole original/,
    "native exact oracle must catch destructive reduction even under incorrect exit0");
});

test("Go rejects malformed package/duration/count/log, missing cache and within-package duplicate names", () => {
  for (const id of ["cold", "cached"]) {
    const input = text(entry(id).original);
    const mutations = [
      (s: string) => s.replace("/beta\t", "/alpha\t"),
      (s: string) => s.replace("/empty\t", "/alpha\t"),
      (s: string) => s.replace("/alpha\t", "/bad package\t"),
      (s: string) => s.replace(/^ok[^\n]*\n/m, ""),
      (s: string) => s.replace(/\nPASS\n/, "\n"),
      (s: string) => s.replace(/\nPASS\n/, "\nPASS 7\n"),
      (s: string) => s.replace("Evidence02", "Evidence01").replace("Evidence02", "Evidence01"),
      (s: string) => s.replace("--- PASS:", "--- FAIL:"),
      (s: string) => s.replace("--- PASS:", "=== PAUSE TestNative\n--- PASS:"),
      (s: string) => s.replace("Evidence02", "Evidence02/subtest"),
      (s: string) => s.replace("    alpha_test.go:8:", "alpha_test.go:8:"),
      (s: string) => s.replace("alpha_test.go:8:", "alpha_test.go:bad:"),
      (s: string) => s.replace("alpha_test.go:8:", "alpha_test.go:0:"),
      (s: string) => s.replace("alpha_test.go:8:", "alpha_test.go:9007199254740993:"),
      (s: string) => s.replace(/\t(?:\d+\.\d+s|\(cached\))\n/, "\t\n"),
      (s: string) => s.replace(/\t(?:\d+\.\d+s|\(cached\))\n/, "\tNaNs\n"),
      (s: string) => s.replace(/\t(?:\d+\.\d+s|\(cached\))\n/, "\t-1.0s\n"),
      (s: string) => s.replace("[no test files]", "[1 test files]"),
      (s: string) => s + "PASS\n", (s: string) => s + s,
    ];
    for (const mutate of mutations) { const changed = mutate(input); assert.notEqual(changed, input); rejected(changed); }
  }
  rejected("?   \texample.com/empty\t[no test files]\n");
  rejected(""); rejected("\n");
});

test("Go binds multiline diagnostics to full test context; same names allowed only across packages", () => {
  const c = entry("cold"), extra = "        second diagnostic line café 🧭\n";
  const input = text(c.original).replace("--- PASS:", extra + "--- PASS:");
  const expected = text(c.expected).replace("--- PASS:", extra + "--- PASS:");
  const anchors = [...c.required.slice(0, 2), { text: extra, occurrence: 0 }, ...c.required.slice(2)];
  accepted(input, expected, anchors);
});

test("DECLARED-EVIDENCE oracle teeth: declaration-only and emit-only forged reductions, every anchor", () => {
  for (const id of ["cold", "cached"]) {
    const c = entry(id), input = text(c.original), expected = text(c.expected);
    const spans = c.required.map(a => locate(input, a));
    const good: Reduction = { pieces: spans, required: spans };
    evidence(input, good, c.required, expected);
    for (let i = 0; i < spans.length; i++) {
      const rest = spans.filter((_, n) => n !== i);
      const declarationOnly: Reduction = { pieces: spans, required: rest };
      assert.equal(declarationOnly.pieces.map(p => input.slice(...p as Span)).join(""), expected);
      assert.throws(() => evidence(input, declarationOnly, c.required, expected), /required declaration missing/);
      // Use mutant's own rendering: emitted coverage must bite independently of golden equality.
      assert.throws(() => evidence(input, { pieces: rest, required: spans }, c.required,
        rest.map(s => input.slice(...s)).join("")), /emitted evidence missing/);
    }
    const wrongOccurrence = c.required.map(a => a.text === "PASS\n" && a.occurrence === 1 ? { ...a, occurrence: 0 } : a);
    const misplaced = wrongOccurrence.map(a => locate(input, a));
    assert.throws(() => evidence(input, { pieces: spans, required: misplaced }, c.required, expected), /required declaration missing/);
    assert.throws(() => evidence(input, { pieces: [{ text: expected }], required: spans }, c.required, expected), /source spans/);
  }
});

test("preservation oracle teeth and guard calibration on old supported native grammar", () => {
  const input = readFileSync(new URL("../fixtures/runners/go_test_success.txt", import.meta.url), "utf8");
  const obs = observation(input, "go test -v");
  assert.ok(goProfile.reduce(input, obs), "positive control: old grammar genuinely reducible");
  for (const changed of [input + "opaque\n", input.replace("TestArithmetic", "TestArithmetic\x00"), input.replace("TestArithmetic", "TestArithmetic\x85")])
    rejected(changed, observation(changed, obs.command));
  for (const delta of [{ termination: { kind: "exited", code: 1 } }, { termination: { kind: "timed_out" } },
    { termination: { kind: "unknown" } }, { completeness: "truncated" }, { completeness: "unknown" }] as const)
    rejected(input, { ...obs, ...delta });
  assert.throws(() => exact(obs), /preserve whole original/);
  const a = entry("cold").original;
  assert.throws(() => bytes({ ...a, sha256: "0".repeat(64) }), /AssertionError/);
});
