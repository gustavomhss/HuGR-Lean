import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { automaticFamilyIds, automaticReducers, classifyAutomatic, filterAutomatic, type AutomaticFamilyId,
  type AutomaticObservation } from "../src/core/index.js";
import { reduceAutomaticJson } from "../src/profiles/auto-json.js";

const native = (tool: string, output: string, args = {}, metadata = {}): AutomaticObservation => ({ source: "native", tool, output,
  args, metadata: { truncated: false, ...metadata }, status: "success", completeness: "complete" });
const bash = (command: string, output: string) => native("bash", output, { command }, { exit: 0 });
const mcp = (tool: string, output: string): AutomaticObservation => ({ ...native(tool, output), source: "mcp", metadata: {} });
const files = JSON.parse(readFileSync(new URL("../fixtures/automatic/files/native.json", import.meta.url), "utf8")) as Record<string, string>;
const ff = JSON.parse(readFileSync(new URL("../fixtures/automatic/cli/darwin-ffmpeg-audio.json", import.meta.url), "utf8")) as { argv: string[]; original: string };
const ax = JSON.stringify({ nodes: Array.from({ length: 8 }, (_, i) => ({ nodeId: String(i), ignored: false,
  role: { type: "role", value: "button" }, name: { type: "computedString", value: `東京😀 ${i}` } })) }, null, 2);
const playwright = '### Snapshot\n```yaml\n- button "東京😀" [ref=e1]\n- button "B" [ref=e2]\n```\n';
const devtools = '## Latest page snapshot\nuid=1_0 RootWebArea "Page"\n  uid=1_1 button "東京😀"\n';
const cases: [AutomaticFamilyId, AutomaticObservation][] = [
  ["native-glob", native("glob", files.glob!, {}, { count: files.glob!.split("\n").length })],
  ["native-grep", native("grep", files.grep!, {}, { matches: 3 })],
  ["native-read-directory", native("read", files.directory!, { filePath: "/workspace/project with spaces/日本語😀" })],
  ["cli-ps", bash("ps -axo pid,ppid,stat,comm", "  PID  PPID STAT COMM\n    1     0 Ss   /sbin/launchd\n")],
  ["cli-ls", bash("ls -l", "total 8\n-rw-r--r--  1 owner  staff  5 Oct 10 12:34 file 東京😀\n")],
  ["cli-json-producers", bash("curl https://example.invalid", ' { "x": "東京😀" } ')],
  ["cli-ffmpeg", bash(ff.argv.join(" "), ff.original)],
  ["mcp-browser-snapshot", mcp("server_browser_snapshot", playwright)],
  ["mcp-devtools-snapshot", mcp("server_take_snapshot", devtools)],
  ["mcp-cdp-accessibility", mcp("server_cdp", ax)],
  ["mcp-json", mcp("server_inventory", ' { "x": "東京😀" } ')],
];

for (const [family, observation] of cases) {
  test(`${family} is publicly reachable and disabled before broader reducers`, () => {
    assert.equal(classifyAutomatic(observation), family);
    const entry = automaticReducers.find(entry => entry.id === family)!;
    assert.ok(entry); assert.ok(Object.isFrozen(entry)); assert.ok(entry.reduce(observation));
    const result = filterAutomatic(observation, { reducers: [entry] });
    assert.equal(result.status, "reduced"); assert.ok("replacement" in result); assert.equal(result.profile, family);
    const enabledFamilies = automaticFamilyIds.filter(id => id !== family);
    for (const options of [{ enabledFamilies }, { reducers: automaticReducers.filter(entry => entry.id !== family) }]) {
      const disabled = filterAutomatic(observation, options);
      assert.equal(disabled.status, "passthrough"); assert.equal("replacement" in disabled, false);
      assert.equal(disabled.inputBytes, Buffer.byteLength(observation.output)); assert.equal(disabled.outputBytes, disabled.inputBytes);
    }
    // A host deliberately offering even a broad custom JSON reducer cannot bypass an explicit toggle.
    assert.equal(filterAutomatic(observation, { enabledFamilies, reducers: [{ id: "broad", reduce: reduceAutomaticJson }] }).status, "passthrough");
    for (const other of automaticReducers.filter(entry => entry.id !== family)) assert.equal(other.reduce(observation), undefined);
    assert.deepEqual(filterAutomatic(observation), result);
  });
}

