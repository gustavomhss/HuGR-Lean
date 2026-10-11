import assert from "node:assert/strict";
import test from "node:test";
import { errorText } from "../src/opencode/automatic-mcp.js";
import { parseJson } from "../src/core/structured-json.js";
import { protocolError } from "../src/profiles/auto-json.js";

// Verbatim reference from 4fcaa06 (before the allocation-free scan).
function referenceErrorText(text: string): boolean {
  if (/^\.\.\.(?:output truncated|\d+ (?:lines|bytes) truncated)\.\.\./.test(text)) return true;
  const json = parseJson(text);
  if (json && protocolError(json)) return true;
  let fenced = false;
  for (const line of text.split("\n")) {
    if (/^```[^`]*$/.test(line)) fenced = !fenced;
    else if (!fenced && line === "### Error") return true;
  }
  return false;
}

const seeds = [
  '{"id":1,"error":{"code":-1,"message":"bad"}}', ' \n\t{"jsonrpc":"2.0","error":{"code":1,"message":"m"}}',
  '{"id":1,"\\u0065rror":{"code":-1,"message":"bad"}}', '{"id":1,"err\\u006fr":{"code":2,"message":"x"},"result":1}',
  '[{"id":1,"error":{"code":-1,"message":"bad"}}]', '{"id":"1","error":{"code":-1,"message":"bad"}}', '{"error":"plain"}',
  '{"nested":{"error":{"code":1,"message":"m"}}}', '{"id":1,"error":{"code":1,"message":"m"}} trailing', '{"a":1}',
  "### Error\nboom", "```\n### Error\n```\n### Snapshot", "```js\n### Error\n```", "```a`b\n### Error", "### Error\r\nx",
  "x\n### Error", " ### Error", "### Errors", "```\n```\n### Error", "...output truncated...\n{}", "...12 lines truncated...",
  "", "\n", "```", "### Error", "plain text", '{"id":1,"error":{"code":1,"message":"m"},"x":"\\u0041"}',
];
function mutate(text: string, random: () => number): string {
  const tokens = ["\n", "\r\n", "`", "```", "### Error", " ", "{", "}", '"error"', "\\u0065", '"id":1,', "\t", "x"];
  let out = text;
  for (let i = 0, n = 1 + Math.floor(random() * 3); i < n; i++) {
    const at = Math.floor(random() * (out.length + 1)), token = tokens[Math.floor(random() * tokens.length)]!;
    out = random() < 0.7 ? out.slice(0, at) + token + out.slice(at) : out.slice(0, at) + out.slice(at + 1 + Math.floor(random() * 4));
  }
  return out;
}
test("allocation-free MCP error detection matches the original on seeds and seeded mutations", () => {
  let state = 0x9e3779b9;
  const random = () => ((state = (Math.imul(state ^ (state >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0) / 2 ** 32);
  let cases = 0, positives = 0;
  for (const seed of seeds) {
    for (const text of [seed, ...Array.from({ length: 400 }, () => mutate(seed, random))]) {
      const expected = referenceErrorText(text);
      assert.equal(errorText(text), expected, JSON.stringify(text));
      cases++; if (expected) positives++;
    }
  }
  assert.ok(cases > 10000 && positives > 300 && cases - positives > 1000, `${cases} cases, ${positives} positive`);
});
