import assert from "node:assert/strict";
import { test } from "node:test";
import { filter } from "../src/core/engine.js";
import { runnerProfiles } from "../src/profiles/runners.js";
import type { Observation } from "../src/types.js";

const finished = "    Finished `dev` profile [unoptimized + debuginfo] target(s) in 0.01s\n";
const build = (path: string) => `   Compiling micro v1.0.0 (${path})\n${finished}`;
const observation = (output: string): Observation => ({ source: "shell", command: "cargo build", output,
  termination: { kind: "exited", code: 0 }, completeness: "complete", presentation: "unknown" });

test("Cargo Unicode path is an admitted positive control without presentation controls", () => {
  const output = build("/tmp/café-🔥"), result = filter(observation(output));
  assert.equal(result.status, "reduced");
  assert.ok("replacement" in result); assert.equal(result.replacement, finished);
  assert.equal(result.inputBytes, Buffer.byteLength(output, "utf8"));
  assert.equal(result.outputBytes, Buffer.byteLength(finished, "utf8"));
});

test("DEL and every C1 control in a removable Cargo row require exact passthrough", () => {
  const profile = runnerProfiles.find((entry) => entry.id === "cargo-build");
  assert.ok(profile); assert.equal(profile.match(["cargo", "build"]), true);
  const codes = Array.from({ length: 33 }, (_, index) => 0x7f + index);
  assert.equal(codes[0], 0x7f); assert.equal(codes.at(-1), 0x9f);
  for (const code of codes) {
    const output = build(`/tmp/café-🔥${String.fromCharCode(code)}2J`), input = observation(output);
    assert.equal(profile.reduce(output, input), undefined, `U+${code.toString(16)} admitted`);
    const result = filter(input);
    assert.equal(result.status, "passthrough", `U+${code.toString(16)} reduced`);
    assert.equal("replacement" in result, false);
    assert.equal(result.inputBytes, Buffer.byteLength(output, "utf8"));
    assert.equal(result.outputBytes, result.inputBytes);
  }
});
