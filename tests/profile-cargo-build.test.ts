import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { filter } from "../src/core/engine.js";
import { familyProfiles } from "../src/profiles/cargo-build.js";
import { cargoProfiles } from "../src/profiles/cargo.js";
import type { Observation } from "../src/types.js";

const root = new URL("../fixtures/profiles/cargo-build/", import.meta.url);
interface Case {
  name: string; family: string; command: string; file: string; expectedFile: string;
  status: "reduced" | "passthrough"; termination: Observation["termination"];
  completeness: Observation["completeness"]; presentation: Observation["presentation"];
}
const packet = JSON.parse(readFileSync(new URL("cases.json", root), "utf8")) as { cases: Case[] };
const read = (file: string): string => readFileSync(new URL(file, root), "utf8");
const profiles = process.env.C01_BASELINE === "1" ? cargoProfiles : familyProfiles;
const input = (c: Case): Observation => ({ source: "shell", command: c.command, output: read(c.file),
  termination: c.termination, completeness: c.completeness, presentation: c.presentation });
const find = (stem: string): Case => packet.cases.find(c => c.name === `C01/${stem}`)!;
function accepted(observation: Observation, expected: string, id: string): void {
  const result = filter(observation, { profiles });
  assert.equal(result.status, "reduced", `${observation.command}: ${result.reason}`);
  if (result.status !== "reduced") assert.fail("missing reduction");
  assert.equal(result.profile, id);
  assert.equal(result.replacement, expected, "independent native golden, every byte in order");
  assert.equal(result.inputBytes, Buffer.byteLength(observation.output));
  assert.equal(result.outputBytes, Buffer.byteLength(expected));
  assert.ok(result.outputBytes < result.inputBytes);
}
function exact(observation: Observation): void {
  const result = filter(observation, { profiles });
  assert.equal(result.status, "passthrough", `${observation.command}: ${result.reason}`);
  assert.equal("replacement" in result, false);
  assert.equal(result.inputBytes, Buffer.byteLength(observation.output));
  assert.equal(result.outputBytes, result.inputBytes);
}

for (const c of packet.cases) {
  test(`${c.name}: ${c.status} independent native golden`, () => {
    const observation = input(c), expected = read(c.expectedFile);
    if (c.status === "reduced") accepted(observation, expected, c.family);
    else { assert.equal(observation.output, expected); exact(observation); }
  });
}

test("finite packet IDs and family subcommands have no overlap", () => {
  const required = "conditional-test-warning structural-build structural-check structural-check-buildscript release-workspace custom-package-lib release-bin-target release-example check-workspace check-custom-all-targets check-lib-target check-bin-examples build-warnings check-warnings build-collision build-cached check-cached build-failure check-custom-targets-success build-cached-clean check-collision build-all-features-targets".split(" ");
  assert.deepEqual(packet.cases.map(c => c.name).sort(), required.map(n => `C01/${n}`).sort());
  assert.deepEqual(familyProfiles.map(p => p.id), ["cargo-build", "cargo-check"]);
  for (const c of packet.cases) {
    assert.deepEqual(familyProfiles.filter(p => p.match(c.command.split(" "))).map(p => p.id), [c.family]);
  }
});

test("one existing default build fixture delegates with unchanged original behavior", () => {
  const output = readFileSync(new URL("../fixtures/runners/cargo_build_success.txt", import.meta.url), "utf8");
  const observation: Observation = { ...input(find("release-workspace")), command: "cargo build --color never", output };
  const original = filter(observation, { profiles: cargoProfiles });
  assert.equal(original.status, "reduced", "positive baseline fixture witness");
  assert.deepEqual(filter(observation, { profiles: familyProfiles }), original);
  const build = familyProfiles[0]!, baseline = cargoProfiles.find(p => p.id === "cargo-build")!;
  assert.deepEqual(build.reduce(output, observation), baseline.reduce(output, observation));
});

for (const c of packet.cases.filter(c => c.status === "reduced")) {
  test(`${c.name}: unknown row at every boundary refuses whole stream`, () => {
    const observation = input(c), rows = observation.output.split(/(?<=\n)/);
    for (let i = 0; i <= rows.length; i++) {
      exact({ ...observation, output: [...rows.slice(0, i), "C01 unknown user log café 🦀\n", ...rows.slice(i)].join("") });
    }
    exact({ ...observation, output: observation.output.replace(/^    Finished .*\n/m, "") });
    exact({ ...observation, output: observation.output + "    Finished `dev` profile [unoptimized + debuginfo] target(s) in 0.02s\n" });
  });
  test(`${c.name}: CRLF, Unicode before evidence and process metadata`, () => {
    const observation = input(c), expected = read(c.expectedFile);
    accepted({ ...observation, output: observation.output.replaceAll("\n", "\r\n") }, expected.replaceAll("\n", "\r\n"), c.family);
    accepted({ ...observation, output: observation.output.replaceAll("/opencode/", "/🦀café/") }, expected, c.family);
    for (const patch of [
      { termination: { kind: "exited", code: 101 } }, { termination: { kind: "unknown" } },
      { termination: { kind: "timed_out" } }, { completeness: "truncated" },
      { completeness: "unknown" }, { source: "other" },
    ] as const) {
      const variant = { ...observation, ...patch };
      exact(variant);
      assert.equal(familyProfiles.find(p => p.id === c.family)!.reduce(variant.output, variant), undefined);
    }
    for (const control of ["\x00", "\x1b[31m", "\x07", "\r", "\x7f", "\x85"]) {
      exact({ ...observation, output: observation.output.replace("    Finished", `${control}    Finished`) });
    }
  });
}

