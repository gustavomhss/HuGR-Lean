import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { filter } from "../src/core/index.js";
import { formatProfiles } from "../src/profiles/formats.js";
import { familyProfiles } from "../src/profiles/tsc.js";
import type { Observation, Profile, Span } from "../src/types.js";

interface Case {
  name: string; family: string; command: string[]; file: string; expectedFile?: string;
  status: "reduced" | "passthrough"; termination: Observation["termination"];
  completeness: Observation["completeness"]; presentation: Observation["presentation"];
  version: string; provenance: { sequence: number };
}
const root = new URL("../fixtures/profiles/tsc/", import.meta.url);
const fixture = (path: string): string => readFileSync(new URL(path, root), "utf8");
const manifest = JSON.parse(fixture("cases.json")) as { schema: string; cases: Case[] };
const positives = ["direct-build-initial", "direct-build-up-to-date", "direct-build-incremental",
  "npx-build-up-to-date", "npx-no-install-build-up-to-date", "direct-build-force"];
const original = ["success", "no-emit", "plain-error", "pretty-error", "build-initial",
  "build-up-to-date", "diagnostics", "extended-diagnostics", "list-files", "list-emitted-files",
  "explain-files", "metrics-lists", "error-metrics-lists", "build-incremental", "build-metrics-lists",
  "build-error", "project-incremental-initial", "project-incremental-cached"];
const find = (name: string): Case => {
  const value = manifest.cases.find((item) => item.name === `T01/${name}`);
  assert.ok(value, `Missing native case: ${name}`); return value;
};
function observation(c: Case, patch: Partial<Observation> = {}): Observation {
  return { source: "shell", command: c.command.join(" "), output: fixture(c.file),
    termination: c.termination, completeness: c.completeness, presentation: c.presentation, ...patch };
}
const profile = (): Profile => {
  assert.deepEqual(familyProfiles.map((item) => item.id), ["tsc"]);
  return familyProfiles[0]!;
};
const supported = "tsc -b refs --verbose --pretty false";
function exact(output: string, patch: Partial<Observation> = {}): void {
  const obs = observation(find("direct-build-up-to-date"), { command: supported, output, ...patch });
  const result = filter(obs, { profiles: familyProfiles });
  assert.equal(result.status, "passthrough", JSON.stringify({ output, patch, result }));
  assert.equal("replacement" in result, false);
  assert.equal(result.inputBytes, Buffer.byteLength(output));
  assert.equal(result.outputBytes, Buffer.byteLength(output));
}
function reduced(obs: Observation, expected: string, selected: readonly Profile[] = familyProfiles): void {
  const result = filter(obs, { profiles: selected });
  assert.equal(result.status, "reduced", JSON.stringify(result));
  assert.ok("replacement" in result);
  assert.equal(result.replacement, expected);
  assert.equal(result.profile, "tsc");
  assert.equal(result.inputBytes, Buffer.byteLength(obs.output));
  assert.equal(result.outputBytes, Buffer.byteLength(expected));
  assert.ok(result.outputBytes < result.inputBytes);
}

test("T01 finite native inventory and pinned metadata have exact correspondence", () => {
  assert.equal(manifest.schema, "hugr-lean/native-cases/1");
  assert.deepEqual(manifest.cases.map((item) => item.name).sort(),
    [...original, ...positives].map((name) => `T01/${name}`).sort());
  assert.deepEqual(manifest.cases.filter((item) => item.status === "reduced").map((item) => item.name).sort(),
    positives.map((name) => `T01/${name}`).sort());
  for (const c of manifest.cases) {
    assert.equal(c.family, "tsc"); assert.equal(c.version, "TypeScript 5.9.3");
    assert.equal(c.completeness, "complete"); assert.equal(c.presentation, "unknown");
    assert.equal(c.termination.kind, "exited"); assert.ok(c.command.length > 1);
    assert.equal(typeof fixture(c.file), "string");
    if (c.status === "reduced") { assert.ok(c.expectedFile); assert.ok(fixture(c.expectedFile).length); }
  }
});
for (const name of positives) test(`T01 public-filter native golden: ${name}`, (context) => {
  const c = find(name), obs = observation(c), expected = fixture(c.expectedFile!);
  reduced(obs, expected);
  // The unchanged diagnostic-only baseline must fail this same positive oracle.
  assert.throws(() => reduced(obs, expected, formatProfiles), assert.AssertionError);
  context.diagnostic(`${name}: ${Buffer.byteLength(obs.output)} -> ${Buffer.byteLength(expected)} UTF-8 bytes`);
});
for (const name of original) test(`T01 original Node capture stays exact: ${name}`, () => {
  const c = find(name), obs = observation(c);
  assert.equal(c.command[0], "/usr/local/bin/node", "Never rewrite native argv");
  assert.equal(profile().match(c.command), false);
  const result = filter(obs, { profiles: familyProfiles });
  assert.equal(result.status, "passthrough"); assert.equal("replacement" in result, false);
  assert.equal(result.outputBytes, Buffer.byteLength(obs.output));
});

