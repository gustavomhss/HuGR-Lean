import assert from "node:assert/strict";
import { test } from "node:test";
import { filter, getProfiles, tokenizeCommand, type Observation } from "../src/core/index.js";
import { tokenizeCommand as literalTokenizer } from "../src/core/command.js";
import { profiles } from "../src/profiles/index.js";

const observation: Observation = {
  source: "shell", command: "go test -v .",
  output: "=== RUN   TestOne\n--- PASS: TestOne (0.00s)\nPASS\nok  \texample.test\t0.001s\n",
  termination: { kind: "exited", code: 0 }, completeness: "complete", presentation: "unknown",
};

test("public snapshots are detached frozen arrays and records retaining real functions", () => {
  const first = getProfiles(), second = getProfiles();
  assert.ok(profiles.length > 0);
  assert.notEqual(first, profiles);
  assert.notEqual(first, second);
  assert.ok(Object.isFrozen(first));
  assert.deepEqual(first.map(({ id }) => id), profiles.map(({ id }) => id));
  for (const [index, item] of first.entries()) {
    assert.notEqual(item, profiles[index]);
    assert.notEqual(item, second[index]);
    assert.ok(Object.isFrozen(item));
    assert.equal(item.match, profiles[index]!.match);
    assert.equal(item.reduce, profiles[index]!.reduce);
    assert.equal(Reflect.set(item, "id", "counterfeit"), false);
    assert.equal(Reflect.set(item, "match", () => true), false);
    assert.equal(Reflect.set(item, "reduce", () => undefined), false);
  }
  assert.equal(Reflect.set(first, "0", { id: "counterfeit" }), false);
  assert.throws(() => (first as unknown[]).pop(), TypeError);
  assert.deepEqual(getProfiles().map(({ id }) => id), profiles.map(({ id }) => id));
});

test("public tokenizer is the existing literal tokenizer, including rejection boundaries", () => {
  assert.equal(tokenizeCommand, literalTokenizer);
  assert.deepEqual(tokenizeCommand("go test -v '.'"), ["go", "test", "-v", "."]);
  assert.ok(Object.isFrozen(tokenizeCommand("go test -v .")));
  for (const command of ["", "go test && true", "X=1 go test", '"go" test', "go test $(pwd)", "go test\n"])
    assert.equal(tokenizeCommand(command), undefined, command);
});

test("real snapshots preserve default filtering and allow independent host selection", () => {
  const builtin = filter(observation);
  assert.equal(builtin.status, "reduced");
  if (builtin.status !== "reduced") assert.fail("real Go reduction required as positive control");
  assert.equal(builtin.replacement, "PASS\nok  \texample.test\t0.001s\n");
  assert.deepEqual(filter(observation, { profiles: getProfiles() }), builtin);
  const selected = getProfiles().filter(({ id }) => id !== "go-test-verbose");
  const disabled = filter(observation, { profiles: selected });
  assert.equal(disabled.status, "passthrough");
  assert.equal("replacement" in disabled, false);
  assert.equal(disabled.outputBytes, Buffer.byteLength(observation.output));
  assert.deepEqual(filter(observation), builtin);
  for (const patch of [
    { output: "opaque reporter café 🔥\r\n" },
    { termination: { kind: "exited" as const, code: 1 } },
    { completeness: "truncated" as const },
    { command: "go test -v . && true" },
  ]) {
    const input = { ...observation, ...patch }, before = structuredClone(input);
    const result = filter(input, { profiles: getProfiles() });
    assert.equal("replacement" in result, false);
    assert.equal(result.inputBytes, Buffer.byteLength(input.output));
    assert.equal(result.outputBytes, result.inputBytes);
    assert.deepEqual(input, before);
  }
});
