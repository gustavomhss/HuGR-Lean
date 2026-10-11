import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { filter } from "../src/core/engine.js";
import { cargoProfiles } from "../src/profiles/cargo.js";
import { familyProfiles } from "../src/profiles/cargo-test.js";
import type { Observation } from "../src/types.js";

// Real `cargo test` output captured on a GitHub-hosted Windows runner (provenance/windows-receipt.json).
const root = new URL("../fixtures/profiles/cargo-test/", import.meta.url);
const read = (file: string) => readFileSync(new URL(file, root), "utf8");
interface Case { name: string; command: string; file: string; expectedFile: string; status: "reduced" | "passthrough";
  termination: Observation["termination"]; platform: string; version: string }
const cases: Case[] = (JSON.parse(read("cases.json")).cases as Case[]).filter(c => c.name.startsWith("C02/windows-"));
const byName = (stem: string) => cases.find(c => c.name === `C02/windows-${stem}`)!;
const receipt = JSON.parse(read("provenance/windows-receipt.json"));
const profile = familyProfiles[0]!;
const legacy = cargoProfiles.find(p => p.id === "cargo-test")!;
const observation = (c: Case, output = read(c.file), command = c.command): Observation => ({
  source: "shell", command, output, termination: c.termination, completeness: "complete", presentation: "unknown",
});
const rows = (text: string) => text.match(/[^\n]*\n|[^\n]+$/g) ?? [];
/** Independent oracle: 1-based source rows, never the production grammar. */
const keep = (text: string, ...numbers: number[]) => numbers.map(n => rows(text)[n - 1]!).join("");
function exact(obs: Observation): void {
  const result = filter(obs, { profiles: familyProfiles });
  assert.equal(result.status === "reduced" || result.status === "normalized", false, obs.output);
  assert.equal("replacement" in result, false);
  assert.equal(result.outputBytes, Buffer.byteLength(obs.output));
  assert.equal(profile.reduce(obs.output, obs), undefined);
}
function accepted(obs: Observation, expected: string): void {
  const result = filter(obs, { profiles: familyProfiles });
  assert.equal(result.status, "reduced", `${obs.command}\n${obs.output}`);
  if (result.status !== "reduced") return;
  assert.equal(result.replacement, expected);
  assert.equal(result.inputBytes, Buffer.byteLength(obs.output));
  assert.equal(result.outputBytes, Buffer.byteLength(expected));
  const reduction = profile.reduce(obs.output, obs)!;
  let cursor = 0;
  for (const row of rows(expected)) {
    // UTF-16 spans: each golden row is a declared, emitted slice of the native text.
    const at = obs.output.indexOf(row, cursor);
    assert.ok(at >= cursor, `source row missing: ${row}`);
    assert.ok(reduction.required.some(([a, b]) => a <= at && b >= at + row.length), `required row missing: ${row}`);
    cursor = at + row.length;
  }
}
/** Same run in POSIX spelling: `/` separators, no `.exe`, absolute Windows roots become one POSIX root. */
const winRoot = /\((?:[A-Za-z]:|\\\\\?\\UNC\\[^\\\s()]+\\[^\\\s()]+|\\\\\?\\[A-Za-z]:|\\\\[^\\\s()]+\\[^\\\s()]+)\\/;
function posix(text: string): string {
  return rows(text).map(row => {
    if (row.startsWith("     Running ")) return row.replace(winRoot, "(/").replace(/\.exe\)/, ")").replaceAll("\\", "/");
    if (row.startsWith("test ") && row.includes(".rs - ")) return row.replace(/^test (\S+)/, (_, p: string) => `test ${p.replaceAll("\\", "/")}`);
    return row;
  }).join("");
}

test("WIN-C02 inventory: twelve native Windows captures bound to a pinned producer and runner", () => {
  assert.equal(cases.length, 12);
  assert.equal(receipt.cases.length, 12);
  const producer = readFileSync(new URL("provenance/windows-capture.mjs", root));
  assert.equal(createHash("sha256").update(producer).digest("hex"), receipt.producer.sha256);
  assert.equal(receipt.runner.os, "Windows");
  assert.match(receipt.runner.runId, /^\d+$/);
  for (const c of cases) {
    assert.equal(c.platform, "win32/x64");
    assert.equal(c.version, receipt.versions.cargo.version);
    const fact = receipt.cases.find((r: { name: string }) => r.name === c.name);
    // Cargo itself writes LF rows on Windows; CRLF arrives only through hosts (covered below).
    assert.equal(fact.boundary.crlfRows, 0);
    assert.equal(read(c.file).includes("\r"), false);
  }
});

