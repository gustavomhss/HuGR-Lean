import assert from "node:assert/strict";
import test from "node:test";
import { filterAutomatic } from "../src/core/automatic.js";
import type { AutomaticObservation } from "../src/core/automatic-types.js";

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
