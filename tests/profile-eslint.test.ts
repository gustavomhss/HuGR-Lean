import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import test from "node:test";
import { filter } from "../src/core/index.js";
import type { Observation } from "../src/core/types.js";
import { familyProfiles } from "../src/profiles/eslint.js";

const fixture = (file: string): string => readFileSync(new URL(`../fixtures/profiles/eslint/${file}`, import.meta.url), "utf8");
const native = fixture("ascii-stylish.txt");
const golden = fixture("ascii-stylish.expected.txt");
function observe(output = native, command = "eslint alpha.js unicode.js", patch: Partial<Observation> = {}): Observation {
  return { source: "shell", command, output, termination: { kind: "exited", code: 0 }, completeness: "complete", presentation: "unknown", ...patch };
}
const run = (o: Observation) => filter(o, { profiles: familyProfiles });
function exact(o: Observation): void {
  const result = run(o);
  assert.equal(result.status, "passthrough");
  assert.equal("replacement" in result, false);
  assert.equal(result.inputBytes, result.outputBytes);
}

test("native literal golden predates parser and removes only approved frame", () => {
  assert.equal(Buffer.byteLength(native), 724);
  assert.equal(createHash("sha256").update(native).digest("hex"), "1af411f06156ac170256e07d883184dcb2bf91ab7e5077170eec99e0db056867");
  assert.equal(native, `\n${golden}\n`);
  const result = run(observe());
  assert.equal(result.status, "reduced");
  assert.equal("replacement" in result && result.replacement, golden);
  assert.equal(result.inputBytes - result.outputBytes, 2);
});

test("native successful fixable and rule-less ignore diagnostics retain literal goldens", () => {
  for (const [file, command] of [["fix-before", "eslint --config fix.config.mjs fix.js"], ["ignored-warning", "eslint ignored.js"]]) {
    const result = run(observe(fixture(`${file}.txt`), command));
    assert.equal(result.status, "reduced", file);
    assert.equal("replacement" in result && result.replacement, fixture(`${file}.expected.txt`));
    assert.equal(result.inputBytes - result.outputBytes, 2);
  }
});

test("real direct absolute and finite npx launcher supplements", () => {
  for (const command of [
    "/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode/l01-eslint/node_modules/.bin/eslint alpha.js unicode.js",
    "npx eslint alpha.js unicode.js", "npx --no-install eslint alpha.js unicode.js",
  ]) {
    const result = run(observe(native, command));
    assert.equal(result.status, "reduced", command);
    assert.equal("replacement" in result && result.replacement, golden);
  }
});

test("metadata and failed native boundary never reduce", () => {
  for (const patch of [
    { source: "other" }, { completeness: "unknown" }, { completeness: "truncated" },
    { termination: { kind: "unknown" } }, { termination: { kind: "timed_out" } },
    { termination: { kind: "exited", code: 1 } }, { presentation: "terminal-rendered" },
  ] as Partial<Observation>[]) exact(observe(native, undefined, patch));
  exact(observe(fixture("stylish-error.txt"), "eslint error.js", { termination: { kind: "exited", code: 1 } }));
});

test("unknown argv, launchers, formatter, Unicode argv and silent/config output exact", () => {
  for (const command of [
    "eslint --format json alpha.js", "eslint -f stylish alpha.js", "eslint --quiet alpha.js", "eslint --max-warnings 0 alpha.js",
    "eslint --config", "eslint --config a --config b alpha.js", "eslint --fix --fix alpha.js", "eslint", "eslint --version",
    "./eslint alpha.js", "/x/../eslint alpha.js", "/x//eslint alpha.js", "node eslint.js alpha.js", "npx --yes eslint alpha.js",
    "npx --no-install /x/eslint alpha.js", "npm exec eslint alpha.js", "eslint alpha.js 2>&1", "eslint alpha.js && echo done",
    "eslint alpha.js '雪.js'",
  ]) exact(observe(native, command));
  for (const file of ["json-warnings.txt", "silent-clean.txt", "fix-applied.txt", "empty-config-warning.txt", "version.txt"])
    exact(observe(fixture(file)));
});

