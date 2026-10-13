import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanShell, defaultSummarizeOptions, recoveryLine, summarize } from "../src/core/summarize.js";

const bytes = (text: string) => Buffer.byteLength(text, "utf8");
const filler = (count: number, label = "ok") => Array.from({ length: count }, (_, i) => `  ✓ case ${i} ${label} (${i % 7}ms)`).join("\n");
const failureBlock = [
  " FAIL  src/math.test.ts > adds numbers",
  "AssertionError: expected 3 to be 4 // Object.is equality",
  "    at /repo/src/math.test.ts:12:17",
  "    at runTest (/repo/node_modules/vitest/dist/runner.js:88:5)",
  "  - Expected  4",
  "  + Received  3",
];
const failing = `${filler(400)}\n${failureBlock.join("\n")}\n${filler(400, "later")}\n Test Files  1 failed | 3 passed (4)`;

test("failures in a failed command survive whole, in order, with their continuation lines", () => {
  const result = summarize({ tool: "bash", output: failing, metadata: { exit: 1 } });
  assert.equal(result.status, "summarized");
  if (result.status !== "summarized") return;
  assert.ok(result.replacement.includes(failureBlock.join("\n")), "failure block must be kept contiguous and exact");
  assert.ok(result.replacement.includes("Test Files  1 failed | 3 passed (4)"));
  assert.match(result.replacement, /… \[lean: \d+ lines omitted\] …/);
  assert.ok(result.outputBytes < bytes(failing) / 2);
  assert.equal(result.outputBytes, bytes(result.replacement) + bytes(recoveryLine("0".repeat(32))));
});

test("every failure line is kept when the command failed, even beyond the error budget", () => {
  const errors = Array.from({ length: 300 }, (_, i) => `error[E0${i}]: mismatched types in module_${i}`);
  const output = errors.map((line, i) => `${filler(20)}\n${line}`).join("\n");
  const result = summarize({ tool: "bash", output, metadata: { exit: 101 } });
  const text = result.status === "unchanged" ? output : result.replacement;
  for (const line of errors) assert.ok(text.includes(line), line);
  const huge = `${filler(200)}\npanic: ${"x".repeat(9000)}\n${filler(200)}`;
  const big = summarize({ tool: "bash", output: huge, metadata: { exit: 2 } });
  assert.equal(big.status, "summarized");
  if (big.status === "summarized") assert.ok(big.replacement.includes(`panic: ${"x".repeat(9000)}`));
});

test("missing exit code is treated as a failure; exit 0 keeps failures within the error budget", () => {
  const unknown = summarize({ tool: "bash", output: failing, metadata: {} });
  assert.ok(unknown.status === "summarized" && unknown.replacement.includes(failureBlock.join("\n")));
  const success = summarize({ tool: "bash", output: failing, metadata: { exit: 0 } });
  assert.ok(success.status === "summarized" && success.replacement.includes(failureBlock.join("\n")));
});

test("never summarizes at or below the shell threshold; thresholds are configurable", () => {
  const at = Array.from({ length: 61 }, (_, i) => `row ${String(i).padStart(3, "0")} ${"x".repeat(91)}`).join("\n") + "\n" + "y".repeat(6144 - 61 * 100);
  assert.equal(bytes(at), defaultSummarizeOptions.shellThresholdBytes);
  assert.notEqual(summarize({ tool: "bash", output: at, metadata: { exit: 0 } }).status, "summarized");
  assert.equal(summarize({ tool: "bash", output: at + "y", metadata: { exit: 0 } }).status, "summarized");
  const varied = Array.from({ length: 80 }, (_, i) => `line ${i} ${"z".repeat(70)}`).join("\n");
  assert.ok(bytes(varied) > 6144);
  assert.equal(summarize({ tool: "bash", output: varied, metadata: { exit: 0 } }).status, "summarized");
  assert.equal(summarize({ tool: "bash", output: varied, metadata: { exit: 0 } }, { shellThresholdBytes: 64 * 1024 }).status, "unchanged");
  const small = summarize({ tool: "bash", output: varied.slice(0, 3000), metadata: { exit: 0 } }, { shellThresholdBytes: 1024, headBytes: 256, tailBytes: 256 });
  assert.equal(small.status, "summarized");
});

