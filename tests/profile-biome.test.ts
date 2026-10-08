import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import test from "node:test";
import { filter } from "../src/core/index.js";
import type { Observation, Span } from "../src/types.js";
import { familyProfiles } from "../src/profiles/biome.js";

const root = new URL("../fixtures/profiles/biome/", import.meta.url);
const text = (file: string): string => readFileSync(new URL(file, root), "utf8");
const observe = (output: string, command = "biome lint warning.js"): Observation => ({
  source: "shell", command, output, termination: { kind: "exited", code: 0 },
  completeness: "complete", presentation: "unknown",
});
const native = text("lint-warning-advice/output.txt");
const golden = text("lint-warning-advice/expected.txt");
const profile = familyProfiles[0]!;
const run = (output: string, command = "biome lint warning.js") => filter(observe(output, command), { profiles: familyProfiles });
function exact(output: string, command = "biome lint warning.js", metadata: Partial<Observation> = {}): void {
  const result = filter({ ...observe(output, command), ...metadata }, { profiles: familyProfiles });
  assert.equal(result.status, "passthrough", JSON.stringify({ command, metadata, output }));
  assert.ok(!("replacement" in result));
  assert.equal(result.outputBytes, Buffer.byteLength(output));
}

// Independent native oracle: authored prefix strings, two fixed glyph lengths,
// full original complement. No production regex/parser or reduction output used.
const prefixes = ["warning.js:2:2 lint/style/useConst  FIXABLE  ", "warning.js:2:6 lint/correctness/noUnusedVariables  FIXABLE  "];
const removed: Span[] = prefixes.map((prefix, index) => {
  const start = native.indexOf(prefix) + prefix.length;
  return [start, start + [55, 40][index]!] as const;
});
function complement(input: string, spans: readonly Span[]): string {
  let start = 0, result = "";
  for (const [from, to] of spans) { result += input.slice(start, from); start = to; }
  return result + input.slice(start);
}

test("Biome native oracle removes exactly two header spans; every other row is required", () => {
  assert.equal(complement(native, removed), golden);
  assert.equal(Buffer.byteLength(native) - Buffer.byteLength(golden), 285);
  for (const span of removed) assert.ok(/^━+$/.test(native.slice(...span)));
  const reduction = profile.reduce(native, observe(native));
  assert.ok(reduction);
  assert.deepEqual(reduction.pieces, reduction.required);
  const covered = (start: number, end: number) => reduction.required.some(([from, to]) => from <= start && to >= end);
  let offset = 0;
  for (const row of native.split(/(?<=\n)/)) {
    if (!row) continue;
    const removal = removed.find(([start, end]) => start >= offset && end < offset + row.length);
    if (removal) {
      assert.ok(covered(offset, removal[0]), "entire header prefix required");
      assert.ok(covered(removal[1], offset + row.length), "header newline required");
    } else assert.ok(covered(offset, offset + row.length), `entire body/footer row required: ${row}`);
    offset += row.length;
  }
  for (const evidence of ["  i This let", "  ! This variable", "\t^^^", "\t    ^^^^^^", "Safe fix:", "Unsafe fix:", "café 🪨", "Found 1 warning.", "Checked 1 file in 2ms."]) {
    assert.ok(golden.includes(evidence), evidence);
  }
});

for (const mode of ["lint", "check"]) {
  test(`Biome native ${mode}: empty-profile baseline RED, independent golden GREEN`, () => {
    const input = text(`${mode}-warning-advice/output.txt`);
    const expected = text(`${mode}-warning-advice/expected.txt`);
    const observation = observe(input, `biome ${mode} warning.js`);
    assert.equal(filter(observation, { profiles: [] }).status, "passthrough");
    const result = filter(observation, { profiles: familyProfiles });
    assert.equal(result.status, "reduced");
    assert.ok("replacement" in result);
    assert.equal(result.replacement, expected);
    assert.equal(result.inputBytes, 1577);
    assert.equal(result.outputBytes, 1292);
  });
}

