import assert from "node:assert/strict";
import test from "node:test";
import { filterAutomatic } from "../src/core/automatic.js";
import type { AutomaticObservation } from "../src/core/automatic-types.js";
import { tokenizeAutomaticCommand } from "../src/core/automatic-command.js";

const input = (output: string): AutomaticObservation => ({ source: "mcp", tool: "actual_tool", output, args: {}, metadata: {}, status: "success", completeness: "complete" });
const tail = [{ id: "probe", reduce: () => ({ pieces: [[0, 2] as const], required: [[0, 2] as const] }) }];
test("automatic core preserves failures and incomplete observations before any reducer", () => {
  let calls = 0;
  const reducers = [{ id: "probe", reduce: () => { calls++; return undefined; } }];
  for (const patch of [{ status: "failure" }, { status: "unknown" }, { completeness: "truncated" }, { completeness: "unknown" }]) {
    const result = filterAutomatic({ ...input("ab    "), ...patch } as AutomaticObservation, { reducers });
    assert.equal(result.status, "passthrough"); assert.equal("replacement" in result, false);
  }
  assert.equal(calls, 0);
  assert.equal(filterAutomatic(input("ab    "), { reducers: tail }).status, "reduced");
});
test("automatic shell keeps genuine exit/completeness and literal command admission", () => {
  const base = { ...input("ab    "), source: "native" as const, tool: "bash", args: { command: "new-producer" } };
  for (const metadata of [{}, { exit: 1, truncated: false }, { exit: 0 }, { exit: null, truncated: false }]) {
    assert.equal(filterAutomatic({ ...base, metadata }, { reducers: tail }).status, "passthrough");
  }
  assert.equal(filterAutomatic({ ...base, metadata: { exit: 0, truncated: false } }, { reducers: tail }).status, "reduced");
  assert.equal(filterAutomatic({ ...base, args: { command: "first | second" }, metadata: { exit: 0, truncated: false } }, { reducers: tail }).status, "passthrough");
});
test("automatic native expansion never bypasses a legacy grammar refusal", () => {
  let calls = 0;
  const legacyFilter = () => ({ status: "passthrough" as const, reason: "unsupported_output", inputBytes: 6, outputBytes: 6 });
  const result = filterAutomatic({ ...input("ab    "), source: "native", tool: "bash", args: { command: "pytest" }, metadata: { exit: 0, truncated: false } },
    { legacyFilter, reducers: [{ id: "probe", reduce: () => { calls++; return undefined; } }] });
  assert.equal(result.status, "passthrough"); assert.equal(calls, 0);
});
test("automatic shared renderer rejects rearranged required spans and made-up data", () => {
  for (const pieces of [[[1, 2], [0, 1]], [[0, 1], { text: ":" }, [1, 2]], [[0, 2], { text: "fabricated" }]]) {
    const result = filterAutomatic(input("ab    "), { reducers: [{ id: "probe", reduce: () => ({ pieces, required: [[0, 2]] }) as never }] });
    assert.equal(result.status, "failed_open"); assert.equal("replacement" in result, false);
  }
});
test("automatic literal argv admits quoted data but never shell expansions or operators", () => {
  assert.deepEqual(tokenizeAutomaticCommand(`docker ps --format '{{json .}}'`), ["docker", "ps", "--format", "{{json .}}"]);
  assert.deepEqual(tokenizeAutomaticCommand(`node -e 'console.log(JSON.stringify({"$literal": 1}))'`), ["node", "-e", 'console.log(JSON.stringify({"$literal": 1}))']);
  for (const command of [`docker ps | jq '.'`, `node -e "$CODE"`, "node -e 'unterminated", "ps -axo $FLAGS", "ls *.json", "ls; other", "node `other`"])
    assert.equal(tokenizeAutomaticCommand(command), undefined, command);
});
test("automatic evidence cannot be bypassed by live formatting or reducer getters", () => {
  let reads = 0;
  const text = { get text() { return ++reads <= 2 ? ":" : "FAKE"; } };
  const result = filterAutomatic(input("ab" + " ".repeat(100)), { reducers: [{ id: "probe", reduce: () => ({ pieces: [[0, 2], text], required: [[0, 2]] }) }] });
  assert.equal(reads, 1); assert.equal(result.status, "reduced"); assert.ok("replacement" in result); assert.equal(result.replacement, "ab:");
  let calls = 0;
  const entry = { id: "probe", get reduce() { calls++; return () => ({ pieces: [[0, 2] as const], required: [[0, 2] as const] }); } };
  assert.equal(filterAutomatic(input("ab    "), { reducers: [entry] }).status, "reduced"); assert.equal(calls, 1);
});
test("automatic facts reject contradictory failure and truncation metadata for every source", () => {
  for (const metadata of [{ truncated: true }, { truncated: "false" }, { exit: 1 }, { exit: null }]) {
    const result = filterAutomatic({ ...input(' { "x": 1 } '), metadata });
    assert.equal(result.status, "passthrough"); assert.equal("replacement" in result, false);
  }
});
