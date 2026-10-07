import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { formatProfiles } from "../src/profiles/formats.js";
import type { Observation, Reduction, Span } from "../src/types.js";

const fixture = (name: string): string => readFileSync(new URL(`../fixtures/formats/${name}.txt`, import.meta.url), "utf8");
const profile = (id: string) => { const found = formatProfiles.find((item) => item.id === id); assert.ok(found); return found; };
const nativeArgv: Readonly<Record<string, readonly string[]>> = {
  jest: ["jest", "--verbose"], vitest: ["vitest", "run"], "git-status": ["git", "status"],
  rg: ["rg", "-n", "--with-filename", "--regexp", "", "src"], tsc: ["tsc", "--pretty", "false"],
};
function observation(id: string, output: string, patch: Partial<Observation> = {}): Observation {
  const argv = nativeArgv[id]; assert.ok(argv);
  assert.equal(profile(id).match(argv), true, `Unsupported test identity: ${id}`);
  return { source: "shell", command: argv.map((arg) => arg === "" ? "''" : arg).join(" "), output,
    termination: { kind: "exited", code: 0 }, completeness: "complete", presentation: "terminal-rendered", ...patch };
}
function declined(id: string, output: string): void {
  assert.equal(profile(id).reduce(output, observation(id, output)), undefined, output);
}
function materialize(output: string, reduction: Reduction): string {
  assert.ok(reduction.required.length > 0);
  for (const span of [...reduction.required, ...reduction.pieces.filter((piece): piece is Span => !("text" in piece))]) {
    assert.ok(Number.isInteger(span[0]) && Number.isInteger(span[1]) && span[0] >= 0 && span[0] < span[1] && span[1] <= output.length);
  }
  for (const required of reduction.required) {
    assert.ok(reduction.pieces.some((piece) => Array.isArray(piece) && piece[0] <= required[0] && piece[1] >= required[1]), `Required span missing: ${output.slice(...required)}`);
  }
  return reduction.pieces.map((piece) => {
    if ("text" in piece) { assert.ok(["", " ", "\n", ":\n", "- ", "+ "].includes(piece.text)); return piece.text; }
    return output.slice(...piece);
  }).join("");
}
function reduced(id: string, input: string): string {
  const result = profile(id).reduce(input, observation(id, input));
  assert.ok(result, `${id} declined supported grammar`);
  const output = materialize(input, result);
  assert.ok(Buffer.byteLength(output) < Buffer.byteLength(input), "Reduction must save UTF-8 bytes");
  return output;
}
const blobs = {
  jest_all_passed: "1c8ca11ecb09eac4c1bdfed65a35f9d9aa5ebf6f",
  vitest_all_passed: "e00868cb113e2ac65f08d410b56509cb692f202d",
  git_status_mixed: "2ea985e5c01b7c5845a57a8a8533ddd6af2c5108",
  grep_single_file_multiple_matches: "aa3c1fed88b911a6a663026f85aee8edeb43aa6a",
  lint_tsc_errors: "08edbed1adb28fe9f62ed3d4e43c3aac3f0b1c89",
};
test("donor bytes match pinned TRS blobs; changed bytes trip the oracle", () => {
  const hash = (text: string) => createHash("sha1").update(`blob ${Buffer.byteLength(text)}\0`).update(text).digest("hex");
  for (const [name, expected] of Object.entries(blobs)) {
    assert.equal(hash(fixture(name)), expected, name);
    assert.notEqual(hash(fixture(name) + "\n"), expected, name);
  }
});