interface NativeCase extends Observation {
  name: string; family: string; file: string; status: "reduced" | "passthrough";
  expectedFile?: string; argv: string[]; version: string; platform: string;
  provenance: { receipt: string; case: string };
}
interface Receipt {
  name: string; file: string; command: string; argv: string[]; termination: Observation["termination"];
  completeness: string; presentation: string; version: string;
  provenance: { outputBytes: number; outputSha256: string; configSha256: string; sourceSha256: Record<string, string> };
}
test("Biome all 18 normalized native cases retain original receipt and public dispositions", () => {
  const manifest = JSON.parse(text("cases.json")) as { schema: string; cases: NativeCase[] };
  const receipt = JSON.parse(text("capture-receipt.json")) as { schema: string; cases: Receipt[] };
  assert.equal(manifest.schema, "hugr-lean/native-cases/1");
  assert.equal(receipt.schema, "native-cases1");
  const names = ["check-clean", "lint-clean", "format-clean", "lint-warning-advice", "check-warning-advice", "lint-warning-failure",
    "check-multifile-failure", "lint-error", "format-diff", "check-parse-error", "check-write", "format-write", "lint-json-warning",
    "check-json-multifile", "format-json-clean", "format-json-diff", "lint-write-unsafe", "lint-ansi-warning"].map((name) => `L02/${name}`);
  assert.deepEqual(manifest.cases.map((entry) => entry.name), names);
  assert.deepEqual(receipt.cases.map((entry) => entry.name), names);
  const sha = (file: string) => createHash("sha256").update(readFileSync(new URL(file, root))).digest("hex");
  for (const [index, entry] of manifest.cases.entries()) {
    const original = receipt.cases[index]!;
    assert.equal(entry.family, "biome");
    assert.equal(entry.provenance.receipt, "capture-receipt.json");
    assert.equal(entry.provenance.case, entry.name);
    for (const key of ["file", "command", "argv", "termination", "completeness", "presentation", "version"] as const) assert.deepEqual(entry[key], original[key]);
    assert.equal(typeof entry.platform, "string");
    const input = text(entry.file), dir = entry.file.slice(0, entry.file.lastIndexOf("/") + 1);
    assert.equal(sha(entry.file), original.provenance.outputSha256);
    assert.equal(Buffer.byteLength(input), original.provenance.outputBytes);
    assert.equal(sha(`${dir}biome.json`), original.provenance.configSha256);
    for (const [file, hash] of Object.entries(original.provenance.sourceSha256)) assert.equal(sha(`${dir}${file}`), hash);
    assert.ok(profile.match(entry.argv), entry.command);
    const result = filter({ ...entry, output: input, source: "shell" }, { profiles: familyProfiles });
    assert.equal(result.status, entry.status, entry.name);
    if (entry.expectedFile) {
      assert.ok("replacement" in result);
      assert.equal(result.replacement, text(entry.expectedFile));
    } else {
      assert.ok(!("replacement" in result), entry.name);
      assert.equal(profile.reduce(input, { ...entry, output: input, source: "shell" }), undefined);
    }
  }
});

test("Biome identity and closed observed flags use actual structural argv, never Node aliases", () => {
  for (const command of ["biome lint warning.js", "biome check warning.js", "biome lint --colors=off warning.js",
    "/isolated/node_modules/.bin/biome check ./src/a.js ./src/b.js", "biome lint 'path with spaces/a.js'", "biome check /tmp/a.js"]) {
    const result = run(native, command);
    assert.equal(result.status, "reduced", command);
    assert.ok("replacement" in result);
    assert.equal(result.replacement, golden);
  }
  for (const command of ["node biome lint warning.js", "node /bin/biome lint warning.js", "npx biome lint warning.js", "./biome lint warning.js",
    "/bin/not-biome lint warning.js", "biome-ci lint warning.js", "BIOME=1 biome lint warning.js", "biome lint warning.js && true",
    "biome lint", "biome lint --unknown warning.js", "biome lint --colors=off --colors=force warning.js", "biome lint --colors off warning.js",
    "biome lint --unsafe warning.js", "biome lint --write --write warning.js", "biome lint -- warning.js", "biome lint '*.js'",
    "biome lint --max-diagnostics=1 warning.js", "biome lint --verbose warning.js", "biome lint --diagnostic-level=error warning.js"]) exact(native, command);
  for (const command of ["biome lint --reporter=json warning.js", "biome lint --colors=force warning.js", "biome lint --write warning.js",
    "biome lint --write --unsafe warning.js", "biome format warning.js", "biome lint --error-on-warnings warning.js"]) exact(native, command);
});

test("Biome boundaries: all prefixes, unknown rows at every boundary, and nonnative body stay exact", () => {
  for (let end = 0; end < native.length; end++) exact(native.slice(0, end));
  const boundaries = [0, ...Array.from(native.matchAll(/\n/g), (match) => match.index + 1)];
  for (const offset of boundaries) {
    for (const unknown of ["plugin emitted opaque output\n", "  @ nonnative body\n"]) exact(native.slice(0, offset) + unknown + native.slice(offset));
  }
  for (const input of ["\n" + native, native + "\n", native + "Checked 1 file in 2ms. No fixes applied.\n",
    native + "Found 1 warning.\n", native.replace("  i Safe fix:", "    opaque section:"), native.replace("  i Safe fix:", "  ! Safe fix:"),
    native.replace("\n\n  i This let", "\n  i This let"), native.replace("  i This let", "  × This let"),
    native.replace("  i This let", "  i "), native.replace("\n\nChecked", "\nChecked"),
    native.replace("No fixes applied.", "Applied 1 fix."), native.replace("Found 1 warning.", "Found 1 warning.\nDiagnostics not shown: 1."),
    native.replace("\n\nChecked", "\n\nnew.js:1:1 lint/style/newRule  FIXABLE  ━━\n\nChecked")]) exact(input);
});