test("closed argv rejects unknown flags, missing values, duplicate flags and conflicts", () => {
  const observation = input(find("build-warnings"));
  const commands = [
    "cargo build --offline --future", "cargo check --offline --message-format=json",
    "cargo build --offline toString extra", "cargo check --offline __proto__ extra",
    "cargo build --offline constructor extra",
    "cargo build --offline --lib=true", "cargo build --offline --release=1",
    "cargo build --offline --workspace yes", "cargo build --offline --no-default-features true",
    "cargo build --offline --all-features extra", "cargo build --offline --all-targets lib",
    "cargo build --offline --bins bin", "cargo build --offline --examples tiny",
    "cargo build --offline -p", "cargo build --offline -p --lib", "cargo build --offline -p bad/name",
    "cargo build --offline --exclude", "cargo build --offline --exclude c01-peer",
    "cargo build --offline --features", "cargo build --offline --features --lib",
    "cargo build --offline --features extra,", "cargo build --offline --features extra,extra",
    "cargo build --offline --features bad//name", "cargo build --offline --target",
    "cargo build --offline --target --lib", "cargo build --offline --bin",
    "cargo build --offline --bin bad/name", "cargo build --offline --example",
    "cargo build --offline --example bad/name", "cargo build --offline --profile",
    "cargo build --offline --profile --lib", "cargo build --offline --profile bad/name",
    "cargo build --offline --release --profile small",
    "cargo build --offline --features warn --features extra", "cargo build --offline --color",
    "cargo build --offline --color always", "cargo build --offline --color never --color=never",
    "cargo build --offline --offline", "cargo build --offline -- --verbose",
    "cargo build --offline && echo", "cargo build --offline | cat", "cargo test --offline",
  ];
  for (const command of commands) {
    assert.equal(familyProfiles.some(p => p.match(command.split(" "))), false, command);
    exact({ ...observation, command });
  }
});

test("new reduction requires captured offline boundary; selector/profile arity valid", () => {
  for (const c of packet.cases.filter(c => c.status === "reduced")) {
    exact({ ...input(c), command: c.command.replace(" --offline", "") });
  }
});

test("counterfeit warning/context/totals cannot masquerade as supported compiler evidence", () => {
  const observation = input(find("check-custom-targets-success"));
  for (const [from, to] of [
    ["warning: function `unused_café` is never used", "warning: C01 user message"],
    ["warning: function `unused_café` is never used", "warning: c01-app@0.1.0: function `unused_café` is never used"],
    [" --> app/src/lib.rs:2:4", " --> app/src/lib.rs:0:4"],
    ["2 | fn unused_café() {}", "3 | fn unused_café() {}"],
    ["2 | fn unused_café() {}", "2 | fn counterfeit() {}"],
    ["  |    ^^^^^^^^^^^", "  |    ^^^"],
    ["  = note: `#[warn(dead_code)]` (part of `#[warn(unused)]`) on by default", "  = help: arbitrary producer log"],
    ["(lib test) generated 1 warning", "(lib test) generated 2 warnings"],
    ["(lib) generated 1 warning (1 duplicate)", "(lib) generated 1 warning (2 duplicates)"],
    ["(lib) generated 1 warning (1 duplicate)", "(lib) generated 1 warning"],
    ["warning: `c01-app` (lib test) generated 1 warning\n", ""],
    ["warning: `c01-app` (lib) generated 1 warning (1 duplicate)\n", "warning: `c01-app` (lib) generated 1 warning (1 duplicate)\nwarning: `c01-app` (lib) generated 1 warning (1 duplicate)\n"],
  ]) {
    assert.ok(observation.output.includes(from!));
    exact({ ...observation, output: observation.output.replaceAll(from!, to!) });
  }
  for (const stem of ["build-collision", "check-collision"]) {
    const collision = input(find(stem));
    assert.equal(familyProfiles.find(p => p.id === find(stem).family)!.reduce(collision.output, collision), undefined);
  }
});

