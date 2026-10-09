/** Developer-only delta corpus wiring; native provenance remains in family capture receipts. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";

const utf8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
const text = (value) => typeof value === "string" && value.length > 0;

async function regular(directory, name) {
  assert.ok(text(name) && !path.isAbsolute(name) && !name.includes("\\"), `Invalid corpus path: ${name}`);
  const components = name.split("/");
  assert.ok(components.every((part) => part && part !== "." && part !== ".."), `Escaping corpus path: ${name}`);
  let current = directory;
  for (let i = 0; i < components.length; i++) {
    current = path.join(current, components[i]);
    const facts = await lstat(current);
    assert.ok(i === components.length - 1 ? facts.isFile() && facts.nlink === 1 : facts.isDirectory(), `Non-regular or multiply linked corpus path: ${name}`);
  }
  return readFile(current);
}

function command(value) {
  if (text(value)) return value;
  assert.ok(Array.isArray(value) && value.length && value.every((word) => typeof word === "string"), "Missing native argv");
  // Literal display of the original argv; never replace a Node launcher with its script's tool name.
  return value.map((word) => /^[A-Za-z0-9_./:+,=-]+$/.test(word) ? word : JSON.stringify(word)).join(" ");
}

/** Each directory is explicitly declared by its cases.json; missing/empty/extra family data fails. */
export async function readNativeCorpus(root) {
  assert.ok((await lstat(root)).isDirectory(), `Missing native corpus root: ${root}`);
  const index = JSON.parse(utf8.decode(await regular(root, "index.json")));
  assert.equal(index.schema, "hugr-lean/native-index/1", "Invalid native corpus index");
  assert.ok(Array.isArray(index.families) && index.families.length && index.families.every(name => text(name) && /^[a-z][a-z0-9-]*$/.test(name)), "Empty/invalid native family index");
  assert.equal(new Set(index.families).size, index.families.length, "Duplicate native family declaration");
  const entries = await readdir(root, { withFileTypes: true });
  assert.deepEqual(entries.map(entry => entry.name).sort(), ["index.json", ...index.families].sort(), "Native directory/index correspondence differs");
  const families = entries.filter(entry => entry.name !== "index.json");
  const cases = [], names = new Set();
  for (const family of families.sort((left, right) => left.name.localeCompare(right.name))) {
    assert.ok(family.isDirectory(), `Unexpected native corpus entry: ${family.name}`);
    const directory = path.join(root, family.name);
    const manifest = JSON.parse(utf8.decode(await regular(directory, "cases.json")));
    assert.equal(manifest.schema, "hugr-lean/native-cases/1", `${family.name}: invalid schema`);
    assert.ok(Array.isArray(manifest.cases) && manifest.cases.length, `${family.name}: empty case list`);
    const archives = manifest.archives ?? [];
    assert.ok(Array.isArray(archives) && archives.every(text) && new Set(archives).size === archives.length, `${family.name}: invalid archive declarations`);
    for (const archive of archives) assert.ok((await regular(directory, archive)).length, `${family.name}: empty archive ${archive}`);
    const inputs = new Set();
    const expectedFiles = new Set();
    for (const entry of manifest.cases) {
      assert.ok(entry && typeof entry === "object" && !Array.isArray(entry), `${family.name}: invalid case object`);
      const label = `${family.name}/${entry.name}`;
      assert.ok(text(entry.name) && !names.has(entry.name), `${label}: duplicate/missing case name`);
      names.add(entry.name);
      assert.ok(text(entry.family) && text(entry.version) && text(entry.platform), `${label}: missing native facts`);
      assert.ok(entry.provenance && typeof entry.provenance === "object" && !Array.isArray(entry.provenance) && Object.keys(entry.provenance).length, `${label}: missing provenance`);
      assert.ok(entry.status === "reduced" || entry.status === "passthrough", `${label}: unresolved disposition`);
      assert.ok(entry.termination?.kind === "exited" && Number.isSafeInteger(entry.termination.code) && entry.termination.code >= 0, `${label}: missing termination`);
      assert.equal(entry.completeness, "complete", `${label}: uncompleted capture`);
      assert.equal(entry.presentation, "unknown", `${label}: undeclared presentation scope`);
      let raw;
      if (entry.file !== undefined) {
        assert.equal(entry.output, undefined, `${label}: ambiguous native input`);
        if (inputs.has(entry.file)) assert.match(entry.provenance.sha256 ?? "", /^[a-f0-9]{64}$/, `${label}: reused input needs capture hash`);
        inputs.add(entry.file);
        raw = await regular(directory, entry.file);
      } else {
        assert.equal(typeof entry.output, "string", `${label}: missing inline native bytes`);
        assert.match(entry.provenance.sha256 ?? "", /^[a-f0-9]{64}$/, `${label}: inline input needs capture hash`);
        raw = Buffer.from(entry.output, "utf8");
        assert.equal(utf8.decode(raw), entry.output, `${label}: inline input is not lossless UTF-8`);
      }
      const output = utf8.decode(raw);
      const ref = entry.provenance.receipt ?? entry.provenance.record ?? entry.provenance.capture ?? entry.provenance.producer;
      const synthetic = typeof entry.provenance.kind === "string" && entry.provenance.kind.startsWith("synthetic");
      if (!synthetic) {
        assert.ok(text(ref), `${label}: missing local provenance reference`);
        const note = await regular(directory, ref.split("#", 1)[0]);
        assert.ok(note.length, `${label}: empty provenance reference`);
        if (entry.provenance.receipt !== undefined) {
          const receipt = JSON.parse(utf8.decode(note));
          assert.ok(Array.isArray(receipt.cases) && receipt.cases.length, `${label}: missing receipt cases`);
          const bound = receipt.cases.filter(item => item.name === entry.provenance.case);
          assert.equal(bound.length, 1, `${label}: missing/duplicate receipt case`);
          const fact = bound[0];
          assert.equal(command(fact.command), command(entry.command), `${label}: receipt command mismatch`);
          assert.deepEqual(fact.termination, entry.termination, `${label}: receipt termination mismatch`);
          assert.equal(fact.completeness, entry.completeness, `${label}: receipt completeness mismatch`);
          assert.equal(fact.presentation, entry.presentation, `${label}: receipt presentation mismatch`);
          assert.equal(fact.version, entry.version, `${label}: receipt version mismatch`);
          assert.equal(fact.boundary?.bytes, raw.length, `${label}: receipt bytes mismatch`);
          assert.equal(fact.boundary?.sha256, createHash("sha256").update(raw).digest("hex"), `${label}: receipt hash mismatch`);
        }
      }
      if (entry.provenance.sha256 !== undefined) {
        assert.equal(createHash("sha256").update(raw).digest("hex"), entry.provenance.sha256, `${label}: capture hash mismatch`);
      }
      assert.ok(entry.expectedFile === undefined || entry.expected === undefined, `${label}: ambiguous independent golden`);
      const expected = entry.expectedFile === undefined ? (entry.expected ?? output) : utf8.decode(await regular(directory, entry.expectedFile));
      if (entry.expectedFile !== undefined) expectedFiles.add(entry.expectedFile);
      assert.equal(typeof expected, "string", `${label}: invalid independent golden`);
      if (entry.status === "reduced") {
        assert.equal(entry.termination.code, 0, `${label}: failed reduction`);
        assert.ok((text(entry.expectedFile) || typeof entry.expected === "string") && Buffer.byteLength(expected) > 0 && Buffer.byteLength(expected) < raw.length,
          `${label}: missing/non-smaller independent golden`);
      } else assert.equal(expected, output, `${label}: passthrough golden changed original`);
      cases.push({ name: `native/${entry.name}`, family: entry.family, status: entry.status, expected,
        provenance: `native ${entry.version}; ${entry.platform}; ${family.name}/cases.json`,
        observation: { source: "shell", command: command(entry.command), output, termination: entry.termination,
          completeness: entry.completeness, presentation: entry.presentation } });
    }
    // Native inputs may be nested; historical expected proposals are not current input observations.
    async function inspect(relative = "") {
      for (const item of await readdir(path.join(directory, relative), { withFileTypes: true })) {
        const name = relative ? `${relative}/${item.name}` : item.name;
        assert.ok(item.isDirectory() || item.isFile(), `${family.name}: non-regular native entry ${name}`);
        if (item.isDirectory()) await inspect(name);
        else if (item.isFile() && name.endsWith(".txt") && !name.endsWith(".expected.txt")) {
          assert.ok(inputs.has(name) || expectedFiles.has(name) || archives.includes(name), `${family.name}: undeclared native input ${name}`);
        }
      }
    }
    await inspect();
  }
  return cases;
}