test("T01 independent project-list, body, timestamp-group and required-span evidence", () => {
  const parent = "../../../../../../../../var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode/t01-tsc-direct/";
  for (const name of positives) {
    const c = find(name), obs = observation(c), expected = fixture(c.expectedFile!);
    const prefix = name.startsWith("npx") ? parent : "";
    const paths = ["refs/lib/tsconfig.json", "refs/app/tsconfig.json", "refs/tsconfig.json"].map((p) => prefix + p);
    const value = profile().reduce(obs.output, obs); assert.ok(value);
    const covers = (span: Span): boolean => value.required.some(([start, end]) => start <= span[0] && end >= span[1]);
    let previous = -1;
    for (const path of paths) {
      const text = `    * ${path}`, start = obs.output.indexOf(text), end = obs.output.indexOf("\n", start) + 1;
      assert.ok(start > previous); previous = start;
      assert.ok(expected.includes(text), `Independent list path missing: ${path}`);
      assert.ok(covers([start, end]), `List not declared required: ${path}`);
    }
    // Every original event body and its exact newline must be required, independently
    // of the golden and independently of how the implementation builds its pieces.
    for (const row of obs.output.matchAll(/^(\d{1,2}:\d\d:\d\d [AP]M - )(.+)\r?$/gm)) {
      const start = row.index! + row[1]!.length, end = obs.output.indexOf("\n", start) + 1;
      assert.ok(covers([start, end]), `Event body not required: ${row[2]}`);
      assert.ok(expected.includes(obs.output.slice(start, end)), `Native body lost: ${row[2]}`);
    }
    const times = [...obs.output.matchAll(/^(\d{1,2}:\d\d:\d\d [AP]M - )/gm)].map((m) => m[1]);
    const groups = times.filter((time, index) => index === 0 || time !== times[index - 1]);
    assert.deepEqual([...expected.matchAll(/^(\d{1,2}:\d\d:\d\d [AP]M - )/gm)].map((m) => m[1]), groups);
    assert.ok(value.pieces.every((piece) => Array.isArray(piece)), "No invented dynamic text or summaries");
  }
});

test("T01 finite argv grammar rejects unsupported launchers, flags, duplicates and extra projects", () => {
  const good = ["tsc", "-b", "refs", "--verbose", "--pretty", "false"];
  for (const c of manifest.cases.filter((item) => item.status === "reduced")) assert.equal(profile().match(c.command), true);
  for (const argv of [
    ["tsc", "--build", "refs", "--verbose", "--pretty", "false"],
    ["tsc", "-b", "--pretty", "false", "--verbose", "refs"],
    [...good, "--force"],
  ]) assert.equal(profile().match(argv), true, argv.join(" "));
  for (const argv of [
    ["tsc"], ["tsc", "--version"], ["tsc", "-p", "refs", "--verbose"],
    ["tsc", "-b", "refs", "--verbose"], ["tsc", "-b", "refs", "--pretty", "false"],
    ["tsc", "-b", "refs", "--verbose", "--pretty", "true"],
    ["npx", "--yes", ...good], ["pnpm", "exec", ...good], ["./tsc", ...good.slice(1)],
    [...good, "--verbose"], [...good, "--pretty", "false"], [...good, "--force", "--force"],
    [...good, "--watch"], [...good, "--listFiles"], [...good, "--extendedDiagnostics"],
    [...good, "--diagnostics"], [...good, "--listEmittedFiles"], [...good, "--explainFiles"],
    [...good, "--incremental"], [...good, "--clean"], [...good, "--dry"], [...good, "--unknown"],
    [...good, "other"], [...good, "--"], ["tsc", "-b", "refs", "-v", "--pretty", "false"],
  ]) assert.equal(profile().match(argv), false, argv.join(" "));
});

