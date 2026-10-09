import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, symlink, link } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { readNativeCorpus } from "../scripts/native-corpus.mjs";
import { createHash } from "node:crypto";

async function corpus(t: { after: (fn: () => Promise<void>) => void }) {
  const root = await mkdtemp(path.join(os.tmpdir(), "lean-native-corpus-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const directory = path.join(root, "sample");
  await mkdir(directory);
  await writeFile(path.join(root, "index.json"), JSON.stringify({ schema: "hugr-lean/native-index/1", families: ["sample"] }));
  const manifest = { schema: "hugr-lean/native-cases/1", cases: [{ name: "MOCK/native", family: "mock", command: "mock --original",
    file: "native.txt", expectedFile: "independent.expected.txt", status: "reduced", termination: { kind: "exited", code: 0 },
    completeness: "complete", presentation: "unknown", version: "synthetic-1", platform: "mock",
    provenance: { kind: "synthetic reader-control, not native conformance" } }] };
  await writeFile(path.join(directory, "native.txt"), "noise\nKEEP café 🔥\n");
  await writeFile(path.join(directory, "independent.expected.txt"), "KEEP café 🔥\n");
  const save = () => writeFile(path.join(directory, "cases.json"), JSON.stringify(manifest));
  await save();
  return { root, directory, manifest, save };
}

test("native corpus reader has a nonempty positive control and keeps original argv", async (t) => {
  const c = await corpus(t), entries = await readNativeCorpus(c.root);
  assert.equal(entries.length, 1);
  assert.equal(entries[0]!.expected, "KEEP café 🔥\n");
  assert.equal(entries[0]!.observation.command, "mock --original");
  const item = c.manifest.cases[0]!;
  Object.assign(item, { command: ["node", "/tmp/pnpm.cjs", "install", "--ignore-scripts"] });
  await c.save();
  assert.equal((await readNativeCorpus(c.root))[0]!.observation.command, "node /tmp/pnpm.cjs install --ignore-scripts");
});

test("native corpus reader refuses missing/empty/extra declarations and duplicate names", async (t) => {
  const c = await corpus(t);
  await assert.rejects(readNativeCorpus(path.join(c.root, "missing")));
  const original = c.manifest.cases[0]!;
  c.manifest.cases = [];
  await c.save();
  await assert.rejects(readNativeCorpus(c.root), /empty case list/);
  c.manifest.cases = [original, original];
  await c.save();
  await assert.rejects(readNativeCorpus(c.root), /duplicate\/missing case name/);
  c.manifest.cases = [original];
  await c.save();
  await writeFile(path.join(c.directory, "unlisted.txt"), "native bytes omitted from manifest\n");
  await assert.rejects(readNativeCorpus(c.root), /undeclared native input unlisted.txt/);
});

test("native corpus reader refuses incorrect/empty goldens and incomplete facts", async (t) => {
  const c = await corpus(t), item = c.manifest.cases[0]!;
  await writeFile(path.join(c.directory, "independent.expected.txt"), "");
  await assert.rejects(readNativeCorpus(c.root), /non-smaller independent golden/);
  await writeFile(path.join(c.directory, "independent.expected.txt"), "KEEP café 🔥\n");
  item.status = "passthrough";
  await c.save();
  await assert.rejects(readNativeCorpus(c.root), /passthrough golden changed original/);
  item.status = "reduced";
  item.completeness = "truncated";
  await c.save();
  await assert.rejects(readNativeCorpus(c.root), /uncompleted capture/);
});

test("native corpus reader refuses escaping paths, symlinks and invalid UTF-8", async (t) => {
  const c = await corpus(t), item = c.manifest.cases[0]!;
  item.file = "../outside.txt";
  await c.save();
  await assert.rejects(readNativeCorpus(c.root), /Escaping corpus path/);
  item.file = "linked.txt";
  await symlink(path.join(c.directory, "native.txt"), path.join(c.directory, "linked.txt"));
  await c.save();
  await assert.rejects(readNativeCorpus(c.root), /Non-regular or multiply linked corpus path/);
  item.file = "native.txt";
  await c.save();
  await writeFile(path.join(c.directory, "native.txt"), Buffer.from([0xff]));
  await assert.rejects(readNativeCorpus(c.root), /encoded data was not valid/);
});

test("native corpus refuses removed/extra whole families and hardlinked inputs", async (t) => {
  const c = await corpus(t);
  await writeFile(path.join(c.root, "index.json"), JSON.stringify({ schema: "hugr-lean/native-index/1", families: ["sample", "missing"] }));
  await assert.rejects(readNativeCorpus(c.root), /directory\/index correspondence/);
  await writeFile(path.join(c.root, "index.json"), JSON.stringify({ schema: "hugr-lean/native-index/1", families: ["sample"] }));
  await mkdir(path.join(c.root, "extra"));
  await assert.rejects(readNativeCorpus(c.root), /directory\/index correspondence/);
  await rm(path.join(c.root, "extra"), { recursive: true });
  await link(path.join(c.directory, "native.txt"), path.join(c.directory, "alias.txt"));
  await assert.rejects(readNativeCorpus(c.root), /multiply linked/);
});

test("native corpus preserves EOF-exact JSON strings without a text-file newline", async (t) => {
  const c = await corpus(t);
  await rm(path.join(c.directory, "native.txt"));
  const input = ' [\n  {"message":"café 🔥"}\n]';
  const item = { name: "MOCK/eof", family: "mock", command: "mock --json", output: input,
    expected: '[{"message":"café 🔥"}]', status: "reduced", termination: { kind: "exited", code: 0 },
    completeness: "complete", presentation: "unknown", version: "synthetic-1", platform: "mock",
    provenance: { kind: "synthetic EOF-control, not native conformance", sha256: createHash("sha256").update(input).digest("hex") } };
  const save = () => writeFile(path.join(c.directory, "cases.json"), JSON.stringify({ schema: c.manifest.schema, cases: [item] }));
  await save();
  const [entry] = await readNativeCorpus(c.root);
  assert.equal(entry!.observation.output, input);
  assert.ok(!entry!.observation.output.endsWith("\n"));
  assert.equal(entry!.expected, item.expected);
  item.output += "\n";
  await save();
  await assert.rejects(readNativeCorpus(c.root), /capture hash mismatch/);
});

test("native corpus binds declared local receipt commands, metadata and raw hashes", async (t) => {
  const c = await corpus(t), item = c.manifest.cases[0]!;
  Object.assign(item, { provenance: { receipt: "receipt.json", case: item.name } });
  await c.save();
  await assert.rejects(readNativeCorpus(c.root), /receipt.json/);
  const output = "noise\nKEEP café 🔥\n";
  const fact = { name: item.name, command: item.command, termination: item.termination,
    completeness: item.completeness, presentation: item.presentation, version: item.version,
    boundary: { bytes: Buffer.byteLength(output), sha256: createHash("sha256").update(output).digest("hex") } };
  const save = () => writeFile(path.join(c.directory, "receipt.json"), JSON.stringify({ cases: [fact] }));
  await save();
  assert.equal((await readNativeCorpus(c.root)).length, 1);
  fact.command = "mock --different";
  await save();
  await assert.rejects(readNativeCorpus(c.root), /receipt command mismatch/);
  fact.command = item.command;
  fact.boundary.sha256 = "0".repeat(64);
  await save();
  await assert.rejects(readNativeCorpus(c.root), /receipt hash mismatch/);
});
