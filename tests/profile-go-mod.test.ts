import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import test from "node:test";
import { filter } from "../src/core/index.js";
import type { Observation } from "../src/core/types.js";
import { familyProfiles } from "../src/profiles/go-mod.js";
import { goProfile } from "../src/profiles/go.js";

const base = new URL("../fixtures/profiles/go-mod/", import.meta.url);
type NativeCase = Observation & {
  name: string; argv: string[]; file: string; expectedFile?: string;
  provenance: { sha256: string };
  snapshots: { before: Record<string, string | null>; after: Record<string, string | null> };
  sourceHashes: Record<string, { before: string; after: string }>;
};
const manifest = JSON.parse(readFileSync(new URL("cases.json", base), "utf8")) as {
  schema: string; cases: NativeCase[];
};
const options = { profiles: familyProfiles };
const output = "go: downloading golang.org/x/text v0.29.0\ngo: added golang.org/x/text v0.29.0\n";
const change = "go: added golang.org/x/text v0.29.0\n";
const observation = (text = output, command = "go get golang.org/x/text"): Observation => ({
  source: "shell", command, output: text, termination: { kind: "exited", code: 0 },
  completeness: "complete", presentation: "unknown",
});
const exact = (value: Observation) => {
  const result = filter(value, options);
  assert.equal(result.status, "passthrough");
  assert.equal("replacement" in result, false);
};

test("G05 native captures: independent ordered-subset goldens and source evidence", () => {
  assert.equal(manifest.schema, "hugr-lean/native-cases/1");
  assert.equal(manifest.cases.length, 19);
  for (const entry of manifest.cases) {
    const raw = readFileSync(new URL(entry.file, base), "utf8");
    assert.equal(raw, entry.output, entry.name);
    assert.equal(createHash("sha256").update(raw).digest("hex"), entry.provenance.sha256);
    assert.equal(entry.command, entry.argv.join(" "));
    for (const [path, hashes] of Object.entries(entry.sourceHashes)) {
      assert.equal(entry.snapshots.before[path], entry.snapshots.after[path]);
      assert.equal(createHash("sha256").update(entry.snapshots.before[path]!).digest("hex"), hashes.before);
      assert.equal(hashes.before, hashes.after);
    }
    const value = { ...entry, source: "shell" as const };
    if (!entry.expectedFile) { exact(value); continue; }
    const golden = readFileSync(new URL(entry.expectedFile, base), "utf8");
    assert(golden.endsWith("\n"));
    let cursor = 0;
    for (const row of golden.match(/[^\n]*\n/g)!) {
      const offset = raw.indexOf(row, cursor);
      assert(offset >= cursor);
      cursor = offset + row.length;
    }
    const result = filter(value, options);
    assert.equal(result.status, "reduced", entry.name);
    assert.equal("replacement" in result ? result.replacement : undefined, golden);
    assert.equal(result.inputBytes - result.outputBytes, Buffer.byteLength(raw) - Buffer.byteLength(golden));
    assert.equal(result.inputBytes - result.outputBytes, {
      "G05/get-default-added": 42, "G05/get-default-upgraded": 43, "G05/get-default-multiple": 88,
    }[entry.name]);
    assert.equal(goProfile.match(entry.argv), false);
  }
});

test("G05 authored bounded proxy source has pinned module bytes", () => {
  const proxy = JSON.parse(readFileSync(new URL("proxy-sources.json", base), "utf8")) as {
    baseline: string; modules: {
      module: string; version: string; files: Record<string, string>; originalSource?: Record<string, string>;
    }[];
  };
  assert.equal(proxy.baseline, "bc5e12fc78aa190a9ec9863ca41cd96e4e3a0ea0");
  assert.deepEqual(proxy.modules.map(entry => `${entry.module}@${entry.version}`), [
    "golang.org/x/text@v0.29.0", "example.com/g05/dep@v1.0.0", "example.com/g05/dep@v1.1.0",
    "example.com/g05/other@v1.0.0", "example.com/g05/other@v1.1.0",
  ]);
  for (const entry of proxy.modules) {
    for (const sha of Object.values(entry.files)) assert.match(sha, /^[a-f0-9]{64}$/);
    if (!entry.originalSource) continue;
    const prefix = `${entry.module}@${entry.version}/`;
    assert.equal(createHash("sha256").update(entry.originalSource[prefix + "go.mod"]!).digest("hex"), entry.files[entry.version + ".mod"]);
    assert.equal(entry.originalSource[prefix + "dep.go"], "package dep\n");
  }
});