test("never worse: output that cannot shrink is returned unchanged", () => {
  const allFailures = Array.from({ length: 200 }, (_, i) => `error: failure number ${i} ${"q".repeat(40)}`).join("\n");
  const result = summarize({ tool: "bash", output: allFailures, metadata: { exit: 1 } });
  assert.equal(result.status, "unchanged");
  assert.equal(result.outputBytes, result.inputBytes);
  let seed = 7;
  const random = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  for (let round = 0; round < 200; round++) {
    const rows = Array.from({ length: Math.floor(random() * 400) }, () => random() < 0.1 ? `ERROR ${random()}` : "é".repeat(Math.floor(random() * 120)));
    const output = rows.join(random() < 0.5 ? "\n" : "\r\n");
    for (const tool of ["bash", "read", "webfetch"]) {
      const r = summarize({ tool, output, metadata: { exit: random() < 0.5 ? 0 : 1 } }, { shellThresholdBytes: 512, headBytes: 128, tailBytes: 128, webfetchCapBytes: 512 });
      if (r.status !== "unchanged") assert.ok(r.outputBytes < r.inputBytes && r.outputBytes === bytes(r.replacement) + (r.status === "summarized" ? bytes(recoveryLine("f".repeat(32))) : 0));
    }
  }
});

test("lossless cleanup strips ANSI and CR overwrites and run-length encodes repeated lines", () => {
  assert.equal(cleanShell("\x1b[32mok\x1b[0m\r\n10%\r50%\r100%\ndone"), "ok\n100%\ndone");
  const same = "Downloading crates ... same progress line";
  assert.equal(cleanShell(["a", same, same, same, same, "b"].join("\n")), `a\n${same}\n[previous line repeated 3 more times]\nb`);
  assert.equal(cleanShell("same\nsame\nsame"), "same\nsame\nsame");
  assert.equal(cleanShell("x\nx\ny"), "x\nx\ny");
  const result = summarize({ tool: "bash", output: "\x1b[1mhello\x1b[0m", metadata: { exit: 0 } });
  assert.ok(result.status === "rewritten" && result.replacement === "hello");
});

test("compound, piped, host-truncated and failed commands are summarized", () => {
  const truncatedHost = `...1200 lines truncated...\n\nThe tool call succeeded but the output was truncated. Full output saved to: /tmp/x\n\n${failing}`;
  const result = summarize({ tool: "bash", output: truncatedHost, args: { command: "cd /repo && bun test 2>&1 | tail -n 900" }, metadata: { exit: 1, truncated: true } });
  assert.equal(result.status, "summarized");
  if (result.status === "summarized") {
    assert.ok(result.replacement.startsWith("...1200 lines truncated..."));
    assert.ok(result.replacement.includes("Full output saved to: /tmp/x"));
    assert.ok(result.replacement.includes(failureBlock.join("\n")));
  }
});

const readOutput = (start: number, count: number, footer: string, width = 60) =>
  `<path>/repo/src/a.ts</path>\n<type>file</type>\n<content>\n${Array.from({ length: count }, (_, i) => `${start + i}: const v${i} = "${"w".repeat(width)}";`).join("\n")}\n${footer}\n</content>`;

test("read line-number prefixes compact losslessly; large reads cap with an offset continuation", () => {
  const small = readOutput(10, 20, "(End of file - total 29 lines)");
  const compact = summarize({ tool: "read", output: small });
  assert.equal(compact.status, "rewritten");
  if (compact.status !== "rewritten") return;
  assert.ok(compact.replacement.includes('(lines 10-29; "N: " line-number prefixes omitted)\nconst v0 = '));
  const rows = compact.replacement.split("\n").slice(4, 24).map((row, i) => `${10 + i}: ${row}`);
  assert.equal(compact.replacement.split("\n").slice(0, 3).join("\n") + "\n" + rows.join("\n") + "\n(End of file - total 29 lines)\n</content>", small);
  assert.equal(summarize({ tool: "read", output: small }, { readLineNumbers: true }).status, "unchanged");
  const big = readOutput(1, 600, "(End of file - total 600 lines)");
  const capped = summarize({ tool: "read", output: big });
  assert.equal(capped.status, "summarized");
  if (capped.status !== "summarized") return;
  assert.ok(bytes(capped.replacement) <= defaultSummarizeOptions.readCapBytes);
  const last = Number(/Showing lines 1-(\d+)\. Use offset=(\d+) to continue/.exec(capped.replacement)?.[1]);
  assert.ok(last > 100 && last < 600);
  assert.ok(capped.replacement.endsWith(`Use offset=${last + 1} to continue.)\n</content>`));
  const reminder = big + "\n<system-reminder>\nkeep me\n</system-reminder>";
  const kept = summarize({ tool: "read", output: reminder });
  assert.ok(kept.status === "summarized" && kept.replacement.endsWith("</content>\n<system-reminder>\nkeep me\n</system-reminder>"));
  const odd = big.replace("\n300: ", "\n301: ");
  assert.equal(summarize({ tool: "read", output: odd }).status, "unchanged");
});