test("missing frames, false totals, duplicate paths, malformed rows and extra logs refuse", () => {
  const mutations = [
    native.slice(1), native.slice(0, -1), `\n${native}`, `${native}\n`, native.replace("\n\n✖", "\n✖"),
    native.replace("5 problems", "4 problems"), native.replace("5 warnings", "4 warnings"), native.replace("0 errors", "1 error"),
    native.replace("5 problems", "5 problem"), native.replace("1 warning potentially", "0 warnings potentially"),
    native.replace("1 warning potentially", "6 warnings potentially"), native.replace("0 errors and", "1 error and"),
    native.replace("1 warning potentially", "1 warnings potentially"), native.replace("unicode.js\n", "alpha.js\n"),
    native.replace("1:5", "0:5"), native.replace("1:5", "1:0"), native.replace("1:5", "01:5"),
    native.replace("warning  'café'", "error  'café'"), native.replace("prefer-const", ""),
    native.replace("\n/private", "\nrelative"), native.replace("/project/alpha.js", "/project/../alpha.js"),
    native.replace("\nKeep café", "\n/private/unexpected.js\nKeep café"),
    native.replace("\nKeep café", "\n✖ opaque log\nKeep café"),
    native.replace("\nKeep café", "\n  8:9  warning  ambiguous continuation  custom-rule\nKeep café"),
    native.replace("\nKeep café", "\n\nKeep café"), native.replace("\nKeep café", "\n(node:42) warning\nKeep café"),
    `log\n${native}`, `${native}log\n`, native.replace("\n\n✖", "\nextra user log\n\n✖"),
    native.replace("\n✖", "\n\n✖"), native.replace("\n  0 errors and", "\n  0 errors and 1 warning potentially fixable with the `--fix` option.\n  0 errors and"),
  ];
  for (const output of mutations) exact(observe(output));
});

test("all C0/C1 controls, CRLF, ANSI, formatting controls refuse", () => {
  for (let code = 0; code <= 0x9f; code++) {
    if (code === 10 || (code >= 32 && code < 127)) continue;
    exact(observe(native.replace("café", `ca${String.fromCharCode(code)}fé`)));
  }
  exact(observe(native.replaceAll("\n", "\r\n")));
  exact(observe(native.replace("warning", "\x1b[33mwarning\x1b[0m")));
  exact(observe(native.replace("warning", "\x1b[33mwarning\x1b[0m"), undefined, { presentation: "terminal-rendered" }));
  exact(observe(native.replace("café", "ca\u200dfé")));
});

test("unknown text between native diagnostic section and footer is not admitted", () => {
  exact(observe(native.replace("\n\n✖", "\nextra user log\n\n✖")));
});

test("generic paths/rules, UTF-16 spans, multiline spaces and repeated records stay exact", () => {
  const output = "\n/tmp/雪 café.js\n  12:34  warning  message α 🚀 with spaces.\n continuation with  internal spaces  scope/custom-rule\n  12:34  warning  second message  scope/custom-rule\n\n✖ 2 problems (0 errors, 2 warnings)\n\n";
  const result = run(observe(output, "eslint input.js"));
  assert.equal(result.status, "reduced");
  assert.equal("replacement" in result && result.replacement, "/tmp/雪 café.js\n  12:34  warning  message α 🚀 with spaces.\n continuation with  internal spaces  scope/custom-rule\n  12:34  warning  second message  scope/custom-rule\n\n✖ 2 problems (0 errors, 2 warnings)\n");
  assert.equal(result.inputBytes - result.outputBytes, 2);
  const profile = familyProfiles[0]!;
  const reduction = profile.reduce(output, observe(output));
  assert.deepEqual(reduction?.pieces, [[1, output.length - 1]]);
  assert.deepEqual(reduction?.required, [[1, output.length - 1]]);
  assert.ok(profile.reduce(fixture("stylish-warnings.txt"), observe(fixture("stylish-warnings.txt"))));
});

