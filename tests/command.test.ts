import assert from "node:assert/strict";
import { test } from "node:test";
import { tokenizeCommand } from "../src/core/command.js";

test("literal invocations keep argument boundaries and paths without rewriting", () => {
  for (const [command, expected] of [
    ["cargo test --package lean", ["cargo", "test", "--package", "lean"]],
    [" /usr/bin/git\t-C ./repo status --short ", ["/usr/bin/git", "-C", "./repo", "status", "--short"]],
    ["./tool 'path with spaces' \"another path\" '' --color=never", ["./tool", "path with spaces", "another path", "", "--color=never"]],
    ["C:/tools/cargo.exe test ../project", ["C:/tools/cargo.exe", "test", "../project"]],
    ["tool arg=value '=sh' \"=other\"", ["tool", "arg=value", "=sh", "=other"]],
  ] as const) {
    const argv = tokenizeCommand(command);
    assert.deepEqual(argv, expected);
    assert.equal(Object.isFrozen(argv), true);
  }
});

test("reject shell syntax, expansions and ambiguous quoting, including inside quotes", () => {
  const commands = [
    "", " \t ", "FOO=bar cargo test", "FOO='' cargo test", "env FOO=bar cargo test && echo ok",
    "cargo test; echo ok", "cargo test && echo ok", "cargo test || echo ok", "cargo test | tee log",
    "cargo test &", "cargo test >log", "cargo test <input", "cargo test 2>&1", "cargo test <<<x",
    "cargo $(echo test)", "cargo `echo test`", "cargo ${MODE}", "cargo $MODE", "cargo %MODE%", "cargo !MODE!",
    "cargo test\n", "cargo test\r", "cargo test\\", "cargo 'a\\b'", "cargo \"$MODE\"",
    "cargo test # comment", "(cargo test)", "cargo *", "cargo ?.ts", "cargo ~/project", "cargo {a,b}",
    "cargo [ab]", "cargo @args", "cargo ^test", "cargo \"unterminated", "cargo 'unterminated",
    "ca\"rgo\" test", "cargo --path=\"a b\"", "cargo 'a'\"b\"", "cargo \"a\"b", "'cargo' test", '"cargo" test',
    "cargo 'a;b'", "cargo \"a|b\"", "cargo 'a\tb'", "cargo \u001b[31mtest", "cargo café", "-cargo test",
    "=sh", "cargo =sh", "cargo =/usr/bin/sh", "cargo ==sh",
  ];
  for (const command of commands) assert.equal(tokenizeCommand(command), undefined, JSON.stringify(command));
});

test("runtime non-string command is rejected", () => {
  assert.equal(tokenizeCommand(null as unknown as string), undefined);
});