test("T01 entire grammar refuses unknown lines, diagnostics, version text and inconsistent terminals", () => {
  const initial = fixture(find("direct-build-initial").file);
  const current = fixture(find("direct-build-up-to-date").file);
  const incremental = fixture(find("direct-build-incremental").file);
  reduced(observation(find("direct-build-up-to-date")), fixture(find("direct-build-up-to-date").expectedFile!));
  for (const output of [
    "Version 6.0.0\n" + current, current + "Version 6.0.0\n", current + "Files: 4\n",
    current + "unknown plugin output\n", current + "\n", current.slice(0, -1), current.slice(0, -2),
    current.replace("refs/app/tsconfig.json\r\n", "refs/lib/tsconfig.json\r\n"),
    current.replace("refs/app/tsconfig.json\r\n", "./refs/lib/tsconfig.json\r\n"),
    current.replace("    * refs/tsconfig.json\n", ""),
    current.replace("3:54:49 PM - Project 'refs/lib/tsconfig.json'", "3:54:49 PM - Project 'alien/tsconfig.json'"),
    current.replace("newest input 'refs/lib/index.ts'", "newest input 'refs/app/index.ts'"),
    current.replace("output 'refs/lib/out/tsconfig.tsbuildinfo'", "output 'alien/out/tsconfig.tsbuildinfo'"),
    current.replace("is up to date because newest input", "is out of date because built with version '6.0.0'; newest input"),
    initial.replace("t01-tsc-direct/refs/lib/tsconfig.json'...", "t01-tsc-direct/refs/app/tsconfig.json'..."),
    initial.replace("does not exist", "was removed by custom plugin"),
    incremental.replace("is out of date because output 'refs/lib/out/tsconfig.tsbuildinfo' is older than input 'refs/lib/index.ts'",
      "is up to date with .d.ts files from its dependencies"),
    incremental.replace("Updating output timestamps", "Rewriting output timestamps"),
    current.replace("3:54:49 PM", "25:99:99 PM"),
    current.replace("Project 'refs/lib", "\u001b[96mProject 'refs/lib"),
    current.replace("refs/lib/tsconfig.json", "refs/lib/tsconfig.json\u0085"),
    current.replaceAll("refs", "other"),
  ]) exact(output);
  const blocks = current.split("\n\n"); assert.equal(blocks.length, 4);
  exact([blocks[0], blocks[2], blocks[1], blocks[3]].join("\n\n"));
  exact(current + blocks[1] + "\n\n");
  for (const name of ["diagnostics", "extended-diagnostics", "list-files", "list-emitted-files", "explain-files",
    "metrics-lists", "error-metrics-lists", "build-metrics-lists", "plain-error", "pretty-error", "build-error", "success"]) {
    exact(fixture(find(name).file)); // Force the admitted command, including forged exit 0; grammar must refuse.
  }
  exact(initial.slice(initial.indexOf("\n") + 1));
  for (const line of initial.split("\n").filter((line) => line.includes(" - ") && !line.includes("Projects in this build:"))) {
    const altered = initial.replace(line + "\n\n", "");
    assert.notEqual(altered, initial, "Missing-event mutation must change input");
    exact(altered);
  }
  for (let offset = 0; offset <= current.length; offset++) {
    if (offset === 0 || current[offset - 1] === "\n") exact(current.slice(0, offset) + "unknown context\n" + current.slice(offset));
  }
  let clock = 0;
  exact(current.replace(/^\d{1,2}:\d\d:\d\d [AP]M - /gm, () => `4:00:0${clock++} PM - `));
});

test("T01 nonzero, missing boundary, unsupported source and unsupported commands stay exact", () => {
  const output = fixture(find("direct-build-up-to-date").file);
  for (const patch of [
    { termination: { kind: "exited", code: 2 } }, { termination: { kind: "unknown" } },
    { termination: { kind: "timed_out" } }, { completeness: "unknown" }, { completeness: "truncated" },
    { source: "other" }, { command: "TSC_VERSION=5.9.3 " + supported }, { command: supported + " && echo ok" },
    { presentation: "terminal-rendered" },
    { command: supported + " --extendedDiagnostics" }, { command: supported + " --force" },
  ] satisfies Partial<Observation>[]) exact(output, patch);
  exact("\u001b[90m" + output + "\u001b[0m", { presentation: "terminal-rendered" });
  for (const code of [1, 2, 137]) {
    const obs = observation(find("direct-build-up-to-date"), { termination: { kind: "exited", code } });
    assert.equal(profile().reduce(obs.output, obs), undefined, "Profile itself must reject failed observations");
  }
});

test("T01 UTF-16 paths, ordered source spans and exact CRLF are preserved", () => {
  const c = find("direct-build-initial"), obs = observation(c), expected = fixture(c.expectedFile!);
  const unicode = (text: string): string => text.replaceAll("/lib/", "/café🔥/");
  reduced({ ...obs, output: unicode(obs.output) }, unicode(expected));
  const crlf = (text: string): string => text.replace(/\r?\n/g, "\r\n");
  reduced({ ...obs, output: crlf(obs.output) }, crlf(expected));
  const legacy = readFileSync(new URL("../fixtures/formats/lint_tsc_errors.txt", import.meta.url), "utf8");
  exact(legacy, { command: "tsc --pretty false", termination: { kind: "exited", code: 2 } });
  exact(legacy);
});