test("wrong profile/optimization/duration/progress association and late progress refuse", () => {
  const observation = input(find("release-workspace"));
  for (const [from, to] of [
    ["`release`", "`dev`"], ["[optimized]", "[ultraoptimized]"],
    ["2.67s", "NaNs"], ["2.67s", "1m 02s"], ["target(s)", "targets"],
    ["v0.1.0", "vbad"], ["v0.1.0", "v0.1.0-alpha.01"], ["v0.1.0", "v00.1.0"],
    ["c01-app", "invalid/name"],
  ]) exact({ ...observation, output: observation.output.replaceAll(from!, to!) });
  exact({ ...observation, output: observation.output + observation.output.split("\n")[0] + "\n" });
  const warning = input(find("build-warnings"));
  exact({ ...warning, output: warning.output.replace("warning: function", "    Finished `dev` profile [unoptimized + debuginfo] target(s) in 0.02s\nwarning: function") });
});

test("synthetic property inputs: project values, versions, settings, dependency names are structural", () => {
  const c = find("structural-build"), observation = input(c);
  const pairs = [["atlas-service", "koi-api"], ["atlas-core", "delta-math"], ["ship", "debug-fast"],
    ["spark", "vector_math"], ["1.2.3-alpha.2", "7.8.9-beta.4+local"], ["1.9.0", "3.0.2"],
    ["2.4.0", "4.5.6"], ["src/engine.rs", "C:\\work repo\\logic.rs"],
    ["latent_café", "latent_δelt"], ["[unoptimized]", "[optimized + debuginfo]"]];
  const rename = (text: string) => pairs.reduce((value, [from, to]) => value.replaceAll(from!, to!), text);
  accepted({ ...observation, command: rename(observation.command), output: rename(observation.output) }, rename(read(c.expectedFile)), c.family);
  for (const description of ["unoptimized", "optimized", "unoptimized + debuginfo", "optimized + debuginfo"]) {
    accepted({ ...observation, output: observation.output.replace("[unoptimized]", `[${description}]`) },
      read(c.expectedFile).replace("[unoptimized]", `[${description}]`), c.family);
  }
  const warned = find("build-warnings");
  accepted({ ...input(warned), command: warned.command.replace(" --features warn", "") }, read(warned.expectedFile), warned.family);
});

test("synthetic argv properties: additive selectors, workspace packages, structural feature/target paths", () => {
  const c = find("structural-check"), observation = input(c), expected = read(c.expectedFile);
  for (const suffix of ["--examples --bins --all-targets --example another_demo", "--workspace --exclude other-package",
    "--target wasm32-unknown-unknown", "--target ./targets/custom.json", "--target targets/custom.json", "--target custom.json", "--target ../target specs/custom.json"]) {
    const addition = suffix === "--target ../target specs/custom.json" ? "--target '../target specs/custom.json'" : suffix;
    accepted({ ...observation, command: `${observation.command} ${addition}` }, expected, c.family);
  }
  for (const features of ["unseen", "other/fast", "vector_math,extra-mode"]) {
    accepted({ ...observation, command: observation.command.replace("--features spark", `--features '${features}'`) }, expected, c.family);
  }
  exact({ ...observation, command: observation.command.replace("--features spark", "--features 'other?/fast'") });
});

test("synthetic diagnostic properties: positions and counters derive from text, not fixture settings", () => {
  const c = find("structural-check"), observation = input(c);
  const moved = (text: string) => text.replace("src/engine.rs:3:4", "/work repo/module.rs:33:4")
    .replace("  |\n3 |", "   |\n33 |")
    .replace("  |    ^^^^^^^^^^^\n  |\n", "   |    ^^^^^^^^^^^\n   |\n")
    .replace("  = note:", "   = note:");
  accepted({ ...observation, output: moved(observation.output) }, moved(read(c.expectedFile)), c.family);
  accepted({ ...observation, output: observation.output.replaceAll("src/engine.rs", "../generated/code.inc") },
    read(c.expectedFile).replaceAll("src/engine.rs", "../generated/code.inc"), c.family);
  for (const [from, to] of [["generated 2 warnings", "generated 3 warnings"],
    ["generated 2 warnings", "generated 2 warning"], ["src/engine.rs:5:4", "src/engine.rs:5:0"],
    ["    Finished", "warning: atlas-service@1.2.3: native-shaped user log\n    Finished"]]) {
    exact({ ...observation, output: observation.output.replace(from!, to!) });
  }
  // A legal dependency can report diagnostics/progress between other package groups.
  const warning = find("build-warnings"), source = input(warning), required = read(warning.expectedFile);
  const first = source.output.replaceAll("c01-app", "first-dep").replace(/^    Finished .*\n/m, "");
  const second = source.output.replaceAll("c01-app", "second-dep");
  // Deletion phase closed at the first diagnostic: second package progress stays source-backed.
  const golden = required.replaceAll("c01-app", "first-dep").replace(/^    Finished .*\n/m, "") + second;
  accepted({ ...source, output: first + second }, golden, warning.family);
  accepted({ ...source, output: (first + second).replaceAll("first-dep", "shared-dep").replaceAll("second-dep", "shared-dep") },
    golden.replaceAll("first-dep", "shared-dep").replaceAll("second-dep", "shared-dep"), warning.family);
});

