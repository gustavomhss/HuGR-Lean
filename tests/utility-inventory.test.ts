import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstat, mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
// @ts-expect-error Developer-only script, no published declarations.
import { readUtilityCorpus } from "../scripts/utility-corpus.mjs";

type Artifact = { file: string; bytes: number; sha256: string; sourceFile?: string };
type NativeCase = {
  id: string; role: "noise" | "exact"; provenanceRoot: string;
  original: Artifact; stdout: Artifact; stderr: Artifact; expected: Artifact; capture: Artifact;
  fixtureSources: Artifact[]; required: { text: string; occurrence: number }[];
};
type Runtime = Artifact & { kind: string; tool: string; version: string; executable: string };
type Manifest = { cases: NativeCase[]; provenance: { id: string; index: { parts: Artifact[] }; externalRuntimes?: Runtime[] }[] };
const root = fileURLToPath(new URL("../fixtures/utility/", import.meta.url));
const hash = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");
const format = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

// Pinned, byte-exact import from candidate-GtJZlt/corpus, normalizer commit 07aeddc.
// Protected case/source fingerprints were compared against all four parser actors AND
// pre-import base 9e3c87a24dec7a3206f6232938696eccda5cb6dd; no source modifications.
// Node executable is an external fingerprint, not vendored bytes or binary reverification.
// Its recorded v22.17.1 identity binds the original index/source inventory/version capture.
// Runtime reader tests require the lead's 07aeddc/09934e1 reader integration.
// Full old tree retained in Git backup ref and private snapshot with per-file retirement ledger.
// Go's 20 retired extras: 14 duplicate programs/* files, four relocated go-version artifacts,
// producer-source.mjs and source-inventory.json. Node retires prepare-corpus.mjs.
// Reader rejects undeclared extras; receipts keep historical names via sourceFile mappings.
const pins = {
  cargo: { count: 79, all: "389f38f32cfc13ab1ff6d9348ea66c7bd13ea3455a6f9cd06681ede76e311cd4",
    protectedCount: 20, protected: "723cafe96417412f575f8a188b627ec433ae3fad968d449491a7af72310a3a44",
    sourceCount: 12, sources: "8962c561060e1a5e224747d683de96c0ff1dcd68535c33dc373f9428fdbc6890" },
  go: { count: 61, all: "22a0dbc8522bc879961face8b52ad8cfd16d345a620a9713cffea172e0c6b468",
    protectedCount: 25, protected: "973f478c6875be0c918c224eda023b7f8d4850681ecb840f82210e0165ff235c",
    sourceCount: 14, sources: "801ea68fde8ba1f14586e04c87de66afc196ecb6239abf9c525c53a0295c95df" },
  node: { count: 86, all: "c58a42579bdaf6bc6c824cbcddb00e76b2b36eed2015ce39aeb5de67c73f3e30",
    protectedCount: 50, protected: "58eb1cd79c18f1e4ae519fe35f5d2ad027cca5dcc0aba9fdb0a5c724d451e616",
    sourceCount: 10, sources: "c504cfb3098f98f3d9b337f62165fbfc4270364786fa8851a67f859a36a88e3d" },
  pytest: { count: 214, all: "0e8fbcfe28409d53714d388c238d0a40672c9822994b2eb67f03b282f5ce5dff",
    protectedCount: 30, protected: "f09ee867601d09c54d892e2f56f040035e5a1fe2326a6f4b8faee80912204e9c",
    sourceCount: 13, sources: "ea92a64a056a92a9f6982b803fb1439c28f95857b7c91ba7dda19559e04b400e" },
} as const;
const MAX_BLOB_BYTES = 1_000_000;

function smallInventory(files: Map<string, Buffer>): void {
  assert.equal(files.size, 440, "small corpus file count");
  assert.equal([...files.values()].reduce((sum, bytes) => sum + bytes.length, 0), 1_317_834, "small corpus UTF-8/artifact bytes");
  for (const [file, bytes] of files) assert.ok(bytes.length < MAX_BLOB_BYTES, `oversized blob: ${file}`);
  assert.equal(Math.max(...[...files.values()].map(bytes => bytes.length)), 124_418, "largest pinned artifact");
}

