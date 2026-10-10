import assert from "node:assert/strict";
import test from "node:test";
import { filterAutomatic } from "../src/core/automatic.js";
import type { AutomaticObservation } from "../src/core/automatic-types.js";
import { reduceAutomaticJson } from "../src/profiles/auto-json.js";
import { renderReduction } from "../src/core/structured-render.js";

const observation = (output: string): AutomaticObservation => ({ source: "mcp", tool: "unknown_inventory", output,
  args: {}, metadata: {}, status: "success", completeness: "complete" });
const run = (output: string, patch: Partial<AutomaticObservation> = {}) => filterAutomatic({ ...observation(output), ...patch },
  { reducers: [{ id: "auto-json", reduce: reduceAutomaticJson }] });

test("JSON retains exact key/scalar lexemes, ordering, opaque flags and empty punctuation", () => {
  const input = ' { "\\u006b" : 1e+03, "k2" : -0, "huge" : 9007199254740993, "text" : "😀\\n", "error" : "application", "truncated" : true, "hasMore" : true, "empty" : { }, "list" : [ ], "null" : null } ';
  const result = run(input);
  assert.equal(result.status, "reduced");
  assert.equal(result.replacement, '{"\\u006b":1e+03,"k2":-0,"huge":9007199254740993,"text":"😀\\n","error":"application","truncated":true,"hasMore":true,"empty":{},"list":[],"null":null}');
  assert.deepEqual(JSON.parse(result.replacement!), JSON.parse(input));
  const reduction = reduceAutomaticJson(observation(input))!;
  for (const token of ['"\\u006b"', '"empty"', '{', '}', '[', ']']) {
    assert.ok(reduction.required.some(span => input.slice(...span) === token), token);
  }
});

test("NDJSON preserves all records, CRLF values, ordering and control footer", () => {
  const input = '{ "id": 1, "data": {} }\r\n{ "id": 2, "data": [] }\r\n{ "done": true, "cursor": null }\n';
  const result = run(input);
  assert.equal(result.status, "reduced");
  assert.deepEqual(result.replacement!.trim().split("\n").map(line => JSON.parse(line)), input.trim().split("\n").map(line => JSON.parse(line)));
  assert.ok(result.replacement!.endsWith("\n"));
  assert.notEqual(run('{ "id": 1 }\nnot JSON').status, "reduced");
  assert.notEqual(run('{ "id": 1 }\n\n{ "id": 2 }').status, "reduced");
});

test("syntax, global budgets, standard error envelopes and authentic status fail open", () => {
  for (const input of ['{ "a":1,"a":2 }', '{ "a":1, }', '[1,]', '{',
    '{ "jsonrpc":"2.0", "error":{"code":-1,"message":"bad"} }',
    '{ "id":1, "error":{"code":-1,"message":"bad"} }',
    `${'[ '.repeat(65)}0${' ]'.repeat(65)}`, '{ "v": 1 }\n'.repeat(9000)]) {
    assert.notEqual(run(input).status, "reduced", input.slice(0, 80));
  }
  for (const patch of [{ status: "failure" }, { completeness: "truncated" }] as const) {
    assert.notEqual(run('{ "data": 1 }', patch).status, "reduced");
  }
  assert.equal(run('{ "id":1, "result":{}, "error":{"code":1,"message":"data"} }').status, "reduced");
});

test("native bash frozen producers, shell facts and legacy precedence", () => {
  const input = '{ "native": [ 1, 2 ] }';
  const native = { source: "native", tool: "bash", metadata: { exit: 0, truncated: false } } as const;
  for (const command of ['node script.js', 'python3 script.py', 'jq . file.json', 'curl localhost', 'system_profiler -json',
    'npm ls --json', 'docker ps --format json', 'kubectl get pods -o json', 'gh api user', 'pwsh -Command ConvertTo-Json']) {
    assert.equal(run(input, { ...native, args: { command } }).status, "reduced", command);
  }
  for (const command of ['unknown --json', 'node --test script.js', 'python -m pytest', 'npm ls', 'docker ps',
    'kubectl get pods', 'gh issue list', 'curl localhost | jq .', 'git status']) {
    assert.notEqual(run(input, { ...native, args: { command } }).status, "reduced", command);
  }
  for (const metadata of [{}, { exit: 1, truncated: false }, { exit: 0, truncated: true }]) {
    assert.notEqual(run(input, { ...native, args: { command: 'node script.js' }, metadata }).status, "reduced");
  }
  const declined = filterAutomatic({ ...observation(input), ...native, args: { command: 'node script.js' } }, {
    reducers: [{ id: 'json', reduce: reduceAutomaticJson }], legacyFilter: () => ({ status: 'passthrough', reason: 'grammar_refusal', inputBytes: 0, outputBytes: 0 }),
  });
  assert.equal(declined.reason, 'grammar_refusal');
});

test("empty containers remain source-backed even without scalar values", () => {
  for (const input of [' { } ', ' [ ] ', '{ "nested": [ { }, [ ] ] }']) {
    assert.deepEqual(JSON.parse(renderReduction(input, reduceAutomaticJson(observation(input))!)), JSON.parse(input));
  }
});
