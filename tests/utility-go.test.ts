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
type NativeSource = Artifact & { originalSource: Artifact; license: string; origin: string };
type Tool = { name: string; version: string; executable: string; receipt?: Artifact };
type NativeReceipt = {
  command: string; exitCode: number | null; signal: string | null; timedOut: boolean;
  complete: boolean; nativeSpawned: boolean; nativeExitObserved: boolean; baseline: string;
  tools: Tool[]; fixtureSources: NativeSource[];
  producer: { script: string; sourceSHA256: string; snapshot: Artifact };
  original: Artifact; stdout: Artifact; stderr: Artifact;
  errors: { launch: unknown; encoding: unknown; cleanup: unknown[]; preparation: unknown };
  captureDefinition: string;
};
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
const sourceInventory: Artifact = { file: "source-inventory.json", bytes: 5613,
  sha256: "0ed2d81daa636d2316c067d35bd5b460e760e3f4900baa0c7f83c2926264e3e8" };
const versionReceipt: Artifact = { file: "captures/go-version/receipt.json", bytes: 4719,
  sha256: "6bc3a72ff972538edeb0844aea1d0d3e60e4490b65c24d32e76d0ab95d61bba7" };
const producerSnapshot: Artifact = { file: "producer-source.mjs", bytes: 15666,
  sha256: "6baace859cc099780cce0b561f96c6f7af310f9e739378813846894fca53ecfc" };
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
type ReadArtifact = (file: string) => Buffer;
const readArtifact: ReadArtifact = file => readFileSync(new URL(file, root));
function bytes(a: Artifact, read = readArtifact): Buffer {
  assert.match(a.file, /^(?:[\w.-]+\/)*[\w.-]+$/);
  assert.ok(!a.file.split("/").includes(".."), "artifact traversal");
  const b = read(a.file);
  assert.equal(b.length, a.bytes, a.file);
  assert.equal(sha(b), a.sha256, a.file);
  assert.deepEqual(Buffer.from(b.toString("utf8")), b, "UTF-8 roundtrip");
  return b;
}
const text = (a: Artifact, read = readArtifact) => bytes(a, read).toString("utf8");
function entry(id: string): Case {
  const found = manifest.cases.find(c => c.id === id);
  assert.ok(found, `missing native case ${id}`);
  return found;
}
function pinFacts(facts: NativeReceipt, exitCode: number): void {
  assert.equal(facts.exitCode, exitCode, "captured exitCode");
  assert.equal(facts.complete, true, "captured complete");
  assert.equal(facts.nativeSpawned, true, "captured nativeSpawned");
  assert.equal(facts.nativeExitObserved, true, "captured nativeExitObserved");
  assert.equal(facts.signal, null, "captured signal");
  assert.equal(facts.timedOut, false, "captured timedOut");
}
function versionEvidence(version: NativeReceipt, go: Tool, read = readArtifact): void {
  pinFacts(version, 0); assert.equal(version.command, "go version");
  assert.equal(text(version.original, read), `${go.version}\n`, "captured Go version value");
  assert.deepEqual(bytes(version.original, read), bytes(version.stdout, read));
  assert.equal(bytes(version.stderr, read).length, 0);
}
function validatedReceipt(c: Case, read = readArtifact, inventoryArtifact = sourceInventory): NativeReceipt {
  const receipt = JSON.parse(text(c.capture, read)) as NativeReceipt;
  const roles = { cold: "noise", cached: "noise", failure: "exact", diagnostic: "exact", opaque: "exact" } as const;
  assert.ok(Object.hasOwn(roles, c.id), "native case identity");
  assert.equal(c.role, roles[c.id as keyof typeof roles], "captured role");
  const exit = c.id === "failure" ? 1 : 0;
  pinFacts(receipt, exit);
  for (const key of ["command", "exitCode", "complete", "signal", "timedOut"] as const) assert.equal(c[key], receipt[key], key);
  assert.equal(receipt.command, "go test -v ./...");
  assert.equal(receipt.baseline, "882585e5f916821a482d14bc7bfe7d6a102b772a");
  assert.deepEqual(receipt.producer.snapshot, producerSnapshot, "producer snapshot identity");
  bytes(receipt.producer.snapshot, read);
  assert.equal(receipt.producer.sourceSHA256, producerSnapshot.sha256);
  assert.equal(receipt.producer.script, "scripts/utility-native-go.mjs");
  assert.deepEqual(receipt.tools.map(({ name, version, executable }) => ({ name, version, executable })), manifest.tools);
  const go = receipt.tools.find(t => t.name === "go");
  assert.ok(go?.receipt, "Go version receipt required");
  assert.deepEqual(go.receipt, versionReceipt, "Go version receipt identity");
  const version = JSON.parse(text(go.receipt, read)) as NativeReceipt;
  versionEvidence(version, go, read);
  assert.equal(version.baseline, receipt.baseline);
  assert.deepEqual(version.producer.snapshot, producerSnapshot);
  assert.equal(go.executable, "/usr/local/Cellar/go/1.27.1/libexec/bin/go");
  assert.deepEqual(inventoryArtifact, sourceInventory, "native source inventory identity");
  const sources = JSON.parse(text(inventoryArtifact, read)) as NativeSource[];
  const project = c.role === "noise" ? "noise" : c.id;
  const saved = sources.filter(s => s.file.startsWith(`fixture-programs/${project}/`));
  assert.ok(saved.length > 0, "native source inventory nonempty");
  assert.deepEqual(receipt.fixtureSources, saved, "native source inventory binding");
  assert.equal(c.fixtureSources.length, saved.length);
  for (const source of saved) {
    assert.equal(source.origin, "original; no donor", "native source origin");
    assert.equal(source.license, "MIT", "native source license");
    assert.equal(source.originalSource.file, source.file.replace(/^fixture-programs\//, "programs/"), "executed source name");
    assert.equal(source.originalSource.sha256, source.sha256); assert.equal(source.originalSource.bytes, source.bytes);
    assert.deepEqual(bytes(source.originalSource, read), bytes(source, read), "executed/copied source bytes");
    const stored = c.fixtureSources.find(s => (s.sourceFile ?? s.file) === source.file);
    assert.ok(stored, `unbound source name ${source.file}`);
    assert.equal(stored.sha256, source.sha256); assert.equal(stored.bytes, source.bytes);
    assert.deepEqual(bytes(stored, read), bytes(source, read));
  }
  return receipt;
}
function nativeObservation(c: Case, output = text(c.original)): Observation {
  const facts = validatedReceipt(c);
  return { source: "shell", command: facts.command, output,
    termination: facts.timedOut ? { kind: "timed_out" } : facts.nativeExitObserved && facts.exitCode !== null && facts.signal === null
      ? { kind: "exited", code: facts.exitCode } : { kind: "unknown" },
    completeness: facts.complete ? "complete" : "unknown", presentation: "unknown" };
}
function observation(output: string, command = "go test -v ./..."): Observation {
  return { ...nativeObservation(entry("cold"), output), command };
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
function accepted(input: string, expected: string, anchors: readonly Anchor[], command = "go test -v ./...", obs = observation(input, command)): void {
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
function positive(c: Case): void {
  accepted(text(c.original), text(c.expected), c.required, c.command, nativeObservation(c));
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
  const inventory = new Set<string>(["manifest.json", "SOURCES.md", producerSnapshot.file, sourceInventory.file, versionReceipt.file]);
  const version = JSON.parse(text(versionReceipt)) as NativeReceipt;
  for (const a of [version.original, version.stdout, version.stderr]) { bytes(a); inventory.add(a.file); }
  for (const c of manifest.cases) {
    const receipt = validatedReceipt(c);
    assert.equal(receipt.producer.sourceSHA256, manifest.producer.sourceSHA256);
    assert.equal(receipt.producer.script, manifest.producer.script);
    assert.deepEqual(receipt.errors, { launch: null, encoding: null, cleanup: [], preparation: null });
    assert.equal(receipt.captureDefinition, "stdout/stderr arrival order; no text rewriting");
    assert.equal(c.profile, "go-test-verbose"); assert.equal(c.command, "go test -v ./...");
    assert.equal(c.original.bytes, c.stdout.bytes + c.stderr.bytes);
    const original = text(c.original), expected = text(c.expected);
    for (const key of ["original", "stdout", "stderr"] as const) assert.deepEqual(receipt[key], c[key]);
    for (const source of c.fixtureSources) inventory.add(source.file);
    for (const source of receipt.fixtureSources) { inventory.add(source.file); inventory.add(source.originalSource.file); }
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
    positive(entry(id));
  });
  test(`${label}: CRLF, unterminated final row, Unicode UTF-16 spans and UTF-8 metrics`, () => {
    const c = entry(id), input = text(c.original), expected = text(c.expected);
    const acceptVariant = (output: string, golden: string, anchors: Anchor[]) => accepted(output, golden, anchors, c.command, nativeObservation(c, output));
    acceptVariant(input.replaceAll("\n", "\r\n"), expected.replaceAll("\n", "\r\n"), c.required.map(a => ({ ...a, text: a.text.replaceAll("\n", "\r\n") })));
    acceptVariant(input.slice(0, -1), expected.slice(0, -1), c.required.map((a, i) => i === c.required.length - 1 ? { ...a, text: a.text.slice(0, -1) } : a));
    const changed = (s: string) => s.replaceAll("TestNativePackageEvidence01", "Test𐐀Café01");
    assert.equal("𐐀".length, 2); assert.equal(Buffer.byteLength("𐐀"), 4);
    acceptVariant(changed(input), changed(expected), c.required.map(a => ({ ...a, text: changed(a.text) })));
  });
  test(`${label}: nonzero, timeout, truncation, unknown facts and non-shell refuse`, () => {
    const c = entry(id);
    positive(c);
    const input = text(c.original), base = nativeObservation(c);
    for (const delta of [
      { termination: { kind: "exited", code: 1 } }, { termination: { kind: "exited", code: 7 } },
      { termination: { kind: "timed_out" } }, { termination: { kind: "unknown" } },
      { completeness: "truncated" }, { completeness: "unknown" }, { source: "other" },
    ] as const) rejected(input, { ...base, ...delta });
  });
  test(`${label}: unknown rows and C0/C1 at every physical boundary refuse`, () => {
    const c = entry(id);
    positive(c);
    const input = text(c.original), base = nativeObservation(c);
    const refuse = (output: string) => rejected(output, { ...base, output });
    const offsets = [0, ...[...input.matchAll(/\n/g)].map(m => m.index + 1)];
    for (const offset of offsets) for (const row of ["opaque café 🧭\n", "PASS user log\n", "    free-floating continuation\n"])
      refuse(input.slice(0, offset) + row + input.slice(offset));
    for (const code of [...Array.from({ length: 32 }, (_, i) => i), ...Array.from({ length: 33 }, (_, i) => i + 127)]) {
      if (code === 9 || code === 10 || code === 13) continue;
      refuse(input.replace("HUGR_GO_CRITICAL_SENTINEL", `HUGR_${String.fromCharCode(code)}GO_CRITICAL_SENTINEL`));
    }
    refuse(input.replace("café", "ca\rfé"));
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
  const c = entry(id), base = nativeObservation(c), input = base.output;
  exact(base);
  const incorrectZero: Observation = { ...base, termination: { kind: "exited", code: 0 } };
  exact(incorrectZero);
  if (id !== "diagnostic") assert.equal(goProfile.reduce(input, incorrectZero), undefined);
  const destructive: Profile = { id: "go-test-verbose", match: () => true,
    reduce: () => ({ pieces: [[0, 1]], required: [[0, 1]] }) };
  assert.throws(() => exact(incorrectZero, [destructive]), /preserve whole original/,
    "native exact oracle must catch destructive reduction even under incorrect exit0");
});

test("Go rejects malformed package/duration/count/log, missing cache and within-package duplicate names", () => {
  for (const id of ["cold", "cached"]) {
    const c = entry(id);
    positive(c);
    const base = nativeObservation(c), input = base.output;
    const mutations = [
      (s: string) => s.replace("/beta\t", "/alpha\t"),
      (s: string) => s.replace("/empty\t", "/alpha\t"),
      (s: string) => s.replace("/alpha\t", "/bad package\t"),
      (s: string) => s.replace(/^ok[^\n]*\n/m, ""),
      (s: string) => s.replace(/\nPASS\n/, "\n"),
      (s: string) => s.replace(/\nPASS\n/, "\nPASS 7\n"),
      (s: string) => s.replace("Evidence02", "Evidence01").replace("Evidence02", "Evidence01"),
      (s: string) => s.replace("--- PASS:", "--- FAIL:"),
      (s: string) => s.replace(/--- PASS: Test[^ ]+/, "--- PASS: TestMismatchedResult"),
      (s: string) => s.replace(/^=== RUN   Test[^\n]+/, "=== RUN   TestMismatchedRun"),
      (s: string) => s.replace("(0.00s)", "(NaNs)"),
      (s: string) => s.replace("(0.00s)", "(-1.00s)"),
      (s: string) => s.replace("(0.00s)", "(0.00)"),
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
    for (const mutate of mutations) { const changed = mutate(input); assert.notEqual(changed, input); rejected(changed, { ...base, output: changed }); }
  }
  rejected("?   \texample.com/empty\t[no test files]\n");
  rejected(""); rejected("\n");
});

test("Go binds multiline diagnostics to full test context; same names allowed only across packages", () => {
  const c = entry("cold"), extra = "        second diagnostic line café 🧭\n";
  const input = text(c.original).replace("--- PASS:", extra + "--- PASS:");
  const expected = text(c.expected).replace("--- PASS:", extra + "--- PASS:");
  const anchors = [...c.required.slice(0, 2), { text: extra, occurrence: 0 }, ...c.required.slice(2)];
  accepted(input, expected, anchors, c.command, nativeObservation(c, input));
});

function forgedCapture(c: Case, mutate: (copy: Case, receipt: NativeReceipt) => void): { copy: Case; read: ReadArtifact } {
  const copy = structuredClone(c), receipt = JSON.parse(text(c.capture)) as NativeReceipt;
  mutate(copy, receipt);
  const b = Buffer.from(JSON.stringify(receipt));
  copy.capture = { file: c.capture.file, bytes: b.length, sha256: sha(b) };
  return { copy, read: file => file === c.capture.file ? b : readArtifact(file) };
}
test("native facts teeth: jointly forged receipt/manifest facts refuse despite matching valid SHA", () => {
  const invalid = [
    [{ exitCode: 1 }, /captured exitCode/], [{ complete: false }, /captured complete/],
    [{ nativeSpawned: false }, /captured nativeSpawned/], [{ nativeExitObserved: false }, /captured nativeExitObserved/],
    [{ signal: "SIGTERM" }, /captured signal/], [{ timedOut: true }, /captured timedOut/],
  ] as const;
  for (const id of ["cold", "cached"]) {
    const c = entry(id);
    validatedReceipt(c);
    for (const [delta, error] of invalid) {
      const { copy, read } = forgedCapture(c, (copy, receipt) => { Object.assign(copy, delta); Object.assign(receipt, delta); });
      bytes(copy.capture, read); // Self-consistent hash is insufficient; immutable role facts must bite.
      assert.throws(() => validatedReceipt(copy, read), error);
    }
  }
  const failure = entry("failure");
  assert.deepEqual(nativeObservation(failure).termination, { kind: "exited", code: 1 });
  assert.equal(validatedReceipt(failure).exitCode, 1);
  const { copy, read } = forgedCapture(failure, (c, r) => { c.exitCode = 0; r.exitCode = 0; });
  bytes(copy.capture, read);
  assert.throws(() => validatedReceipt(copy, read), /captured exitCode/);
});
test("provenance teeth: valid-SHA wrong snapshot, tool receipt/value, source inventory/origin/executed name", () => {
  const c = entry("cold");
  validatedReceipt(c);
  const mutations: [((c: Case, r: NativeReceipt) => void), RegExp][] = [
    [(_, r) => { r.producer.snapshot = { ...c.original }; }, /producer snapshot identity/],
    [(_, r) => { r.tools.find(t => t.name === "go")!.receipt = { ...sourceInventory }; }, /Go version receipt identity/],
    [(_, r) => { r.tools.find(t => t.name === "go")!.version = "go version go9.99.9 darwin/amd64"; }, /AssertionError/],
    [(_, r) => { r.fixtureSources[0]!.origin = "unbound donor"; }, /native source inventory binding/],
    [(_, r) => { r.fixtureSources[0]!.originalSource.file = "programs/failure/go.mod"; }, /native source inventory binding/],
    [(_, r) => { r.fixtureSources[0]!.originalSource = { ...c.original }; }, /native source inventory binding/],
  ];
  for (const [mutate, error] of mutations) {
    const { copy, read } = forgedCapture(c, mutate);
    bytes(copy.capture, read);
    const forged = JSON.parse(text(copy.capture, read)) as NativeReceipt;
    bytes(forged.producer.snapshot, read); bytes(forged.tools.find(t => t.name === "go")!.receipt!, read);
    assert.throws(() => validatedReceipt(copy, read), error);
  }
  bytes(c.original); // Actual wrong artifact has valid SHA/bytes, not malformed digest syntax.
  assert.throws(() => validatedReceipt(c, readArtifact, c.original), /native source inventory identity/);
  const saved = JSON.parse(text(sourceInventory)) as NativeSource[];
  saved[0]!.originalSource.file = "programs/failure/go.mod";
  const b = Buffer.from(JSON.stringify(saved)), wrong = { ...sourceInventory, bytes: b.length, sha256: sha(b) };
  const read: ReadArtifact = file => file === wrong.file ? b : readArtifact(file);
  bytes(wrong, read);
  assert.throws(() => validatedReceipt(c, read, wrong), /native source inventory identity/);
  const version = JSON.parse(text(versionReceipt)) as NativeReceipt;
  const go = validatedReceipt(c).tools.find(t => t.name === "go")!;
  versionEvidence(version, go);
  const badVersion = Buffer.from("go version go9.99.9 darwin/amd64\n");
  version.original = { ...version.original, bytes: badVersion.length, sha256: sha(badVersion) };
  version.stdout = { ...version.stdout, bytes: badVersion.length, sha256: sha(badVersion) };
  const wrongVersion: ReadArtifact = file => file === version.original.file || file === version.stdout.file ? badVersion : readArtifact(file);
  bytes(version.original, wrongVersion); bytes(version.stdout, wrongVersion);
  assert.throws(() => versionEvidence(version, go, wrongVersion), /captured Go version value/);
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