const positives = [
  ["jest", "jest_all_passed", "+ src/utils.test.js\n  - should add numbers (5 ms)\n  - should subtract numbers (2 ms)\n  - should multiply numbers (3 ms)\n  - should divide numbers (4 ms)\n\n+ src/helpers.test.js\n  - should format date (1 ms)\n  - should parse JSON (2 ms)\n\nTest Suites: 2 passed, 2 total\nTests:       6 passed, 6 total\nTime:        0.8 s\n"],
  ["vitest", "vitest_all_passed", " ✓ test/utils.test.ts (3 tests)\n ✓ test/helpers.test.ts (2 tests)\n ✓ test/components.test.ts (4 tests)\n\n Test Files  3 passed (3)\n      Tests  9 passed (9)\n   Start at  10:30:00\n   Duration  1.20s\n"],
  ["git-status", "git_status_mixed", "On branch main\nYour branch is up to date with 'origin/main'.\n\nChanges to be committed:\n  modified:   src/main.rs\n  new file:   src/new_module.rs\n\nChanges not staged for commit:\n  modified:   src/router.rs\n  deleted:    src/old_code.rs\n\nUntracked files:\n  scratchpad.txt\n  notes.md\n\n"],
  ["rg", "grep_single_file_multiple_matches", "src/main.rs:\n10:fn init() {\n25:fn process() {\n42:fn main() {\n58:fn cleanup() {\n"],
  ["jest", "jest_native", "+ ./jest-native.test.cjs\n  maths 🔥\n    - adds café (7 ms)\n    nested\n      - keeps path: evidence (2 ms)\n\nTest Suites: 1 passed, 1 total\nTests:       2 passed, 2 total\nSnapshots:   0 total\nTime:        1.022 s\nRan all test suites.\n"],
  ["vitest", "vitest_native", "\n RUN  v3.2.4 /private/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode/lean-formats-native\n\n ✓ vitest-native.test.js (2 tests)\n\n Test Files  1 passed (1)\n      Tests  2 passed (2)\n   Start at  00:23:02\n   Duration  1.28s (transform 26ms, setup 0ms, collect 10ms, tests 5ms, environment 0ms, prepare 324ms)\n\n"],
] as const;
for (const [id, name, expected] of positives) test(`${id} preserves exact required evidence: ${name}`, (context) => {
  const input = fixture(name), output = reduced(id, input);
  assert.equal(output, expected);
  context.diagnostic(`${name}: ${Buffer.byteLength(input)} -> ${Buffer.byteLength(output)} UTF-8 bytes`);
});
test("native test/status grammars preserve CRLF and UTF-16 source offsets", () => {
  for (const [id, name, expected] of positives) if (id !== "rg") assert.equal(reduced(id, fixture(name).replaceAll("\n", "\r\n")), expected.replaceAll("\n", "\r\n"));
});

// Insert inside admitted dynamic fields, so malformed report syntax cannot
// conceal a missing control check. Git path grammar already rejects C1 controls.
const controlFields = [
  ["jest", "jest_native", "./jest-native.test.cjs", "file path"],
  ["jest", "jest_native", "adds café", "test name"],
  ["vitest", "vitest_native", "vitest-native.test.js", "file path"],
  ["git-status", "git_status_mixed", "On branch main", "branch name"],
  ["rg", "grep_single_file_multiple_matches", "fn init() {", "match content"],
] as const;
for (const [id, name, field, label] of controlFields) {
  const input = fixture(name), expected = positives.find((entry) => entry[0] === id && entry[1] === name)?.[2];
  assert.ok(expected, `${id}: missing reduction golden`);
  assert.ok(input.includes(field), `${id}: missing insertion anchor`);
  assert.ok(expected.includes(field), `${id}: missing expected evidence`);
  const insert = (value: string) => input.replace(field, field + value);
  test(`${id} ${label} retains ordinary Unicode with a real reduction`, () => {
    const unicode = "漢字 e\u0301 🔥";
    assert.equal(reduced(id, insert(unicode)), expected.replace(field, field + unicode));
  });
  test(`${id} ${label} declines every C1 control in otherwise admitted grammar`, () => {
    assert.equal(reduced(id, input), expected, "Unmodified fixture must reduce");
    const admitted: string[] = [];
    for (let code = 0x80; code <= 0x9f; code++) {
      const output = insert(String.fromCodePoint(code));
      if (profile(id).reduce(output, observation(id, output)) !== undefined)
        admitted.push(`U+${code.toString(16).toUpperCase().padStart(4, "0")}`);
    }
    assert.deepEqual(admitted, [], `${id} ${label}: C1 controls must prevent profile reduction`);
  });
}