test("registry IDs are stable, unique, frozen and only ffmpeg declares evidence loss", () => {
  assert.deepEqual(automaticFamilyIds, cases.map(([family]) => family));
  assert.ok(Object.isFrozen(automaticReducers)); assert.ok(Object.isFrozen(automaticFamilyIds));
  assert.deepEqual(automaticReducers.filter(entry => entry.lossy).map(entry => entry.id), ["cli-ffmpeg"]);
});

test("CDP identity survives grammar refusals and all supported envelopes, blocking JSON when disabled", () => {
  const nodes = [{ nodeId: "duplicate", ignored: false }, { nodeId: "duplicate", ignored: false }];
  for (const payload of [{ nodes }, { id: 1, result: { nodes } }, { accessibility: { nodes } }, { nodes: [] }]) {
    const observation = mcp("server_any", JSON.stringify(payload, null, 2));
    assert.equal(classifyAutomatic(observation), "mcp-cdp-accessibility");
    // Enabled family may use its existing lossless lexical view on a valid JSON grammar refusal.
    assert.equal(filterAutomatic(observation).status, "reduced");
    const result = filterAutomatic(observation, { reducers: automaticReducers.filter(entry => entry.id === "mcp-json") });
    assert.equal(result.status, "passthrough"); assert.equal("replacement" in result, false);
  }
  const escaped = mcp("server_any", '{ "\\u006eodes": [ { "nodeId": "1", "ignored": false } ] }');
  assert.equal(classifyAutomatic(escaped), "mcp-cdp-accessibility");
});

test("legacy recognized identities take precedence over JSON overlap, including refuses and toggles", () => {
  let calls = 0;
  const reducers = [{ id: "broad-json", reduce: (observation: AutomaticObservation) => { calls++; return reduceAutomaticJson(observation); } }];
  // Broad JSON reducers must never admit an output refused by a recognized shell grammar.
  for (const command of ["python -m pytest", "node --test", "cargo test", "git status", "go test -json ./..."]) {
    const observation = bash(command, ' { "x": 1 } '), family = classifyAutomatic(observation);
    assert.ok(family?.startsWith("legacy:"), command);
    const refused = filterAutomatic(observation, { reducers });
    assert.equal(refused.status, "passthrough"); assert.equal("replacement" in refused, false);
    assert.equal(filterAutomatic(observation, { reducers, enabledFamilies: automaticFamilyIds }).reason, "disabled_family");
  }
  const observation = bash("python -m pytest", ' { "x": 1 } ');
  const legacyFilter = () => ({ status: "reduced" as const, reason: "probe", replacement: "legacy", profile: "pytest", inputBytes: 12, outputBytes: 6 });
  assert.deepEqual(filterAutomatic(observation, { reducers, legacyFilter }), legacyFilter());
  for (const reason of ["unsupported_output", "not_smaller", "unsupported_command", "no_profile"]) {
    const refusal = { status: "passthrough" as const, reason, inputBytes: observation.output.length, outputBytes: observation.output.length };
    assert.deepEqual(filterAutomatic(observation, { reducers, legacyFilter: () => refusal }), refusal);
  }
  assert.equal(calls, 0);
});

test("classification is deterministic, independent of size/availability, and safe on malformed input", () => {
  for (const [, observation] of cases) assert.equal(classifyAutomatic(Object.freeze(observation)), classifyAutomatic(observation));
  assert.equal(classifyAutomatic(bash("ps aux", "unrecognized output")), "cli-ps");
  assert.equal(classifyAutomatic(mcp("browser_snapshot", '{ "x": 1 } ')), "mcp-browser-snapshot");
  assert.equal(classifyAutomatic(native("read", files.file!, { filePath: "/file" })), undefined);
  assert.equal(classifyAutomatic(bash("curl x | jq .", ' { "x": 1 } ')), undefined);
  assert.equal(classifyAutomatic(mcp("unknown", "unknown evidence")), undefined);
  for (const value of [null, {}, { tool: "x" }, { get tool() { throw new Error("bad"); } }]) assert.equal(classifyAutomatic(value as never), undefined);
  for (const output of [' { "x": 1 } ', ' { "x": 1 } \n { "x": 2 } \n']) {
    for (const status of ["success", "failure", "unknown"] as const) {
      for (const completeness of ["complete", "truncated", "unknown"] as const) {
        assert.equal(classifyAutomatic({ ...mcp("inventory", output), status, completeness }), "mcp-json");
      }
    }
  }
});
