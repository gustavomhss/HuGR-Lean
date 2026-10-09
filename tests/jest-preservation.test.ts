import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { filter } from "../src/core/engine.js";
import { formatProfiles } from "../src/profiles/formats.js";
import type { Observation } from "../src/types.js";

// Authored unit control, not a native capture or producer-authentication proof.
const control = " PASS user/café🔥.test.cjs\n  user heading\n    ✓ invoice (5 ms) (1 ms)\n\n" +
  "Test Suites: 1 passed, 1 total\nTests: 1 passed, 1 total\nSnapshots: 0 total\nSeed: -7\nTime: 0.1 s\nRan all test suites.\n";
const observation = (output: string): Observation => ({ source: "shell", command: "jest --runInBand --verbose --no-color",
  output, termination: { kind: "exited", code: 0 }, completeness: "complete", presentation: "unknown" });

test("Jest preservation requires whole source rows including PASS and check markers", () => {
  const profile = formatProfiles.find((entry) => entry.id === "jest"); assert.ok(profile);
  assert.equal(profile.match(["jest", "--runInBand", "--verbose", "--no-color"]), true);
  for (const input of [control, control.replaceAll("\n", "\r\n"), control.trimEnd()]) {
    const obs = observation(input), reduction = profile.reduce(input, obs); assert.ok(reduction, "Closed grammar must validate");
    let start = 0;
    for (const row of input.match(/[^\n]*\n|[^\n]+$/gu)!) {
      const span = [start, start + row.length];
      assert.ok(reduction.required.some(([from, to]) => from <= span[0]! && to >= span[1]!), `Whole row required: ${row}`);
      assert.ok(reduction.pieces.some((piece) => Array.isArray(piece) && piece[0] <= span[0]! && piece[1] >= span[1]!), `Whole row emitted: ${row}`);
      start += row.length;
    }
    assert.equal(reduction.pieces.map((piece) => "text" in piece ? piece.text : input.slice(...piece)).join(""), input);
    const result = filter(obs);
    assert.deepEqual(result, { status: "passthrough", reason: "not_smaller", inputBytes: Buffer.byteLength(input), outputBytes: Buffer.byteLength(input) });
  }
});

test("Jest donor and native installed goldens independently retain raw bytes", () => {
  const goldens = JSON.parse(readFileSync(new URL("../fixtures/installed-goldens.json", import.meta.url), "utf8"));
  for (const name of ["jest_all_passed", "jest_native"]) {
    const input = readFileSync(new URL(`../fixtures/formats/${name}.txt`, import.meta.url), "utf8");
    assert.equal(goldens.outputs[`formats/${name}.txt`], input);
    assert.notEqual(goldens.outputs[`formats/${name}.txt`], input.replaceAll("PASS ", "+ ").replaceAll("✓ ", "- "));
    assert.equal(filter(observation(input)).reason, "not_smaller");
  }
});

// Byte-exact literal copies; escaping only. Authored HuGR-Lean MIT captures at
// 362457b6cfe79b1d2ba7a70206a5d025b66c6100, fixtures/profiles/jest/captures/
// {config-collision,config-full-collision}/input.txt. Source/receipt/license:
// fixtures/profiles/jest/{SOURCES.md,config-capture-receipt.json} at same commit.
// Actual Jest package 30.2.0 / CLI 30.1.3; Node 22.17.1 / macOS; merged pipe EOF,
// complete exit 0, unknown presentation. Neither native argv has reporter flags.
const nativeTail = "Test Suites: 1 passed, 1 total\nTests:       1 passed, 1 total\n" +
  "Snapshots:   1 passed, 1 total\nTime:        0.001 s\nRan all test suites.\n";
for (const [config, leaf, hash, size] of [
  ["config-collision.cjs", "", "61fee64e8ad954c4d960ca613138b9dbd432eaf6", 160],
  ["config-full-collision.cjs", "  ✓ custom reporter output (1 ms)\n", "e83b741fc1a0573c1802faf1d366815bb2f3d94b", 196],
] as const) test(`Jest actual config-only native witness stays exact: ${config}`, () => {
  const input = "PASS ./snapshot.test.cjs\n" + leaf + nativeTail;
  const blob = (text: string) => createHash("sha1").update(`blob ${Buffer.byteLength(text)}\0`).update(text).digest("hex");
  assert.equal(Buffer.byteLength(input), size); assert.equal(blob(input), hash);
  assert.notEqual(blob(input.replace("PASS ", "+ ")), hash, "Native pin must see marker corruption");
  const obs = { ...observation(input), command: `jest --config=${config}` };
  const result = filter(obs);
  assert.deepEqual(result, { status: "passthrough", reason: "not_smaller", inputBytes: size, outputBytes: size });
  const profile = formatProfiles.find((entry) => entry.id === "jest")!;
  const reduction = profile.reduce(input, obs); assert.ok(reduction, "Actual reporter stream must validate, not decline");
  assert.equal(reduction.pieces.map((piece) => "text" in piece ? piece.text : input.slice(...piece)).join(""), input);
});