test("WIN-C02 Orchestra shape: bare cargo test with drive-letter Compiling and .exe Running reduces", () => {
  const c = byName("native-lib"), input = read(c.file), expected = read(c.expectedFile);
  assert.match(input, /^ {3}Compiling native_item_fixture v0\.1\.0 \(C:\\Users\\/);
  assert.match(input, /\(target\\debug\\deps\\native_item_fixture-d9b637244a1d2cfc\.exe\)/);
  assert.equal(expected, keep(input, 2, 3, 37, 39, 43));
  accepted(observation(c), expected);
  accepted(observation(c, input.replaceAll("\n", "\r\n")), expected.replaceAll("\n", "\r\n"));
  // Legacy-shaped argv: the original parser and the expanded profile agree on the same spans.
  const obs = observation(c);
  assert.deepEqual(profile.reduce(obs.output, obs), legacy.reduce(obs.output, obs));
});

test("WIN-C02 every Windows capture behaves exactly like its POSIX spelling", () => {
  for (const c of cases) {
    const input = read(c.file), expected = read(c.expectedFile);
    if (c.status === "reduced") {
      accepted(observation(c), expected);
      accepted(observation(c, posix(input)), posix(expected));
    } else {
      exact(observation(c));
      exact(observation(c, posix(input)));
      assert.equal(expected, input);
    }
  }
});

test("WIN-C02 drive, UNC, verbatim and verbatim-UNC absolute target directories reduce; renamed directory declines", () => {
  for (const [stem, root] of [["absolute-target", "(C:\\Users\\"], ["verbatim-target", "(\\\\?\\C:\\Users\\"],
    ["unc-target", "(\\\\localhost\\C$\\Users\\"], ["verbatim-unc-target", "(\\\\?\\UNC\\localhost\\C$\\Users\\"]] as const) {
    const c = byName(stem), input = read(c.file);
    assert.ok(input.includes(`unittests src\\lib.rs ${root}`), stem);
    assert.equal(read(c.expectedFile), keep(input, 2, 3, 6, 12));
    accepted(observation(c), read(c.expectedFile));
    const unicode = (s: string) => s.replaceAll("runneradmin", "🦀café");
    accepted(observation(c, unicode(input)), unicode(read(c.expectedFile)));
  }
  // CARGO_TARGET_DIR=...\shared-target: no final `target` directory, declined as its POSIX spelling is.
  const renamed = byName("renamed-target");
  assert.match(read(renamed.file), /\\shared-target\\debug\\deps\\/);
  exact(observation(renamed));
});

test("WIN-C02 target selectors, triples and legacy --lib keep their POSIX semantics", () => {
  const lib = byName("lib"), libInput = read(lib.file);
  assert.equal(read(lib.expectedFile), keep(libInput, 1, 2, 5, 11));
  const obs = observation(lib);
  accepted(obs, read(lib.expectedFile));
  assert.deepEqual(profile.reduce(obs.output, obs), legacy.reduce(obs.output, obs));
  exact(observation(lib, libInput.replace("unittests src\\lib.rs", "unittests code\\library.rs")));
  const test = byName("test-target"), custom = byName("custom-test"), release = byName("release-target");
  assert.equal(read(test.expectedFile), keep(read(test.file), 1, 2, 9));
  assert.equal(read(custom.expectedFile), keep(read(custom.file), 1, 2, 8));
  assert.equal(read(release.expectedFile), keep(read(release.file), 2, 3, 6, 12));
  for (const c of [test, custom, release]) accepted(observation(c), read(c.expectedFile));
  // Selected target names correlate with the executable stem; `.exe` is not part of the identity.
  exact(observation(test, read(test.file).replace("integration-4306ede486c24489.exe", "other-4306ede486c24489.exe")));
  exact(observation(test, read(test.file), test.command.replace("integration", "contract")));
  exact(observation(release, read(release.file).replace("\\x86_64-pc-windows-msvc\\", "\\aarch64-pc-windows-msvc\\")));
  exact(observation(release, read(release.file).replace("\\release\\deps\\", "\\debug\\deps\\")));
});

test("WIN-C02 bare default keeps the legacy header vocabulary; explicit argv admits the custom suite", () => {
  const c = byName("default"), input = read(c.file);
  assert.ok(input.includes("     Running checks\\contract.rs ("));
  exact(observation(c));
  const withoutCustom = input.replace(rows(input).slice(13, 21).join(""), "");
  accepted(observation(c, withoutCustom), keep(withoutCustom, 2, 3, 6, 12, 14, 21, 23, 29));
  accepted(observation(c, input, "cargo test --offline --color never"), keep(input, 2, 3, 6, 12, 14, 20, 22, 29, 31, 37));
});

test("WIN-C02 failures and panics stay whole: real exit 101, false exit 0, injected FAILED row", () => {
  const c = byName("failure"), input = read(c.file);
  assert.equal(c.termination.kind === "exited" && c.termination.code, 101);
  for (const evidence of ["test tests::fails ... FAILED", "panicked at src\\lib.rs:4:26:", "NATIVE FAILURE MUST KEEP café 🦀",
    "test result: FAILED. 1 passed; 1 failed;", "error: test failed, to rerun pass `--lib`"]) assert.ok(input.includes(evidence), evidence);
  const result = filter(observation(c), { profiles: familyProfiles });
  assert.equal(result.status, "passthrough");
  for (const command of ["cargo test", "cargo test --lib", "cargo test --offline --color never --lib"]) {
    exact({ ...observation(c, input, command), termination: { kind: "exited", code: 0 } });
  }
  const lib = byName("lib");
  exact({ ...observation(lib), output: read(lib.file).replace("test tests::alpha_one ... ok", "test tests::alpha_one ... FAILED") });
});

test("WIN-C02 malformed Windows headers decline: mixed separators, empty segments, spaces, relative roots, no .exe", () => {
  const c = byName("absolute-target"), input = read(c.file);
  const header = rows(input)[2]!;
  const mutate = (from: string, to: string) => { assert.ok(header.includes(from), from); return input.replace(header, header.replace(from, to)); };
  const variants = [
    mutate("\\debug\\deps\\", "\\debug/deps\\"), mutate("unittests src\\lib.rs", "unittests src/lib.rs"),
    mutate("\\debug\\deps\\", "\\debug\\\\deps\\"), mutate("unittests src\\lib.rs", "unittests src\\\\lib.rs"),
    mutate("C:\\Users\\runneradmin", "C:\\Program Files\\runneradmin"), mutate("C:\\Users\\", "..\\Users\\"),
    mutate("C:\\Users\\", "\\\\?\\Users\\"), mutate("C:\\Users\\", "CC:\\Users\\"), mutate(".exe)", ")"),
    mutate(".exe)", ".EXE)"), mutate(".exe)", ".exe.exe)"), mutate("(C:\\", "(C:/"), mutate("C:\\Users\\", "\\\\.\\C:\\Users\\"),
  ];
  for (const output of variants) { assert.notEqual(output, input); exact(observation(c, output)); }
  for (const output of variants) exact(observation(c, output.replaceAll("\n", "\r\n")));
});

test("WIN-C02 one host per output: mixed POSIX/Windows suites and absolute/relative aliases decline", () => {
  // Explicit argv admits every suite of the default capture; only the host spelling of one header changes.
  const c = byName("default"), input = read(c.file), command = "cargo test --offline --color never";
  const header = rows(input)[21]!;
  assert.ok(header.startsWith("     Running tests\\integration.rs ("));
  exact(observation(c, input.replace(header, posix(header)), command));
  exact(observation(c, posix(input).replace(posix(header), header), command));
  // The original parser keeps the same guard for legacy-shaped argv.
  const native = byName("native-lib"), nativeInput = read(native.file);
  const extra = "     Running tests/other.rs (target/debug/deps/other-0123456789abcdef)\n\nrunning 1 test\ntest other ... ok\n\n" +
    "test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s\n";
  const mixed = observation(native, nativeInput + extra);
  assert.equal(legacy.reduce(mixed.output, mixed), undefined);
  exact(mixed);
  assert.ok(legacy.reduce(posix(mixed.output), { ...mixed, output: posix(mixed.output) }), "POSIX-only control reduces");
  // Absolute and relative spellings of one executable cannot supply a second suite.
  const test = byName("test-target"), testInput = read(test.file), suite = testInput.slice(testInput.indexOf("     Running"));
  exact(observation(test, testInput + suite.replace("(target\\", "(C:\\work\\c02w\\target\\").replace("tests\\integration.rs", "tests\\again.rs")));
  exact(observation(native, nativeInput + extra.replace("tests/other.rs (target/debug/deps/other-0123456789abcdef)",
    "tests\\other.rs (\\\\?\\C:\\w\\target\\debug\\deps\\native_item_fixture-d9b637244a1d2cfc.exe)")));
});

test("WIN-C02 review: hybrid POSIX headers with `\\` sources or `.exe` names decline on both parsers", () => {
  const c = byName("native-lib"), input = read(c.file), header = rows(input)[2]!;
  const posixHeader = "     Running unittests native.rs (target/debug/deps/native_item_fixture-d9b637244a1d2cfc)\n";
  const control = input.replace(header, posixHeader);
  for (const command of ["cargo test", "cargo test --offline --color never"]) {
    accepted(observation(c, control, command), keep(control, 2, 3, 37, 39, 43));
  }
  for (const hybrid of [
    "     Running unittests src\\lib.rs (target/debug/deps/native_item_fixture-d9b637244a1d2cfc)\n",
    "     Running unittests native.rs (target/debug/deps/native_item_fixture-d9b637244a1d2cfc.exe)\n",
    "     Running unittests src\\lib.rs (target/debug/deps/native_item_fixture-d9b637244a1d2cfc.exe)\n",
    "     Running unittests native.rs (/w\\x/target/debug/deps/native_item_fixture-d9b637244a1d2cfc)\n",
  ]) {
    const output = input.replace(header, hybrid);
    const obs = observation(c, output);
    assert.equal(legacy.reduce(output, obs), undefined, hybrid);
    for (const command of ["cargo test", "cargo test --offline --color never"]) exact(observation(c, output, command));
  }
});

test("WIN-C02 review: doc-test rows follow the executable host; mixed or malformed doc paths decline", () => {
  // Real Windows doc rows read `test src\lib.rs - add (line 3) ... ok` (windows-default capture).
  const c = byName("default"), input = read(c.file), command = "cargo test --offline --color never";
  assert.ok(input.includes("test src\\lib.rs - add (line 3) ... ok"));
  for (const output of [input.replace("test src\\lib.rs - add (line 3)", "test src/lib.rs - add (line 3)"),
    input.replaceAll("test src\\lib.rs - ", "test src/lib.rs - "),
    input.replace("test src\\lib.rs - add (line 3)", "test src\\sub/lib.rs - add (line 3)"),
    input.replace("test src\\lib.rs - add (line 3)", "test src\\\\lib.rs - add (line 3)"),
    input.replace("test src\\lib.rs - add (line 3)", "test src\\l*b.rs - add (line 3)"),
    posix(input).replace("test src/lib.rs - add (line 3)", "test src\\lib.rs - add (line 3)")]) {
    assert.notEqual(output, input); exact(observation(c, output, command));
  }
  accepted(observation(c, posix(input), command), posix(keep(input, 2, 3, 6, 12, 14, 20, 22, 29, 31, 37)));
  // Original parser: same rule on its own doc grammar (empty doctest suite given one row).
  const native = byName("native-lib"), text = read(native.file);
  const withDoc = (path: string) => text.replace("running 0 tests\n\ntest result: ok. 0 passed;",
    `running 1 test\ntest ${path} - f (line 1) ... ok\n\ntest result: ok. 1 passed;`);
  for (const [path, ok] of [["src\\lib.rs", true], ["native.rs", true], ["src/lib.rs", false], ["src\\a/lib.rs", false]] as const) {
    const output = withDoc(path), obs = observation(native, output);
    assert.equal(legacy.reduce(output, obs) !== undefined, ok, path);
    if (ok) assert.equal(filter(obs, { profiles: familyProfiles }).status, "reduced", path);
    else exact(obs);
  }
});

test("WIN-C02 review: forbidden component characters, `.`/`..` UNC servers decline; lowercase drives reduce", () => {
  const c = byName("absolute-target"), input = read(c.file), expected = read(c.expectedFile), header = rows(input)[2]!;
  const mutate = (from: string, to: string) => { assert.ok(header.includes(from), from); return input.replace(header, header.replace(from, to)); };
  for (const bad of [":", "*", "?", "\"", "<", ">", "|"]) {
    exact(observation(c, mutate("runneradmin", `runner${bad}admin`)));
    exact(observation(c, mutate("unittests src\\lib.rs", `unittests src\\li${bad}b.rs`)));
    exact(observation(c, mutate("c02w-1e8182a8e4a3fcbe.exe", `c02w${bad}1e8182a8e4a3fcbe.exe`)));
  }
  for (const root of ["\\\\.\\C$\\", "\\\\..\\C$\\", "\\\\?\\UNC\\.\\C$\\", "\\\\?\\UNC\\..\\C$\\"]) {
    exact(observation(c, mutate("C:\\", root)));
  }
  accepted(observation(c, mutate("C:\\", "\\\\..x\\C$\\")), expected.replace("C:\\", "\\\\..x\\C$\\"));
  for (const lower of ["c:\\", "\\\\?\\c:\\"]) accepted(observation(c, mutate("C:\\", lower)), expected.replace("(C:\\", `(${lower}`));
});

test("WIN-C02 review: CRLF host rendering of all twelve captures keeps every disposition", () => {
  for (const c of cases) {
    const crlf = read(c.file).replaceAll("\n", "\r\n");
    if (c.status === "reduced") accepted(observation(c, crlf), read(c.expectedFile).replaceAll("\n", "\r\n"));
    else exact(observation(c, crlf));
  }
});

test("WIN-C02 review: 1 MB header and doc lines decline in bounded time on both parsers", () => {
  const c = byName("native-lib"), input = read(c.file), header = rows(input)[2]!, mb = 1 << 20;
  const lines = [
    `     Running unittests ${"a".repeat(mb)} (target\\debug\\deps\\x-0123456789abcdef.exe)\n`,
    `     Running unittests ${"a\\".repeat(mb / 2)}.rx (target\\debug\\deps\\x-0123456789abcdef.exe)\n`,
    `     Running unittests src\\lib.rs (C:\\${"a\\".repeat(mb / 2)}targe\\debug\\deps\\x-0123456789abcdef.exe)\n`,
    `     Running unittests src\\lib.rs (\\\\${"a".repeat(mb)}\\s\\target\\debug\\deps\\x.ex)\n`,
    `     Running unittests src/lib.rs (/${"a/".repeat(mb / 2)}targe/debug/deps/x-0123456789abcdef)\n`,
    `     Running unittests src\\lib.rs (target\\debug\\deps\\${"x".repeat(mb)}.ex)\n`,
  ];
  for (const line of lines) {
    for (const command of ["cargo test", "cargo test --offline --color never"]) {
      const output = input.replace(header, line), obs = observation(c, output, command), start = performance.now();
      assert.equal(profile.reduce(output, obs), undefined);
      assert.equal(legacy.reduce(output, obs), undefined);
      assert.ok(performance.now() - start < 2000, `slow decline: ${line.slice(0, 40)} ${performance.now() - start}ms`);
    }
  }
  const doc = input.replace("running 0 tests\n\ntest result: ok. 0 passed;",
    `running 1 test\ntest ${"a\\".repeat(mb / 2)}b.rx - f (line 1) ... ok\n\ntest result: ok. 1 passed;`);
  const start = performance.now();
  assert.equal(profile.reduce(doc, observation(c, doc)), undefined);
  assert.ok(performance.now() - start < 2000, "slow doc decline");
});
