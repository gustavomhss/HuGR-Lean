import assert from "node:assert/strict";
import test from "node:test";
import { filterAutomatic } from "../src/core/automatic.js";
import type { AutomaticObservation } from "../src/core/automatic-types.js";
import { reduceAutomaticJson } from "../src/profiles/auto-json.js";
import { renderReduction } from "../src/core/structured-render.js";
import { readFileSync } from "node:fs";
import { nativeJsonSection } from "../src/profiles/auto-json.js";

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

test("real captured MCP JSON results preserve wrappers and complete payloads", () => {
  let checked = 0, reduced = 0;
  for (const file of ["playwright", "devtools"]) {
    const capture = JSON.parse(readFileSync(new URL(`../fixtures/automatic/browser/native/${file}.json`, import.meta.url), "utf8"));
    const calls = new Map<number, string>();
    for (const record of capture.records) {
      const message = record.message;
      if (record.direction === "send" && message.method === "tools/call") calls.set(message.id, message.params.name);
      const tool = calls.get(message.id);
      if (record.direction !== "receive" || !tool || !["browser_evaluate", "browser_run_code_unsafe", "evaluate_script"].includes(tool)) continue;
      if (message.result.isError === true) {
        for (const block of message.result.content) if (block.type === "text") {
          assert.notEqual(run(block.text, { tool, status: "failure" }).status, "reduced");
        }
        continue;
      }
      for (const block of message.result.content) {
        if (block.type !== "text") continue;
        const section: { output: string; start: number; end: number } = nativeJsonSection({ ...observation(block.text), tool })!;
        assert.ok(section && section.start > 0, tool);
        const result = run(block.text, { tool: `capture_${tool}` });
        const prefix = block.text.slice(0, section.start), suffix = block.text.slice(section.end);
        assert.notEqual(result.status, "failed_open", tool);
        const replacement = result.status === "reduced" ? result.replacement : block.text;
        if (result.status === "reduced") reduced++;
        else {
          assert.equal(result.reason, "unsupported_or_not_smaller");
          assert.equal(section.output.trim(), JSON.stringify(JSON.parse(section.output)), "native payload already compact");
        }
        assert.ok(replacement.startsWith(prefix) && replacement.endsWith(suffix));
        assert.deepEqual(JSON.parse(replacement.slice(prefix.length, -suffix.length)), JSON.parse(section.output));
        const reduction = reduceAutomaticJson({ ...observation(block.text), tool })!;
        for (const [start, end] of [[0, section.start], [section.end, block.text.length]]) {
          assert.ok(reduction.required.some(span => span[0] === start && span[1] === end));
        }
        checked++;
      }
    }
  }
  assert.ok(checked >= 4, `only ${checked} native JSON results checked`);
  assert.equal(reduced, 2);
});

test("wrapped JSON refuses unknown carriers, partial grammar, oversized headers and standard errors", () => {
  const wrap = (payload: string) => `### Result\n${payload}\n### Ran Playwright code\n\`\`\`js\nreturn result;\n\`\`\``;
  for (const payload of ['{ "x": 1, }', '{ "jsonrpc":"2.0", "error":{"code":1,"message":"bad"} }']) {
    assert.notEqual(run(wrap(payload), { tool: "browser_evaluate" }).status, "reduced");
  }
  assert.notEqual(run(wrap('{ "x": 1 }')).status, "reduced");
  assert.notEqual(run(wrap('{ "x": 1 }') + "x".repeat(65536), { tool: "browser_evaluate" }).status, "reduced");
  assert.notEqual(run('Script ran on page and returned:\n```json\n{ "x": 1 }', { tool: "evaluate_script" }).status, "reduced");
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
    'npm ls --json', 'docker ps --format json', 'docker ps --format "{{json .}}"', 'kubectl get pods -o json', 'gh api user', 'pwsh -Command ConvertTo-Json', "'C:\\tools\\node.exe' script.js"]) {
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
