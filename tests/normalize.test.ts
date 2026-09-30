import assert from "node:assert/strict";
import { test } from "node:test";
import { normalize } from "../src/core/normalize.js";

const rendered = (output: string): string => normalize(output, "terminal-rendered");

test("normalization requires explicit terminal-rendered presentation", () => {
  const output = "\u001b[31mred\u001b[0m\n";
  assert.equal(normalize(output), output);
  assert.equal(normalize(output, "unknown"), output);
});

test("remove complete supported SGR, including indexed and RGB colors", () => {
  for (const sequence of ["\u001b[m", "\u001b[0m", "\u001b[1;32m", "\u001b[38;5;255m", "\u001b[48;2;0;127;255m", "\u001b[97;104m"]) {
    assert.equal(rendered(`${sequence}🔥 café\u001b[0m\n`), "🔥 café\n");
  }
});

test("every CR stays exact: terminal wrapping can retain earlier rows, even in nonshrinking redraws", () => {
  for (const input of [
    "FAILx\rPASS!", "10%\r100%", "old\rnew\rfinal", "\rstart", "old\rnew\r\nnext\rnext!\n",
    "\u001b[31mFAILx\u001b[0m\rPASS!", "\u001b[31mred\u001b[0m\r\n", "\u001b[31mred\u001b[0m\nnext\r",
  ]) assert.equal(rendered(input), input, JSON.stringify(input));
});

test("unknown controls, unsafe escapes and unsafe redraws remain entirely exact", () => {
  for (const input of [
    "\u001b[31mkeep\u001b[0m\tcolumn", "long\rx", "abc\r", "x\rlonger\rx", "café\rnext",
    "🔥\rxx", "x\réé", "a\tb\rabcd", "abc\bdef", "abc\u0000", "abc\u007f", "abc\u009b31m", "\u001b[31mabc\u202e",
    "\u001b[2Jtext", "\u001b[Htext", "\u001b]0;title\u0007text", "\u001b[31", "\u001b[31mtext\u001b[",
    "\u001b[999mtext", "\u001b[38;5;256mtext", "\u001b[48;2;1;2mtext", "\u001b[38;3;1mtext", "\u001b[1;;31mtext",
    "\u001b[31mred\u001b[0m\nlong\rx",
  ]) assert.equal(rendered(input), input, JSON.stringify(input));
});

test("CRLF, whitespace and repeated lines stay exact; no generic log cleanup", () => {
  const input = " \r\n\r\nrepeated\r\nrepeated\r\nlast  ";
  assert.equal(rendered(input), input);
});

test("normalization is idempotent and never expands UTF-8 bytes", () => {
  const atoms = ["", "a", "aa", "🔥", "é", "\r", "\r\n", "\n", "\t", "\u001b[31m", "\u001b[0m", "\u001b[2J"];
  for (const left of atoms) for (const middle of atoms) for (const right of atoms) {
    const input = left + middle + right;
    const once = rendered(input);
    assert.equal(rendered(once), once, JSON.stringify(input));
    assert.ok(Buffer.byteLength(once) <= Buffer.byteLength(input), JSON.stringify(input));
  }
});