test("native metadata inventory reconciles capture facts and measured statuses", () => {
  type NativeCase = Omit<Observation, "output"> & {
    name: string; family: string; version: string; platform: string;
    file: string; expectedFile?: string; status: string;
    inputBytes: number; outputBytes: number; sha256: string;
    provenance: { record: string; originalCase: string; sha256: string };
  };
  const manifest = JSON.parse(fixture("cases.json")) as { schema: string; cases: NativeCase[] };
  assert.equal(manifest.schema, "hugr-lean/native-cases/1");
  assert.deepEqual(manifest.cases.map(c => c.name).sort(), [
    "version", "stylish-warnings", "json-warnings", "stylish-error", "silent-clean", "fix-before", "fix-applied",
    "ignored-warning", "empty-config-warning", "ascii-stylish", "absolute-stylish", "npx-stylish", "npx-no-install-stylish",
  ].map(id => `L01-${id}`).sort());
  assert.equal(createHash("sha256").update(fixture("capture-receipt.json")).digest("hex"),
    "4fb9167df70e52a8fdd9567295eb15818e8c170fe40ad27e54f1c45049157d75");
  for (const c of manifest.cases) {
    const output = fixture(c.file);
    assert.equal(createHash("sha256").update(output).digest("hex"), c.sha256, c.name);
    assert.equal(c.family, "eslint");
    assert.equal(c.version, "ESLint 9.37.0");
    assert.equal(c.platform, "darwin-x64");
    assert.equal(c.provenance.originalCase, c.name);
    assert.equal(c.provenance.sha256, c.sha256);
    assert.equal(c.provenance.record, c.file === "ascii-stylish.txt" ? "SOURCES.md" : "capture-receipt.json");
    const result = run({ ...c, output });
    assert.equal(result.status, c.status, c.name);
    assert.equal(result.inputBytes, c.inputBytes, c.name);
    assert.equal(result.outputBytes, c.outputBytes, c.name);
    if (c.expectedFile) {
      assert.equal(result.status, "reduced", c.name);
      assert.equal("replacement" in result && result.replacement, fixture(c.expectedFile), c.name);
      assert.equal(output, `\n${fixture(c.expectedFile)}\n`, c.name);
    } else assert.equal("replacement" in result, false, c.name);
  }
});

test("finite grammar limits, large positions and raw reducer metadata are conservative", () => {
  const row = "  1:1  warning  message  custom-rule\n";
  const profile = familyProfiles[0]!;
  const huge = `\n/tmp/file.js\n${row.repeat(16385)}\n✖ 16385 problems (0 errors, 16385 warnings)\n\n`;
  exact(observe(huge));
  const files = Array.from({ length: 4097 }, (_, i) => `/tmp/file-${i}.js\n${row}\n`).join("");
  exact(observe(`\n${files}✖ 4097 problems (0 errors, 4097 warnings)\n\n`));
  exact(observe(`\n/tmp/file.js\n  1:1  warning  ${"x".repeat(1024 * 1024)}  custom-rule\n\n✖ 1 problem (0 errors, 1 warning)\n\n`));
  exact(observe(`\n/tmp/file.js\n  1:1  warning  first line\n${"continue\n".repeat(257)}end  custom-rule\n\n✖ 1 problem (0 errors, 1 warning)\n\n`));
  exact(observe(native.replace("1:5", "9007199254740992:5")));
  exact(observe(native.replace("5 problems", "9007199254740992 problems")));
  exact(observe(native.replace("1 warning potentially", "9007199254740992 warnings potentially")));
  for (const patch of [{ completeness: "unknown" }, { source: "other" }, { termination: { kind: "exited", code: 1 } }] as Partial<Observation>[])
    assert.equal(profile.reduce(native, observe(native, undefined, patch)), undefined);
  // Ambiguous row-shaped message/log cannot establish a second record; total mismatch refuses.
  exact(observe(native.replace("\nKeep café", "\n  8:9  warning  log-shaped message  custom-rule\nKeep café")));
  const whitespace = "\n/tmp/other.js\n  1:1  warning  leading and trailing spaces   scope/other\n\n✖ 1 problem (0 errors, 1 warning)\n\n";
  const result = run(observe(whitespace));
  assert.equal("replacement" in result && result.replacement,
    "/tmp/other.js\n  1:1  warning  leading and trailing spaces   scope/other\n\n✖ 1 problem (0 errors, 1 warning)\n");
});
