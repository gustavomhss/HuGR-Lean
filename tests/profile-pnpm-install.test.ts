import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { filter } from "../src/core/index.js";
import type { Observation } from "../src/core/types.js";
import { tokenizeCommand } from "../src/core/command.js";
import { familyProfiles } from "../src/profiles/pnpm-install.js";

const root = new URL("../fixtures/profiles/pnpm-install/", import.meta.url);
const raw = (name: string): string => readFileSync(new URL(name, root), "utf8");
interface Case {
  name: string; command: string; file: string; expectedFile?: string; status: string;
  termination: Observation["termination"]; completeness: Observation["completeness"];
  presentation: Observation["presentation"];
  provenance: { argv: string[]; sha256: string };
}
const cases: Case[] = JSON.parse(raw("cases.json")).cases;
const safe = ["safe-cold", "safe-cache", "safe-offline", "safe-workspace", "safe-peer", "safe-deprecated", "safe-frozen-fresh"];
const command = "pnpm install --ignore-scripts --ignore-pnpmfile";
function observation(output: string, cmd = command): Observation {
  return { source: "shell", command: cmd, output, termination: { kind: "exited", code: 0 },
    completeness: "complete", presentation: "unknown" };
}
function run(output: string, cmd = command) {
  return filter(observation(output, cmd), { profiles: familyProfiles });
}
function exact(output: string, cmd = command) {
  const result = run(output, cmd);
  assert.equal(result.status, "passthrough");
  assert.equal("replacement" in result, false);
  assert.equal(result.inputBytes, Buffer.byteLength(output));
  assert.equal(result.outputBytes, result.inputBytes);
}

test("P02/native index authenticates actual argv and unchanged raw captures", () => {
  assert.equal(cases.length, 28);
  assert.equal(new Set(cases.map(c => c.name)).size, cases.length);
  for (const c of cases) {
    assert.deepEqual(tokenizeCommand(c.command), c.provenance.argv, c.name);
    assert.equal(createHash("sha256").update(raw(c.file)).digest("hex"), c.provenance.sha256, c.name);
    assert.notEqual(createHash("sha256").update(raw(c.file) + "mutation").digest("hex"), c.provenance.sha256);
    assert.equal(c.status, safe.some(name => c.name === `P02/${name}`) ? "reduced" : "passthrough", c.name);
  }
});
test("P02/manifest walk includes every native text input and golden, omission control fails", () => {
  const disk = readdirSync(root, { recursive: true }).filter(file => file.endsWith(".txt")).sort();
  const declared = (index: readonly Case[]) => index.flatMap(c => c.expectedFile ? [c.file, c.expectedFile] : [c.file]).sort();
  assert.ok(disk.includes("install-help.txt"));
  assert.deepEqual(declared(cases), disk);
  assert.throws(() => assert.deepEqual(declared(cases.filter(c => c.file !== "install-help.txt")), disk));
});
for (const name of safe) test(`P02/${name} direct native golden reduces baseline`, () => {
  const c = cases.find(c => c.name === `P02/${name}`)!;
  const obs: Observation = { source: "shell", ...c, output: raw(c.file) };
  assert.equal(filter(obs, { profiles: [] }).status, "passthrough");
  const result = filter(obs, { profiles: familyProfiles });
  assert.equal(result.status, "reduced");
  if (result.status !== "reduced") return;
  assert.equal(result.profile, "pnpm-install");
  assert.equal(c.expectedFile, `${name}.expected.txt`);
  assert.equal(result.replacement, raw(c.expectedFile!));
  assert.equal(result.inputBytes - result.outputBytes, 114);
});

test("P02/old Node metadata, scripts-only producer safety and native lifecycle hooks stay exact", () => {
  for (const c of cases.filter(c => !safe.some(name => c.name === `P02/${name}`))) {
    const result = filter({ source: "shell", ...c, output: raw(c.file) }, { profiles: familyProfiles });
    assert.equal(result.status, "passthrough", c.name);
    assert.equal("replacement" in result, false, c.name);
  }
  const output = raw("safe-cold.txt");
  exact(output, "pnpm install --ignore-scripts");
  exact(output, "pnpm install --ignore-pnpmfile");
  exact(raw("lifecycle-enabled.txt"));
  exact(raw("hook-enabled.txt"));
  exact(raw("local-install.txt")); // Unknown update advice refuses whole transcript.
  assert.ok(raw("hook-enabled.txt").includes("opaque pnpmfile evidence λ"));
  assert.ok(raw("hook-enabled.txt").includes("Progress: resolved 6, reused 6, downloaded 0, added 6, done\n"));
});