test("identity uses explicit argv; scripts, lookalikes, custom reporters, and git diff never match", () => {
  for (const [id, argv] of [["jest", ["jest", "--verbose"]], ["vitest", ["vitest", "run"]], ["tsc", ["tsc", "--pretty", "false"]], ["rg", ["rg", "-n", "term", "."]], ["git-status", ["git", "status"]]] as const) {
    assert.equal(profile(id).match(argv), true);
    assert.equal(profile(id).match(["npx", ...argv]), true);
    assert.equal(profile(id).match(["npx", "--no-install", ...argv]), true);
  }
  for (const argv of [["npm", "test"], ["npm", "run", "lint"], ["pnpm", "test"], ["jest-custom"], ["/bin/jest"], ["git", "diff"], ["npx", "--package", "vitest", "run"], ["jest", "--reporters", "custom"], ["vitest", "--reporter=json"]]) {
    assert.equal(formatProfiles.some((item) => item.match(argv)), false, argv.join(" "));
  }
});
test("ripgrep identity proves line-number mode without mistaking option values or patterns for flags", () => {
  for (const argv of [["rg", "term"], ["rg", "--", "-n"], ["rg", "-e", "-n", "."], ["rg", "--glob", "-n", "term"], ["rg", "--regexp=-n", "."], ["rg", "-n", "--no-line-number", "term"], ["rg", "-n", "--unknown", "term"], ["rg", "-n", "-e"]]) assert.equal(profile("rg").match(argv), false, argv.join(" "));
  for (const argv of [["rg", "-nH", "term", "."], ["rg", "-Nn", "--color", "never", "term"], ["rg", "--line-number", "--regexp=-n", "."], ["rg", "-n", "--", "-N"], ["rg", "-n", "-e", "term", "--glob=*.ts"]]) assert.equal(profile("rg").match(argv), true, argv.join(" "));
});

test("all active reducers reject unknown lines, failure/unknown exits, incomplete capture, and controls", () => {
  for (const [id, name] of positives) {
    const input = fixture(name), item = profile(id);
    for (const patch of [{ termination: { kind: "unknown" } }, { termination: { kind: "timed_out" } }, { termination: { kind: "exited", code: 1 } }, { completeness: "truncated" }, { completeness: "unknown" }, { source: "other" }] as const) {
      assert.equal(item.reduce(input, observation(id, input, patch)), undefined, `${id}: ${JSON.stringify(patch)}`);
    }
    for (const unknown of ["custom reporter: passed\n", "warning: keep this\n", "\u001b[32m", "\rprogress\r"]) {
      declined(id, unknown + input);
      declined(id, input + unknown);
    }
    declined(id, "");
  }
});

test("Jest/Vitest reject inconsistent, incomplete, skipped, and failed reports even with exit 0", () => {
  const jest = fixture("jest_all_passed"), vitest = fixture("vitest_all_passed");
  const cases = [
    ["jest", jest.replace("2 passed, 2 total", "1 passed, 2 total")],
    ["jest", jest.replace("6 passed, 6 total", "5 passed, 5 total")],
    ["jest", jest.replace("PASS", "FAIL")], ["jest", jest.replace("✓", "○ skipped")],
    ["jest", jest.replace("Tests:       6 passed, 6 total\n", "")],
    ["jest", "PASS src/a.test.js\n  empty heading\nTest Suites: 1 passed, 1 total\nTests: 1 passed, 1 total\n"],
    ["jest", "PASS src/a.test.js\nTest Suites: 1 passed, 1 total\nTests: 9007199254740993 passed, 9007199254740992 total\n"],
    ["vitest", vitest.replace("3 passed (3)", "2 passed (2)")],
    ["vitest", vitest.replace("9 passed (9)", "8 passed (8)")],
    ["vitest", vitest.replace("✓", "❯")], ["vitest", vitest.replace("9 passed (9)", "8 passed | 1 skipped (9)")],
    ["vitest", vitest.replace("   Duration  1.20s\n", "")],
    ["vitest", vitest.replace("1.20s", "1.20s (custom 5ms)")],
  ];
  for (const [id, input] of cases) declined(id!, input!);
});