// Independent filesystem enumeration and frozen inventory, not a manifest-derived oracle.
async function inventory(directory: string, prefix = ""): Promise<Map<string, Buffer>> {
  const files = new Map<string, Buffer>();
  for (const name of (await readdir(directory)).sort()) {
    const absolute = path.join(directory, name), relative = prefix + name, stat = await lstat(absolute);
    assert.equal(stat.isSymbolicLink(), false, relative);
    if (stat.isDirectory()) {
      for (const [file, bytes] of await inventory(absolute, `${relative}/`)) files.set(file, bytes);
    } else {
      assert.ok(stat.isFile(), relative); assert.equal(stat.nlink, 1, relative);
      files.set(relative, await readFile(absolute));
    }
  }
  return files;
}
function fingerprint(files: Map<string, Buffer>): string {
  return hash(format([...files].sort(([a], [b]) => a.localeCompare(b))
    .map(([file, bytes]) => ({ file, bytes: bytes.length, sha256: hash(bytes) }))));
}
function selected(files: Map<string, Buffer>, refs: Artifact[]): Map<string, Buffer> {
  const result = new Map<string, Buffer>();
  for (const ref of refs) {
    const bytes = files.get(ref.file); assert.ok(bytes, ref.file);
    assert.equal(bytes.length, ref.bytes, ref.file); assert.equal(hash(bytes), ref.sha256, ref.file);
    result.set(ref.file, bytes);
  }
  return result;
}
async function frozen(directory = root): Promise<void> {
  smallInventory(await inventory(directory));
  assert.deepEqual((await readdir(directory)).sort(), Object.keys(pins).sort());
  for (const [family, pin] of Object.entries(pins)) {
    const files = await inventory(path.join(directory, family));
    assert.equal(files.size, pin.count, `${family}: full file count`);
    assert.equal(fingerprint(files), pin.all, `${family}: full byte inventory`);
    const manifest = JSON.parse(files.get("manifest.json")!.toString()) as Manifest;
    const protectedFiles = selected(files, manifest.cases.flatMap(row =>
      [row.original, row.stdout, row.stderr, row.expected, row.capture]));
    assert.equal(protectedFiles.size, pin.protectedCount);
    assert.equal(fingerprint(protectedFiles), pin.protected, `${family}: original/streams/expected/receipt bytes`);
    const sources = selected(files, manifest.cases.flatMap(row => row.fixtureSources));
    assert.equal(sources.size, pin.sourceCount);
    assert.equal(fingerprint(sources), pin.sources, `${family}: fixture source bytes`);
  }
}

test("UTILITY-INVENTORY: all imported files, original captures, goldens and source bytes stay pinned", async () => {
  await frozen();
});

test("UTILITY-INVENTORY size teeth: missing files, byte drift and 1 MB blobs cannot pass", async () => {
  const files = await inventory(root); smallInventory(files);
  const missing = new Map(files); missing.delete("cargo/manifest.json");
  assert.throws(() => smallInventory(missing), /small corpus file count/);
  const extraByte = new Map(files); extraByte.set("cargo/manifest.json", Buffer.concat([files.get("cargo/manifest.json")!, Buffer.from(" ")]));
  assert.throws(() => smallInventory(extraByte), /small corpus UTF-8\/artifact bytes/);
  // Preserve count AND total size so the size ceiling itself, not another assertion, must fire.
  const oversized = new Map(files);
  const names = [...files.keys()]; names.forEach(name => oversized.set(name, Buffer.alloc(0)));
  oversized.set(names[0]!, Buffer.alloc(MAX_BLOB_BYTES));
  oversized.set(names[1]!, Buffer.alloc(317_834));
  assert.throws(() => smallInventory(oversized), /oversized blob/);
});

test("UTILITY-INVENTORY: current fixtures bind 25 cases, 12 noise, 13 exact and six lineage roots", async () => {
  const corpus = await readUtilityCorpus(root);
  assert.equal(corpus.cases.length, 25);
  assert.equal(corpus.cases.filter((row: NativeCase) => row.role === "noise").length, 12);
  assert.equal(corpus.cases.filter((row: NativeCase) => row.role === "exact").length, 13);
  assert.deepEqual(corpus.families.flatMap((family: Manifest) => family.provenance.map(entry => entry.id)).sort(),
    ["cargo-AAzRUV", "remaining-Ak3JfQ", "go-zHh7jh", "node-m78clV", "prep-fHWQpI", "extra-r2b4ph"].sort());
});

test("UTILITY-INVENTORY: repaired Cargo substring ordinal and pytest whole anchors preserve stronger evidence", async () => {
  const corpus = await readUtilityCorpus(root);
  const warning = corpus.cases.find((row: { qualifiedID: string }) => row.qualifiedID === "cargo/warning");
  assert.ok(warning);
  // Substring matching counts the caret row's leading '  |' as occurrence 1.
  assert.deepEqual(warning.required.filter((anchor: { text: string }) => anchor.text === "  |")
    .map((anchor: { occurrence: number }) => anchor.occurrence), [0, 2]);
  for (const id of ["assertion-failure", "opaque-summary"]) {
    const row = corpus.cases.find((row: { qualifiedID: string }) => row.qualifiedID === `pytest/${id}`);
    assert.ok(row); assert.equal(row.role, "exact"); assert.equal(row.originalText, row.expectedText);
    assert.equal(row.required.length, 1); assert.equal(row.required[0].text, row.originalText);
    assert.equal(row.required[0].occurrence, 0);
    assert.deepEqual(row.required[0].sourceSpan, [0, row.originalText.length]);
  }
});

