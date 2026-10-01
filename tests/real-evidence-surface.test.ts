import assert from "node:assert/strict";
import { test } from "node:test";
import { filter } from "../src/core/engine.js";

const { checkEvidence } = await import(new URL("../scripts/real-world/evidence.mjs", import.meta.url).href);
const bytes = (text: string): number => Buffer.byteLength(text, "utf8");
const capture = (output: string, complete = true) => ({ output, complete, exitCode: 0, signal: null, timedOut: false });
const spec = (oracle: string) => ({ id: `surface-${oracle}`, oracle, expectExit: "zero" });
const exact = (output: string) => ({ status: "passthrough", reason: "micro_fixture", inputBytes: bytes(output), outputBytes: bytes(output) });
const reduced = (output: string, replacement: string) => ({ status: "reduced", reason: "micro_fixture", replacement,
  inputBytes: bytes(output), outputBytes: bytes(replacement) });
function rejected(oracle: string, input: string, output: string): void {
  const found = checkEvidence(spec(oracle), capture(input), reduced(input, output));
  assert.equal(found.ok, false, JSON.stringify(found));
  assert.ok(found.violations.some((line: string) => line.includes(": no_replacement:")), JSON.stringify(found));
  assert.equal(checkEvidence(spec(oracle), capture(input), exact(input)).ok, true, "Whole original remains valid safety evidence");
}

test("Incomplete exact capture fails native validity while actual filter preserves exact UTF-8 bytes", () => {
  const output = "native café🔥\r\nlast", native = capture(output, false), original = JSON.stringify(native);
  const result = filter({ source: "shell", command: "unknown", output, presentation: "unknown", completeness: "unknown",
    termination: { kind: "exited", code: 0 } });
  assert.equal(result.status, "passthrough");
  assert.equal("replacement" in result, false);
  assert.equal(result.inputBytes, bytes(output)); assert.equal(result.outputBytes, bytes(output));
  const found = checkEvidence(spec("exact"), native, result);
  assert.equal(found.ok, false);
  assert.deepEqual(found.violations, ["surface-exact: native_completeness: native capture is incomplete"]);
  assert.equal(JSON.stringify(native), original, "Validity failure must not alter captured bytes");
  assert.equal(checkEvidence(spec("exact"), capture(output), exact(output)).ok, true);
  const replacing = checkEvidence(spec("exact"), native, reduced(output, "native\n"));
  assert.ok(replacing.violations.some((line: string) => line.includes(": native_completeness:")));
  assert.ok(replacing.violations.some((line: string) => line.includes(": no_replacement:")));
});

const finished = "    Finished `dev` profile [unoptimized + debuginfo] target(s) in 0.01s\n";
test("U+007F through U+009F inside otherwise compiling Cargo path require whole original", () => {
  const compiling = "   Compiling micro v1.0.0 (/tmp/micro)\n";
  assert.equal(checkEvidence(spec("cargo-build"), capture(compiling + finished), reduced(compiling + finished, finished)).ok, true);
  for (let code = 0x7f; code <= 0x9f; code++) {
    const input = compiling.replace("/tmp/micro", "/tmp/micro" + String.fromCharCode(code)) + finished;
    rejected("cargo-build", input, finished);
  }
});

const branch = "On branch micro\nYour branch and 'origin/main' have diverged,\n";
const advice = '  (use "git pull" to merge the remote branch into yours)\n';
const continuation = "and have 1 and 1 different commits each, respectively.\n";
const footer = "\nnothing to commit, working tree clean\n";
test("Git mandatory divergence continuation precedes advice admission", () => {
  const output = branch + continuation + footer, valid = branch + continuation + advice + footer;
  assert.equal(checkEvidence(spec("git"), capture(valid), reduced(valid, output)).ok, true);
  rejected("git", branch + advice + continuation + footer, output);
  rejected("git", branch + "\n" + continuation + advice + footer, branch + "\n" + continuation + footer);
  rejected("git", branch + advice + footer, branch + footer);
  rejected("git", branch + continuation.replace("1 and 1", "0 and 1") + advice + footer,
    branch + continuation.replace("1 and 1", "0 and 1") + footer);
  const crlf = (text: string): string => text.replaceAll("\n", "\r\n");
  assert.equal(checkEvidence(spec("git"), capture(crlf(valid)), reduced(crlf(valid), crlf(output))).ok, true);
  rejected("git", crlf(branch + advice + continuation + footer), crlf(output));
});