test("webfetch caps at 16 KB; grep and glob pass through existing automatic views", () => {
  const page = Array.from({ length: 2000 }, (_, i) => `Paragraph ${i}: ${"lorem ".repeat(10)}`).join("\n");
  const web = summarize({ tool: "webfetch", output: page });
  assert.equal(web.status, "summarized");
  if (web.status === "summarized") { assert.ok(page.startsWith(web.replacement.split("\n… [lean:")[0]!)); assert.ok(bytes(web.replacement) < 16 * 1024 + 100); }
  assert.equal(summarize({ tool: "webfetch", output: page.slice(0, 4000) }).status, "unchanged");
  const paths = Array.from({ length: 30 }, (_, i) => `/Users/someone/project/src/deep/module/file_${i}.ts`);
  const glob = summarize({ tool: "glob", output: paths.join("\n"), args: { pattern: "**/*.ts" }, metadata: { count: 30, truncated: false } });
  assert.ok(glob.status === "rewritten" && glob.reason === "automatic:auto-files");
  assert.equal(summarize({ tool: "glob", output: paths.join("\n"), args: {}, metadata: { count: 30, truncated: true } }).status, "unchanged");
});

test("huge failure lines at the head or tail of a failed command are never cut", () => {
  const first = `Error: ${"head-evidence ".repeat(700)}`, last = `FAILED: ${"tail-evidence ".repeat(700)}`;
  const output = `${first}\n${filler(600)}\n${last}`;
  const result = summarize({ tool: "bash", output, metadata: { exit: 1 } });
  assert.equal(result.status, "summarized");
  if (result.status === "summarized") { assert.ok(result.replacement.startsWith(`${first}\n`)); assert.ok(result.replacement.endsWith(`\n${last}`)); }
  const success = summarize({ tool: "bash", output, metadata: { exit: 0 } });
  assert.ok(success.status === "summarized" && success.replacement.includes("[lean: line cut]"));
});

test("an unknown exit status keeps every failure beyond the budget, like a failed command", () => {
  const errors = Array.from({ length: 200 }, (_, i) => `error: unresolved import crate_${i}::module_${i}`);
  const output = errors.map(line => `${filler(15)}\n${line}`).join("\n");
  for (const metadata of [{}, { exit: null }, { exit: 3 }]) {
    const result = summarize({ tool: "bash", output, metadata });
    const text = result.status === "unchanged" ? output : result.replacement;
    for (const line of errors) assert.ok(text.includes(line), `${JSON.stringify(metadata)} ${line}`);
  }
  const success = summarize({ tool: "bash", output, metadata: { exit: 0 } });
  assert.ok(success.status === "summarized" && errors.some(line => !success.replacement.includes(line)), "exit 0 applies the error budget");
});

test("older host read layout with a blank line before the footer compacts and caps too", () => {
  const old = (count: number) => `<path>/r/a.ts</path>\n<type>file</type>\n<content>\n${Array.from({ length: count }, (_, i) => `${i + 1}: let x${i} = ${"v".repeat(60)};`).join("\n")}\n\n(Showing lines 1-${count} of 9000. Use offset=${count + 1} to continue.)\n</content>`;
  const small = summarize({ tool: "read", output: old(30) });
  assert.ok(small.status === "rewritten" && small.replacement.endsWith(`;\n\n(Showing lines 1-30 of 9000. Use offset=31 to continue.)\n</content>`));
  const big = summarize({ tool: "read", output: old(2000) });
  assert.ok(big.status === "summarized" && /\n\n\(PARTIAL view\. Showing lines 1-\d+\. Use offset=\d+ to continue\.\)\n<\/content>$/.test(big.replacement));
});