test("P02/closed original flag arity and launcher grammar", () => {
  assert.equal(familyProfiles.length, 1);
  const profile = familyProfiles[0]!;
  assert.ok(profile.match(["pnpm", "install", "--ignore-pnpmfile", "--offline", "--ignore-scripts", "--store-dir", "/tmp/custom-store"]));
  for (const cmd of ["pnpm i", "pnpm install", `${command} --ignore-scripts`,
    `${command} --ignore-pnpmfile=false`, `${command} --ignore-scripts=false`,
    `${command} --store-dir`, `${command} --store-dir --offline`, `${command} --offline=yes`,
    `${command} --reporter=ndjson`, `${command} --strict-peer-dependencies`, `${command} chalk`,
    `npx ${command}`, `node pnpm.cjs install --ignore-scripts --ignore-pnpmfile`,
    `${command} --config.ignore-pnpmfile=false`, `${command} --pnpmfile malicious.cjs`,
    `${command} --offline --offline`, `${command} --`, `${command} && echo collision`]) {
    exact(raw("safe-cold.txt"), cmd);
  }
});

test("P02/malformed progress, final counters, phase, end and unknown lines refuse", () => {
  const output = raw("safe-cold.txt");
  for (const altered of [
    output.replace("resolved 1", "resolved 01"), output.replace("resolved 1", "resolved -1"),
    output.replace("resolved 1", "resolved 1000001"), output.replace("resolved 1", "resolved 1.0"),
    output.replace("downloaded 6", "downloaded 7"), output.replace("added 6, done", "added 5, done"),
    output.replace("resolved 6", "resolved 7"), output.replace("resolved 1", "resolved 7"),
    output.replace("Packages: +6", "Packages: +7"), output.replace("++++++", "+++++"),
    output.replace(", done", ""), output.replace(", done", ", done, done"),
    output.replace("Packages: +6\n++++++\n", ""), output.replace("Done in 758ms using pnpm v10.18.3\n", ""),
    output.trimEnd(), output + "opaque log\n", output.replace("dependencies:", "unknown-section:"),
    output.replace("dependencies:", "Progress: resolved 6, reused 0, downloaded 6, added 6, done\ndependencies:"),
    output.replace("\n", "\r\n"), output.replace("Packages:", "\x1b[32mPackages:"),
    output.replace("Packages:", "\u202ePackages:"), output.replace("Progress:", "progress:"),
    output.replace("v10.18.3", "v11.0.0"), output.replace("+ chalk 4.1.2", "+ chalk invalid-version"),
    output.replace("Packages: +6", "opaque progress-phase log\nPackages: +6"),
  ]) exact(altered);
  for (const metadata of [{ completeness: "truncated" as const }, { completeness: "unknown" as const },
    { termination: { kind: "exited" as const, code: 1 } }, { termination: { kind: "timed_out" as const } },
    { source: "other" as const }, { presentation: "terminal-rendered" as const }]) {
    assert.equal(filter({ ...observation(output), ...metadata }, { profiles: familyProfiles }).status, "passthrough");
  }
});

test("P02/warning context and all nonprogress tokens are required source spans", () => {
  const output = raw("safe-deprecated.txt");
  const reduction = familyProfiles[0]!.reduce(output, observation(output))!;
  assert.ok(reduction);
  assert.deepEqual(reduction.pieces, reduction.required);
  const retained = reduction.required.map(span => output.slice(...span)).join("");
  assert.equal(retained, raw("safe-deprecated.expected.txt"));
  for (const token of ["WARN", "deprecated", "unmet peer", "^2.0.0", "found 1.0.0", "Done in", "pnpm v10.18.3"]) {
    assert.ok(retained.includes(token), token);
  }
  const workspace = run(raw("safe-workspace.txt"));
  assert.ok(workspace.status === "reduced" && workspace.replacement.includes("<- packages/member"));
  exact(output.replace("found 1.0.0", "found 3.0.0"));
  exact(output.replace("└─┬ p02-consumer 1.0.0", "└─┬ p02-consumer 9.0.0"));
  exact(output.replace("  └── ✕ unmet peer", "opaque peer log"));
});

test("P02/generic scoped package, path and semver identity, Unicode evidence retained", () => {
  const output = raw("safe-workspace.txt").replaceAll("chalk", "@acme/tool").replaceAll("4.1.2", "2.3.4-beta.1+build.7")
    .replaceAll("p02-member", "@else/member").replace("packages/member", "../modules/member-x");
  const result = run(output);
  assert.equal(result.status, "reduced");
  assert.ok(result.status === "reduced" && result.replacement.includes("@acme/tool 2.3.4-beta.1+build.7"));
  const unicode = raw("safe-deprecated.txt").replace("P02 original deprecated-package witness", "deprecated λ😀 advice: retain exact");
  const reduced = run(unicode);
  assert.ok(reduced.status === "reduced" && reduced.replacement.includes("λ😀 advice: retain exact"));
});