test("Jest nonverbose, matching trailer, snapshots, and seed retain exact summaries", () => {
  const input = "PASS src/🔥.test.ts\n\nTest Suites: 1 passed, 1 total\nTests: 4 passed, 4 total\nSnapshots: 2 passed, 2 total\nSeed: -42\nTime: 0.8 s, estimated 1 s\nRan all test suites matching /🔥/i.\n";
  assert.equal(reduced("jest", input), input.replace("PASS ", "+ "));
});
test("Jest retains timing-shaped test names without assuming a suffix is decoration", () => {
  const input = "PASS src/a.test.js\n  ✓ name (5 ms)\n  ✓ name (5 ms) (1 ms)\nTest Suites: 1 passed, 1 total\nTests: 2 passed, 2 total\n";
  assert.equal(reduced("jest", input), "+ src/a.test.js\n  - name (5 ms)\n  - name (5 ms) (1 ms)\nTest Suites: 1 passed, 1 total\nTests: 2 passed, 2 total\n");
});

test("git status retains branch, all conflict codes, unquoted paths, renames, submodule evidence, CRLF", () => {
  const input = 'On branch feature/🔥\r\nYou have unmerged paths.\r\n  (fix conflicts and run "git commit")\r\n  (use "git merge --abort" to abort the merge)\r\n\r\nChanges to be committed:\r\n  (use "git restore --staged <file>..." to unstage)\r\n\trenamed:    old café.ts -> new 🔥.ts\r\n\tcopied:     src/original.ts -> src/copy.ts\r\n\ttypechange: src/link\r\n\r\nUnmerged paths:\r\n  (use "git add <file>..." to mark resolution)\r\n' + ["both modified", "both added", "both deleted", "added by us", "added by them", "deleted by us", "deleted by them"].map((label) => `\t${label}:   src/${label} 🔥.ts\r\n`).join("") + '\r\nChanges not staged for commit:\r\n  (use "git add/rm <file>..." to update what will be committed)\r\n  (commit or discard the untracked or modified content in submodules)\r\n\tmodified:   deps/lib (new commits, modified content)\r\n';
  const output = reduced("git-status", input);
  const evidence = input.split("\r\n").filter((line) => !line.startsWith("  (")).join("\r\n");
  assert.equal(output, evidence);
});

test("git status tracking variants remove only context-valid fixed advice", () => {
  for (const [state, hint] of [["Your branch is ahead of 'origin/main' by 1 commit.", '(use "git push" to publish your local commits)'], ["Your branch is behind 'origin/main' by 2 commits, and can be fast-forwarded.", '(use "git pull" to update your local branch)'], ["Your branch and 'origin/main' have diverged,\nand have 3 and 5 different commits each, respectively.", '(use "git pull" to merge the remote branch into yours)'], ["Your branch is based on 'origin/main', but the upstream is gone.", '(use "git branch --unset-upstream" to fixup)']]) {
    const input = `On branch main\n${state}\n  ${hint}\n\nnothing to commit, working tree clean\n`;
    assert.equal(reduced("git-status", input), `On branch main\n${state}\n\nnothing to commit, working tree clean\n`);
  }
  for (const branch of ["HEAD detached at abc123", "HEAD detached from main", "Not currently on any branch.", "On branch main\n\nNo commits yet"]) {
    const input = `${branch}\n\nUntracked files:\n  (use "git add <file>..." to include in what will be committed)\n\tnew.txt\n\nnothing added to commit but untracked files present (use "git add" to track)\n`;
    assert.equal(reduced("git-status", input), input.replace('  (use "git add <file>..." to include in what will be committed)\n', ""));
  }
});