test("UTILITY-INVENTORY teeth: byte rewrites, extras, missing lineage and weakened anchors fail; restore passes", async (t) => {
  const scratch = await mkdtemp(path.join(os.tmpdir(), "hugr-utility-inventory-"));
  t.after(() => rm(scratch, { recursive: true, force: true }));
  for (const [file, bytes] of await inventory(root)) {
    await mkdir(path.dirname(path.join(scratch, file)), { recursive: true });
    await writeFile(path.join(scratch, file), bytes, { flag: "wx" });
  }
  await frozen(scratch); await readUtilityCorpus(scratch);
  for (const file of ["cargo/full/original.log", "go/captures/cold/receipt.json",
    "node/captures/node-flat-default/output.expected.log", "pytest/prep-fHWQpI/projects/noise/test_native.py"]) {
    const absolute = path.join(scratch, file), before = await readFile(absolute);
    const changed = Buffer.from(before); changed[0] = changed[0]! ^ 1;
    assert.notEqual(hash(changed), hash(before), "mutation applied");
    try {
      await writeFile(absolute, changed);
      await assert.rejects(frozen(scratch), /full byte inventory/);
      await assert.rejects(readUtilityCorpus(scratch), /ARTIFACT_DIGEST_MISMATCH/);
    } finally { await writeFile(absolute, before); }
  }
  const extra = path.join(scratch, "go/unmapped.log");
  try {
    await writeFile(extra, "unknown user evidence\n", { flag: "wx" });
    await assert.rejects(readUtilityCorpus(scratch), /UNMAPPED_ARTIFACT/);
    await assert.rejects(frozen(scratch), /small corpus file count/);
  } finally { await rm(extra); }
  for (const family of ["cargo", "go", "pytest"]) {
    const absolute = path.join(scratch, family, "manifest.json"), before = await readFile(absolute);
    const manifest = JSON.parse(before.toString()) as Manifest;
    if (family === "cargo") manifest.cases.find(row => row.id === "warning")!.required[6]!.occurrence = 1;
    else if (family === "pytest") manifest.cases.find(row => row.id === "assertion-failure")!.required = [];
    else manifest.provenance[0]!.index.parts[0]!.file = "provenance/missing-index.json";
    try {
      await writeFile(absolute, format(manifest));
      await assert.rejects(readUtilityCorpus(scratch), family === "cargo" ? /DUPLICATE_OR_UNORDERED_ANCHOR/
        : family === "pytest" ? /EMPTY_OR_INVALID_LIST/ : /MISSING_ARTIFACT/);
    } finally { await writeFile(absolute, before); }
  }
  await frozen(scratch); await readUtilityCorpus(scratch); await frozen();
});

test("UTILITY-INVENTORY runtime teeth: wrong runtime and external fixture-source bypass fail in actual reader", async (t) => {
  const scratch = await mkdtemp(path.join(os.tmpdir(), "hugr-utility-runtime-"));
  t.after(() => rm(scratch, { recursive: true, force: true }));
  for (const [file, bytes] of await inventory(root)) {
    await mkdir(path.dirname(path.join(scratch, file)), { recursive: true });
    await writeFile(path.join(scratch, file), bytes, { flag: "wx" });
  }
  await readUtilityCorpus(scratch); // Positive control: base reader without externalRuntimes must fail here.
  const absolute = path.join(scratch, "node/manifest.json"), before = await readFile(absolute);
  const pristine = JSON.parse(before.toString()) as Manifest;
  const runtime = pristine.provenance[0]!.externalRuntimes![0]!;
  assert.deepEqual(runtime, { file: "native-node-executable", sha256: "7ede1e8c98a2b2bb5965aff3c070ede061fc9e2a6a0b16774646487f94fe4541",
    bytes: 224_341_744, kind: "tool-executable", tool: "node", version: "v22.17.1", executable: "/usr/local/bin/node" });
  for (const [patch, error] of [
    [{ version: "v24.0.0" }, /EXTERNAL_RUNTIME_NOT_ALLOWED/],
    [{ tool: "tsx" }, /EXTERNAL_RUNTIME_NOT_ALLOWED/],
    [{ file: "sources/flat/fixture.mjs" }, /EXTERNAL_RUNTIME_NOT_ALLOWED/],
    [{ sha256: "0".repeat(64) }, /EXTERNAL_RUNTIME_FINGERPRINT_MISMATCH/],
    [{ bytes: runtime.bytes - 1 }, /EXTERNAL_RUNTIME_FINGERPRINT_MISMATCH/],
    [{ executable: "/wrong/node" }, /EXTERNAL_RUNTIME_FINGERPRINT_MISMATCH/],
  ] as const) {
    const changed = structuredClone(pristine);
    Object.assign(changed.provenance[0]!.externalRuntimes![0]!, patch);
    try {
      await writeFile(absolute, format(changed));
      await assert.rejects(readUtilityCorpus(scratch), error);
    } finally { await writeFile(absolute, before); }
  }
  const missing = structuredClone(pristine); missing.provenance[0]!.externalRuntimes = [];
  try {
    await writeFile(absolute, format(missing));
    await assert.rejects(readUtilityCorpus(scratch), /UNBOUND_SOURCE_RECORD/);
  } finally { await writeFile(absolute, before); }
  await readUtilityCorpus(scratch); await frozen(scratch); await frozen();
});
