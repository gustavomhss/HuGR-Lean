import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { release } from "node:os";
import test from "node:test";
import { filterStructured } from "../src/core/structured.js";
import type { StructuredObservation } from "../src/core/structured-types.js";
import { reduceProcesses } from "../src/profiles/structured-processes.js";

const observation = (output: string): StructuredObservation => ({ format: "processes", output, completeness: "complete", termination: { kind: "exited", code: 0 } });
const filter = (output: string, patch: Partial<StructuredObservation> = {}) => filterStructured({ ...observation(output), ...patch }, { reducers: { processes: reduceProcesses } });
function replacement(output: string): string {
  const result = filter(output);
  assert.equal(result.status, "reduced");
  assert.ok("replacement" in result);
  assert.equal(result.inputBytes, Buffer.byteLength(output, "utf8"));
  assert.equal(result.outputBytes, Buffer.byteLength(result.replacement, "utf8"));
  return result.replacement;
}
function preserved(output: string, patch: Partial<StructuredObservation> = {}) {
  const result = filter(output, patch);
  assert.equal(result.status, "passthrough");
  assert.equal("replacement" in result, false);
}

test("process JSON retains every row, exact keys and scalar lexemes as JSON cells", () => {
  const input = '[\n { "p\\u0069d": 0e0, "ppid": -0, "state": "S", "command": "café🦀 helper  suffix\\t\\n" },\n' +
    ' { "pid": 9007199254740991, "ppid": 1, "state": "R+", "command": "second process suffix" },\n' +
    ' { "pid": 0, "ppid": 0, "state": "S", "command": "café🦀 helper  suffix\\t\\n" }\n]';
  assert.equal(replacement(input), '"p\\u0069d"\t"ppid"\t"state"\t"command"\n' +
    '0e0\t-0\t"S"\t"café🦀 helper  suffix\\t\\n"\n' +
    '9007199254740991\t1\t"R+"\t"second process suffix"\n' +
    '0\t0\t"S"\t"café🦀 helper  suffix\\t\\n"');
});

test("process JSON refuses unknown, ambiguous, malformed and invalid records", () => {
  const row = { pid: 1, ppid: 0, state: "S", command: "worker suffix" };
  const bad: unknown[] = [[], {}, [null], [row, null], [{ ...row, extra: 1 }],
    [{ ppid: 0, pid: 1, state: "S", command: "worker" }], [{ pid: 1, ppid: 0, state: "S" }]];
  for (const key of ["pid", "ppid"]) for (const value of [-1, 0.5, 9007199254740992, "1", null, true]) bad.push([{ ...row, [key]: value }]);
  for (const key of ["state", "command"]) for (const value of ["", null, 1, [], {}]) bad.push([{ ...row, [key]: value }]);
  for (const value of bad) preserved(JSON.stringify(value, null, 2));
  for (const input of ['[{"pid":1,"pid":2,"ppid":0,"state":"S","command":"x"}]',
    '[{"pid":1,"ppid":0,"state":"S","command":"x"},]', '[{"pid":',
    '[{"pid":1e400,"ppid":0,"state":"S","command":"x"}]']) preserved(input);
});

// Synthetic Darwin-layout cases; native compatibility comes from the opt-in capture below.
const native = "  PID  PPID STAT COMM\n    1     0 Ss   /Applications/My App.app/worker  suffix  \n   22     1 R+    leading space🦀 command\n   22     1 R+    leading space🦀 command\n";
test("native layout retains IDs, state, all rows and entire remaining command", () => {
  assert.equal(replacement(native), "PID\tPPID\tSTAT\tCOMM\n1\t0\tSs\t/Applications/My App.app/worker  suffix  \n" +
    "22\t1\tR+\t leading space🦀 command\n22\t1\tR+\t leading space🦀 command");
});

test("native layout refuses other flags' headers, damaged columns and partial rows", () => {
  for (const input of [native.replace("COMM", "COMMAND"), native.replace("STAT", "S"),
    native.replace("PPID", "USER"), native.replace("    1", "   -1"), native.replace("Ss  ", "?   "),
    native.replace("Ss  ", "SSSS"), native.replace("suffix", "suffix\tbad"), native.slice(0, -1),
    native + "\n", native + "warning: unknown\n", "  PID  PPID STAT COMM\n",
    "  PID  PPID STAT COMM\n    1     0 S    \n", native.replaceAll("\n", "\r\n"),
    "  PID  PPID STAT COMM\n" + "    1     0 S    worker\n".repeat(4097)]) preserved(input);
});

test("explicit format and authentic success/completeness required", () => {
  for (const patch of [{ completeness: "truncated" }, { completeness: "unknown" },
    { termination: { kind: "exited", code: 1 } }, { termination: { kind: "unknown" } },
    { termination: { kind: "timed_out" } }, { format: "json" }]) preserved(native, patch as Partial<StructuredObservation>);
});

// Explicit external producer, never profile execution. Enable on Darwin only:
// HUGR_NATIVE_PS=1 npx tsx --test tests/structured-processes.test.ts
// Without opt-in, synthetic tests make no native-execution claim (no skipped proof).
if (process.env.HUGR_NATIVE_PS === "1") test("Darwin native ps capture: every original cell survives", t => {
  assert.equal(process.platform, "darwin", "native compatibility is Darwin-only");
  const capture = spawnSync("/bin/ps", ["-axo", "pid,ppid,stat,comm"], { maxBuffer: 4 * 1024 * 1024, timeout: 10000 });
  assert.ifError(capture.error);
  assert.equal(capture.status, 0);
  assert.equal(capture.signal, null);
  assert.equal(capture.stderr.length, 0);
  const stdout = capture.stdout.toString("utf8");
  assert.deepEqual(Buffer.from(stdout), capture.stdout);
  t.diagnostic(JSON.stringify({ command: "/bin/ps -axo pid,ppid,stat,comm", exit: capture.status,
    tool: "node:child_process.spawnSync", platform: `${process.platform} ${release()}`,
    sha256: createHash("sha256").update(capture.stdout).digest("hex"), stdout }));
  const lines = stdout.split("\n");
  assert.equal(lines[0], "  PID  PPID STAT COMM");
  assert.equal(lines.pop(), "");
  const expected = ["PID\tPPID\tSTAT\tCOMM", ...lines.slice(1).map(line =>
    [line.slice(0, 5).trim(), line.slice(6, 11).trim(), line.slice(12, 16).trimEnd(), line.slice(17)].join("\t"))].join("\n");
  assert.equal(replacement(stdout), expected);
});