test("ordinary unstaged/untracked Git status requires a complete native footer", () => {
  const header = "On branch main\n\n";
  const variants = [
    ['Changes not staged for commit:\n  (use "git restore <file>..." to discard changes in working directory)\n\tmodified:   src/main.ts\n', "Changes not staged for commit:\n\tmodified:   src/main.ts\n", 'no changes added to commit (use "git add" and/or "git commit -a")'],
    ['Untracked files:\n  (use "git add <file>..." to include in what will be committed)\n\tnew café 🔥.ts\n', "Untracked files:\n\tnew café 🔥.ts\n", 'nothing added to commit but untracked files present (use "git add" to track)'],
    ['Changes not staged for commit:\n  (use "git restore <file>..." to discard changes in working directory)\n\tdeleted:    src/old.ts\n\nUntracked files:\n  (use "git add <file>..." to include in what will be committed)\n\tnew.ts\n', "Changes not staged for commit:\n\tdeleted:    src/old.ts\n\nUntracked files:\n\tnew.ts\n", 'no changes added to commit (use "git add" and/or "git commit -a")'],
  ];
  for (const [body, evidence, footer] of variants) {
    assert.equal(reduced("git-status", `${header}${body}\n${footer}\n`), `${header}${evidence}\n${footer}\n`);
    declined("git-status", header + body);
    declined("git-status", header + body + "\n\n");
    declined("git-status", `${header}${body}\nnothing to commit, working tree clean\n`);
    declined("git-status", `${header}${body}\ncustom summary: complete\n`);
  }
  declined("git-status", `${header}${variants[0]![0]}\n${variants[1]![2]}\n`);
  declined("git-status", `${header}${variants[1]![0]}\n${variants[0]![2]}\n`);
});

test("staged and explicitly merging Git variants may end after complete evidence rows", () => {
  const staged = 'On branch main\n\nChanges to be committed:\n  (use "git restore --staged <file>..." to unstage)\n\trenamed:    src/old.ts -> src/new.ts\n';
  assert.equal(reduced("git-status", staged), "On branch main\n\nChanges to be committed:\n\trenamed:    src/old.ts -> src/new.ts\n");
  const conflict = 'On branch merge\nYou have unmerged paths.\n  (fix conflicts and run "git commit")\n\nUnmerged paths:\n  (use "git add <file>..." to mark resolution)\n\tboth modified:   src/conflict.ts\n';
  assert.equal(reduced("git-status", conflict), "On branch merge\nYou have unmerged paths.\n\nUnmerged paths:\n\tboth modified:   src/conflict.ts\n");
});

test("Git rejects quoted/escaped paths and malformed rename/copy rows with matched identity and exit 0", () => {
  const staged = (row: string) => `On branch main\n\nChanges to be committed:\n  (use "git restore --staged <file>..." to unstage)\n\t${row}\n`;
  const untracked = (path: string) => `On branch main\n\nUntracked files:\n  (use "git add <file>..." to include in what will be committed)\n\t${path}\n\nnothing added to commit but untracked files present (use "git add" to track)\n`;
  assert.equal(reduced("git-status", staged("modified:   src/valid name.ts")), "On branch main\n\nChanges to be committed:\n\tmodified:   src/valid name.ts\n");
  assert.equal(reduced("git-status", untracked("valid.ts")), 'On branch main\n\nUntracked files:\n\tvalid.ts\n\nnothing added to commit but untracked files present (use "git add" to track)\n');
  for (const path of ['"src/closed.ts"', '"src/unclosed.ts', "src/'single'.ts", "src/back\\slash.ts", '"caf\\303\\251.ts"', "src/name.ts ", "warning: custom log"]) {
    declined("git-status", staged(`modified:   ${path}`));
    declined("git-status", untracked(path));
  }
  for (const paths of ["old.ts", "old.ts->new.ts", "old.ts -> ", " -> new.ts", "old.ts -> mid.ts -> new.ts", '"old.ts" -> new.ts', 'old.ts -> "new.ts', "old.ts -> new\\path.ts", "old.ts  -> new.ts"]) {
    for (const label of ["renamed", "copied"]) declined("git-status", staged(`${label}:    ${paths}`));
  }
  declined("git-status", staged("modified:   deps/lib (unknown annotation)"));
  declined("git-status", untracked("valid.ts") + "custom log: done\n");
});