for (const stem of ["build-warnings", "check-warnings"]) {
  test(`phase preservation ${stem}: progress before total and after total remains exact`, () => {
    const c = find(stem), observation = input(c), required = read(c.expectedFile);
    const late = `${stem === "build-warnings" ? "   Compiling" : "    Checking"} audit-dep v3.2.1 (/work/🦀café/dep)\n`;
    for (const boundary of ["warning: `c01-app`", "    Finished"]) {
      accepted({ ...observation, output: observation.output.replace(boundary, late + boundary) },
        required.replace(boundary, late + boundary), c.family);
      accepted({ ...observation, output: observation.output.replace(boundary, late + boundary).replaceAll("\n", "\r\n") },
        required.replace(boundary, late + boundary).replaceAll("\n", "\r\n"), c.family);
      exact({ ...observation, output: observation.output.replace(boundary, late.replace("v3.2.1", "vbroken") + boundary) });
      exact({ ...observation, output: required.replace(boundary, late + boundary) }); // no leading removable bytes
    }
    exact({ ...observation, output: observation.output.replace("  |\n", late + "  |\n") });
  });
}

test("selector semantics: lib-only refuses counterfeit lib-test/bin-test and other selected targets", () => {
  const c = find("build-warnings"), observation = input(c), required = read(c.expectedFile);
  for (const context of ["lib test", 'bin "worker" test', 'bin "worker"', 'example "demo"']) {
    exact({ ...observation, output: observation.output.replace("(lib)", `(${context})`) });
  }
  for (const patch of ["--bin worker", "--bins", "--example demo", "--examples"]) {
    const command = observation.command.replace("--lib", patch);
    accepted({ ...observation, command }, required, c.family); // dependency libraries are always allowed
  }
  for (const [selector, context] of [["--bin worker", 'bin "worker"'], ["--bins", 'bin "worker"'],
    ["--example demo", 'example "demo"'], ["--examples", 'example "demo"'],
    ["--all-targets", "lib test"], ["--all-targets", 'bin "worker" test']]) {
    const command = observation.command.replace("--lib", selector!);
    accepted({ ...observation, command, output: observation.output.replace("(lib)", `(${context})`) },
      required.replace("(lib)", `(${context})`), c.family);
  }
  exact({ ...observation, command: observation.command.replace("--lib", "--bin chosen"),
    output: observation.output.replace("(lib)", '(bin "different")') });
  exact({ ...observation, command: observation.command.replace("--lib", "--example chosen"),
    output: observation.output.replace("(lib)", '(example "different")') });
  const foreign = observation.output.replaceAll("c01-app", "dependency-pkg");
  accepted({ ...observation, output: foreign }, required.replaceAll("c01-app", "dependency-pkg"), c.family);
  exact({ ...observation, command: observation.command.replace("--lib", "--all-targets"), output: foreign.replace("(lib)", "(lib test)") });
  accepted({ ...observation, command: observation.command.replace("--lib", "--all-targets --workspace"), output: foreign.replace("(lib)", "(lib test)") },
    required.replaceAll("c01-app", "dependency-pkg").replace("(lib)", "(lib test)"), c.family);
});

test("conditional summaries: native unpaired lib-test valid; pending diagnostics need totals", () => {
  const c = find("conditional-test-warning"), observation = input(c), required = read(c.expectedFile);
  accepted(observation, required, c.family);
  assert.equal(input(find("check-custom-targets-success")).output.includes("(lib) generated"), true, "normal-lib summary detector positive control");
  assert.equal(observation.output.includes("(lib) generated"), false, "native cfg(test) control has no normal-lib total");
  exact({ ...observation, command: "cargo check --lib --offline --color never" });
  exact({ ...observation, output: observation.output.replace("warning: `conditional-warning` (lib test) generated 1 warning\n", "") });
  const paired = find("check-custom-targets-success"), pair = input(paired);
  // Optional duplicate-only summary is independent evidence; no fabricated absence guarantee.
  const duplicate = "warning: `c01-app` (lib) generated 1 warning (1 duplicate)\n";
  accepted({ ...pair, output: pair.output.replace(duplicate, "") }, read(paired.expectedFile).replace(duplicate, ""), paired.family);
});