test("G05 malformed, unpaired, duplicate, unknown and non-module rows stay exact", () => {
  const downloading = "go: downloading golang.org/x/text v0.29.0\n";
  for (const text of [
    downloading, change, "", output.replace("v0.29.0\n", "v0.28.0\n"),
    output + change, downloading + output, change + downloading,
    output + "application log\n", "application log\n" + output,
    output + "go: warning: deprecated: use replacement\n",
    output + "go: upgraded go 1.24.0 => 1.25.0\n",
    output + "go: added toolchain go1.25.0\n",
    output.replaceAll("v0.29.0", "go1.29"), output.replaceAll("v0.29.0", "v01.29.0"),
    output.replaceAll("golang.org/x/text", "go"),
    output.replaceAll("golang.org/x/text", "bad//module"),
    output.replace("go: added", "go: removed"), output.slice(0, -1),
    output.replaceAll("\n", "\r\n"), output + "\n", "{\"schema\":\"unknown\"}\n",
    downloading + "go: upgraded golang.org/x/text v0.29.0 => v0.29.0\n",
  ]) exact(observation(text));
});

test("G05 complete original command, finite flags and exit metadata are mandatory", () => {
  for (const command of [
    "go get -v golang.org/x/text", "go get -x golang.org/x/text", "go get -u golang.org/x/text",
    "go get -t golang.org/x/text", "go get -- golang.org/x/text", "go get -v -v golang.org/x/text",
    "go get ./...", "go get golang.org/x/text@v0.29.0", "go get; echo hi",
    "go mod tidy -v", "go mod download", "go mod download -json", "go mod download -x",
    "go build", "go run .", "go test", "env go get golang.org/x/text",
  ]) exact(observation(output, command));
  for (const metadata of [
    { termination: { kind: "exited", code: 1 } },
    { termination: { kind: "unknown" } }, { termination: { kind: "timed_out" } },
    { completeness: "truncated" }, { completeness: "unknown" }, { source: "other" },
  ] as Partial<Observation>[]) exact({ ...observation(), ...metadata });
  const profile = familyProfiles[0]!;
  assert.equal(profile.id, "go-mod");
  assert.equal(familyProfiles.length, 1);
  assert.equal(profile.match(["go", "get", "golang.org/x/text"]), true);
  assert.equal(profile.match(["go", "mod", "tidy", "-v"]), true);
  assert.equal(profile.match(["go", "mod", "download", "-json"]), true);
  for (const args of [["go", "test"], ["go", "run"], ["go", "get", "-future"], ["go", "mod", "vendor"]]) {
    assert.equal(profile.match(args), false);
  }
});

test("G05 generic module/version grammar; every change is required source evidence", () => {
  const text = "go: downloading example.net/pkg/v2 v2.3.4-beta.1\n" +
    "go: upgraded example.net/pkg/v2 v2.3.3 => v2.3.4-beta.1\n";
  const value = observation(text, "go get example.net/pkg/v2");
  const reduction = familyProfiles[0]!.reduce(text, value);
  assert(reduction);
  assert.deepEqual(reduction.required, [[text.indexOf("go: upgraded"), text.length]]);
  assert.deepEqual(reduction.pieces, reduction.required);
  const result = filter(value, options);
  assert.equal(result.status, "reduced");
  assert.equal("replacement" in result ? result.replacement : undefined, text.slice(text.indexOf("go: upgraded")));
});

test("G05 every known change survives, including earlier unrelated additions", () => {
  const earlier = "go: added example.net/earlier v1.2.3\n";
  const text = earlier + output;
  const value = observation(text);
  const result = filter(value, options);
  assert.equal(result.status, "reduced");
  assert.equal("replacement" in result ? result.replacement : undefined, earlier + change);
  const reduction = familyProfiles[0]!.reduce(text, value)!;
  assert.deepEqual(reduction.required, [[0, earlier.length], [earlier.length + output.indexOf(change), text.length]]);
  const unpaired = "go: downloading example.net/absent v1.0.0\n";
  exact(observation(unpaired + output));
  exact(observation(output + "go: upgraded golang.org/x/text v0.28.0 => v0.30.0\n"));
});

test("G05 invalid observation schema and direct reducer boundary preserve original", () => {
  for (const invalid of [
    { ...observation(), termination: { kind: "exited", code: "0" } },
    { ...observation(), completeness: "invalid" },
    { ...observation(), presentation: "invalid" },
    { ...observation(), source: "invalid" },
  ]) {
    const result = filter(invalid as unknown as Observation, options);
    assert.equal(result.status, "failed_open");
    assert.equal("replacement" in result, false);
  }
  const profile = familyProfiles[0]!;
  for (const value of [
    observation(output, "go get -v golang.org/x/text"),
    observation(output, "go mod download"),
    { ...observation(), completeness: "unknown" as const },
    { ...observation(), source: "other" as const },
    { ...observation(), termination: { kind: "exited" as const, code: 1 } },
    { ...observation(), output: output + "unknown\n" },
  ]) assert.equal(profile.reduce(output, value), undefined);
});