test("Biome controls C0/C1, CR and ANSI anywhere refuse without sanitizing", () => {
  const controls = [...Array.from({ length: 32 }, (_, code) => code).filter((code) => code !== 9 && code !== 10),
    ...Array.from({ length: 33 }, (_, index) => 127 + index)];
  for (const code of controls) {
    for (const offset of [0, native.indexOf("café"), native.lastIndexOf("Found"), native.length]) {
      exact(native.slice(0, offset) + String.fromCharCode(code) + native.slice(offset));
    }
  }
  exact(native.replaceAll("\n", "\r\n"));
  exact(native.replace("café", "\x1b[31mcafé\x1b[0m"));
});

test("Biome complete metadata required by public filter and direct reducer", () => {
  const metadata: Partial<Observation>[] = [{ source: "other" }, { presentation: "terminal-rendered" }, { completeness: "unknown" }, { completeness: "truncated" },
    { termination: { kind: "unknown" } }, { termination: { kind: "timed_out" } }, { termination: { kind: "exited", code: 1 } }];
  for (const change of metadata) {
    exact(native, undefined, change);
    assert.equal(profile.reduce(native, { ...observe(native), ...change }), undefined);
  }
  assert.equal(profile.reduce(native, { ...observe(native), output: "different source" }), undefined);
});

test("Biome primary warning counts, checked paths, plurality and omissions are consistent", () => {
  for (const input of [native.replace("Found 1 warning.", "Found 2 warnings."), native.replace("Found 1 warning.\n", ""),
    native.replace("Found 1 warning.", "Found 2 warning."),
    native.replace("Found 1 warning.", "Found 0 warnings."), native.replace("Found 1 warning.", "Found 1 warnings."),
    native.replace("Checked 1 file", "Checked 0 files"), native.replace("Checked 1 file", "Checked 1 files"),
    native.replace("Checked 1 file", "Checked 9007199254740992 files"), native.replace("Found 1 warning.", "Found 9007199254740992 warnings."),
    native.replace("warning.js:2:6", "different.js:2:6"), native.replace("warning.js:2:2", "warning.js:0:2"),
    native.replace("warning.js:2:2", "warning.js:9007199254740992:2")]) exact(input);
  const info = native.slice(0, native.indexOf(prefixes[1]!)) + "Checked 1 file in 2ms. No fixes applied.\n";
  assert.equal(run(info).status, "reduced", "information diagnostics have no warning-count footer");
  exact(info + "Found 1 warning.\n");
});

test("Biome generic paths/rules/messages and wrapped native sections preserve all evidence", () => {
  const varied = native.replaceAll("warning.js", "src/other file.ts").replaceAll("lint/style/useConst", "lint/newGroup/newRule")
    .replace("  i This let declares a variable that is only assigned once.", "  i New diagnostic text ━━━ stays intact.\n    Wrapped paragraph retains café 🪨 and ━━━.")
    .replace("  i Safe fix: Use const instead.", "  i Help text remains exact; suggestion has new words.")
    .replace("src/other file.ts:2:6", "src/other file.ts:7:10");
  const changed = run(varied);
  assert.equal(changed.status, "reduced");
  assert.ok("replacement" in changed);
  assert.ok(changed.replacement.includes("New diagnostic text ━━━ stays intact."));
  assert.ok(changed.replacement.includes("    Wrapped paragraph retains café 🪨 and ━━━."));
  assert.ok(changed.replacement.includes("Help text remains exact; suggestion has new words."));
  assert.ok(changed.replacement.includes("src/other file.ts:2:2 lint/newGroup/newRule  FIXABLE  \n"));
  const two = native.replace("warning.js:2:6", "elsewhere.ts:7:10").replace("Checked 1 file", "Checked 2 files");
  assert.equal(run(two).status, "reduced");
  const warningOnly = native.slice(native.indexOf(prefixes[1]!));
  const multiple = warningOnly.replace("Checked 1 file in 2ms. No fixes applied.\nFound 1 warning.\n", "")
    + warningOnly.replaceAll("warning.js", "two.ts").replace("Checked 1 file", "Checked 2 files").replace("Found 1 warning.", "Found 2 warnings.");
  assert.equal(run(multiple).status, "reduced");
  const wide = native.replaceAll("  > 2 │", "  > 102 │").replaceAll("    1 │", "    101 │")
    .replaceAll("      │", "        │").replaceAll("    1 1 │", "    101 101 │").replaceAll("    2   │", "    102     │");
  assert.equal(run(wide).status, "reduced", "gutter widths and positions are structural, not fixture-number spellings");
});

test("Biome explicit silent/clean, machine output and forged success errors have no economy", () => {
  for (const output of ["", "Checked 1 file in 2ms. No fixes applied.\n", text("lint-json-warning/output.txt"),
    text("lint-error/output.txt"), text("check-multifile-failure/output.txt"), text("lint-ansi-warning/output.txt")]) exact(output);
  assert.equal(profile.reduce(native, observe(native, "node /bin/biome lint warning.js")), undefined);
});