test("git status rejects diff, empty sections, conflicting summaries, unknown hints and logs", () => {
  const input = fixture("git_status_mixed");
  for (const invalid of ["diff --git a/a b/a\n--- a/a\n+++ b/a\n@@ -1 +1 @@\n-old\n+new\n", input + "nothing to commit, working tree clean\n", input.replace("  modified:   src/main.rs\n  new file:   src/new_module.rs\n", ""), input.replace("to unstage)", "to do something else)"), input.replace("Changes to be committed:", "custom logs:"), input.replace("Your branch is up to date with 'origin/main'.", 'Your branch is up to date with \'origin/main\'.\n  (use "git push" to publish your local commits)')]) {
    declined("git-status", invalid);
  }
  const unknownAdvice = 'On branch main\nUntracked files:\n  (use "git add <file>..." to include in what will be committed)\n  (use "git unknown" to do something else)\n\tfile.txt\n\nnothing added to commit but untracked files present (use "git add" to track)\n';
  declined("git-status", unknownAdvice);
});

test("ripgrep retains full paths, line/content association, order, multiplicity, and UTF-16 spans", () => {
  const input = "src/🔥 café.ts:7:https://example:x 🔥\r\nsrc/🔥 café.ts:7:https://example:x 🔥\r\nother/café.ts:2:other\r\nsrc/🔥 café.ts:9:last\r\nsrc/🔥 café.ts:10:\r\n";
  assert.equal(reduced("rg", input), "src/🔥 café.ts:\n7:https://example:x 🔥\r\n7:https://example:x 🔥\r\nother/café.ts:2:other\r\nsrc/🔥 café.ts:\n9:last\r\n10:\r\n");
});
test("ripgrep rejects path/column ambiguity, context, headings, warnings, and missing line numbers", () => {
  for (const invalid of ["src:odd.ts:1:x\nsrc:odd.ts:2:y\n", "a.ts:1:text:23:suffix\na.ts:2:y\n", "a.ts:1:2:text\na.ts:2:3:text\n", "a.ts:0:x\na.ts:2:y\n", "1:10:numeric content\n2:11:numeric content\n", "C:\\a.ts:1:x\nC:\\a.ts:2:y\n", "a.ts-1-context\na.ts:2:match\n", "a.ts\n1:x\n2:y\n", "a.ts:x\na.ts:y\n", "Binary file a.ts matches\n", "a.ts:1:x\n--\na.ts:2:y\n", "a.ts:1:x\nwarning: error\n"]) {
    declined("rg", invalid);
  }
});
test("tsc plain and multiline diagnostics always choose exact passthrough", () => {
  for (const input of [fixture("lint_tsc_errors"), "src/🔥 café.ts(1,2): error TS2322: Type 'X' is not assignable to type 'Y'.\n  Type 'X' is missing property 'y'.\n", "error TS5058: The specified path does not exist: 'missing'.\n"]) {
    for (const code of [0, 1, 2]) assert.equal(profile("tsc").reduce(input, observation("tsc", input, { termination: { kind: "exited", code } })), undefined);
  }
});
