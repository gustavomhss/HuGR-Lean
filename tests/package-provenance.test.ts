import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const smoke = await import(new URL("../scripts/package-smoke.mjs", import.meta.url).href);

test("artifact snapshot includes nested native provenance without copying raw or config", async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), "hugr-note-proof-"));
  try {
    const root = path.join(temporary, "source"), snapshot = path.join(temporary, "snapshot");
    const notes = ["fixtures/profiles/native/SOURCES.md", "fixtures/profiles/native/nested/SOURCES.md"];
    await mkdir(root);
    await writeFile(path.join(root, "package.json"), JSON.stringify({ name: "note-proof", version: "1.0.0",
      files: ["fixtures/**/SOURCES.md"] }));
    for (const name of notes) {
      await mkdir(path.dirname(path.join(root, name)), { recursive: true });
      await writeFile(path.join(root, name), `${name}: immutable source café\n`);
    }
    await writeFile(path.join(root, ".npmrc"), "registry=https://must-not-copy.invalid\n");
    await writeFile(path.join(root, "fixtures/profiles/native/input.txt"), "raw fixture must stay outside artifact\n");
    await writeFile(path.join(root, "fixtures/profiles/native/private.js"), "throw new Error('not artifact');\n");
    const captured = await smoke.snapshotArtifact(root, snapshot);
    assert.deepEqual(captured, notes);
    for (const name of notes) assert.equal(await readFile(path.join(snapshot, name), "utf8"), await readFile(path.join(root, name), "utf8"));
    assert.deepEqual((await readdir(snapshot)).sort(), ["fixtures", "package.json"]);
    assert.deepEqual((await readdir(path.join(snapshot, "fixtures/profiles/native"))).sort(), ["SOURCES.md", "nested"]);
    const packed = await smoke.npmProcess(["pack", "--json", "--ignore-scripts"], { cwd: snapshot, isolation: temporary, timeout: 30000 });
    const files = JSON.parse(packed.stdout)[0].files.map((entry: { path: string }) => entry.path).sort();
    assert.deepEqual(files, [...notes, "package.json"].sort());
  } finally { await rm(temporary, { recursive: true, force: true }); }
});

test("artifact snapshot covers every real native source note", async () => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const temporary = await mkdtemp(path.join(tmpdir(), "hugr-real-note-proof-"));
  try {
    const snapshot = path.join(temporary, "snapshot");
    const notes: string[] = await smoke.snapshotArtifact(root, snapshot);
    for (const required of ["fixtures/runners/SOURCES.md", "fixtures/profiles/pylint/SOURCES.md",
      "fixtures/profiles/cargo-doc/actions-20261009/SOURCES.md"]) assert.ok(notes.includes(required), required);
    for (const name of notes) assert.equal(await readFile(path.join(snapshot, name), "utf8"), await readFile(path.join(root, name), "utf8"), name);
  } finally { await rm(temporary, { recursive: true, force: true }); }
});
