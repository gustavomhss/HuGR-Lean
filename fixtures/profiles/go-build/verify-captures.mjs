// Receipt integrity only. Does not execute producer, native tools or HuGR filters.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const receipt = JSON.parse(await readFile(join(root, "native-receipt.json"), "utf8"));
const manifest = JSON.parse(await readFile(join(root, "cases.json"), "utf8"));
const ids = ["build-verbose", "build-all", "build-packages", "build-tag-verbose", "build-tag", "build-target-output", "vet-all", "vet-packages", "vet-tag", "build-error", "vet-error", "explicit-goos-unsupported", "run-quiet", "run-arbitrary", "run-arbitrary-nonzero"];
const raw = new Map();
for (const fact of receipt.cases) {
  for (const stream of ["output", "stdout", "stderr"]) {
    const bound = fact[stream], bytes = await readFile(join(root, bound.file));
    assert.equal(sha(bytes), bound.sha256, `${fact.id}: ${stream} hash`);
    assert.equal(bytes.length, bound.bytes, `${fact.id}: ${stream} length`);
    raw.set(bound.file, bytes);
  }
  assert.equal(fact.output.bytes, fact.stdout.bytes + fact.stderr.bytes);
  assert.equal(fact.command, fact.argv.join(" "));
  assert.equal(sha(Buffer.from(fact.command)), fact.commandSha256);
}
for (const source of receipt.sources) assert.equal(sha(await readFile(join(root, source.file))), source.sha256, source.file);
assert.equal((await readFile(join(root, "captures/go-version.stdout"), "utf8")), "go version go1.27.1 darwin/amd64\n");
assert.equal((await readFile(join(root, "captures/go-target.stdout"), "utf8")), "darwin\namd64\n");
assert.equal((await readFile(join(root, "captures/go-version.stderr"))).length, 0);
assert.equal((await readFile(join(root, "captures/go-target.stderr"))).length, 0);
function validate(candidate, bytes = raw) {
  assert.equal(candidate.schema, "hugr-lean/native-cases/1");
  assert.deepEqual(candidate.cases.map(c => c.name).sort(), ids.map(id => `G04/${id}`).sort());
  for (const entry of candidate.cases) {
    const fact = receipt.cases.find(c => c.id === entry.name.replace("G04/", "G04-"));
    assert.equal(entry.command, fact.command);
    assert.equal(entry.file, fact.output.file);
    assert.equal(entry.status, "passthrough");
    assert.equal(entry.family, "go-build");
    assert.deepEqual(entry.termination, fact.termination);
    assert.equal(entry.completeness, "complete");
    assert.equal(entry.presentation, "unknown");
    assert.equal(entry.version, fact.toolVersion);
    assert.equal(entry.platform, fact.platform);
    assert.equal(entry.provenance.record, "SOURCES.md");
    assert.equal(entry.provenance.capture, `native-receipt.json#${fact.id}`);
    assert.equal(entry.provenance.sha256, sha(bytes.get(entry.file)));
    assert.equal(entry.provenance.sha256, fact.output.sha256);
    assert.equal(entry.expected, undefined);
    assert.equal(entry.expectedFile, undefined);
    if (fact.exactReason.startsWith("no-noise")) assert.equal(bytes.get(entry.file).length, 0);
  }
}
const historicalManifest = { ...manifest, cases: manifest.cases.filter(c => c.name !== "G04/cross-linux-amd64-success") };
validate(historicalManifest);
for (const id of ["build-verbose", "build-tag-verbose"]) {
  assert.deepEqual(raw.get(`captures/${id}.output`).toString().trim().split("\n").sort(), ["example.org/hugr-g04-native/cmd/noisy", "example.org/hugr-g04-native/cmd/quiet", "example.org/hugr-g04-native/lib"]);
}
assert.ok(raw.get("captures/run-arbitrary.stdout").toString().endsWith("stdout tail without LF"));
assert.ok(raw.get("captures/run-arbitrary.stderr").toString().endsWith("stderr tail without LF"));
assert.ok(raw.get("captures/run-arbitrary-nonzero.stderr").toString().endsWith("stderr tail without LFexit status 23\n"));
// Measured negative controls: missing case, rewritten command, altered hash, trimmed stream.
for (const mutate of [
  c => c.cases.pop(),
  c => { c.cases[0].command = "go test -v ./..."; },
  c => { c.cases[0].provenance.sha256 = "0".repeat(64); },
]) {
  const broken = structuredClone(historicalManifest);
  mutate(broken);
  assert.throws(() => validate(broken));
}
const brokenBytes = new Map(raw);
brokenBytes.set("captures/run-arbitrary.output", raw.get("captures/run-arbitrary.output").subarray(1));
assert.throws(() => validate(historicalManifest, brokenBytes));
validate(historicalManifest);
console.log("G04 receipt integrity: 15 exact cases; four corruption probes rejected; originals unchanged.");
