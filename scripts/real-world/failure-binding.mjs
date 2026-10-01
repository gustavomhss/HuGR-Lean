// Pure controlled-failure bindings. Native boundaries, identities and locations
// must agree; marker text in quoted source or unrelated diagnostics proves nothing.
const unique = (text, predicate) => {
  const index = text.findIndex(predicate);
  return index >= 0 && !text.slice(index + 1).some(predicate) ? index : -1;
};
function bounded(text, start, end) {
  if (start < 0) return undefined;
  const stop = text.findIndex((line, index) => index > start && end(line));
  return stop > start ? { body: text.slice(start + 1, stop), stop } : undefined;
}
export function pytestSummary(text) {
  const body = text.replace(/^=+\s*|\s*=+$/g, "").trim(), split = body.lastIndexOf(" in ");
  return split > 0 && /^\d+(?:\.\d+)?s$/.test(body.slice(split + 4)) && body.slice(0, split).split(", ").every((count) =>
    /^\d+ (?:passed|skipped|failed|errors?|xfailed|xpassed|warnings?|subtests passed)$/.test(count));
}

export function nativeFailureBinding(oracle, text, marker, code) {
  if (oracle === "cargo-build" || oracle === "cargo-test") {
    const start = unique(text, (line) => line === `error: ${marker}`);
    const block = bounded(text, start, (line) => /^error(?::|\[)/.test(line));
    const footer = unique(text, (line) => /^error: could not compile `[^`]+`.* due to [1-9][0-9]* previous errors?$/.test(line));
    const body = block?.body.filter((line) => line !== "") ?? [];
    return code === 101 && !!block && footer >= block.stop &&
      /^ +--> src\/lib\.rs:[1-9][0-9]*:[1-9][0-9]*$/.test(body[0] ?? "") &&
      body.filter((line) => /^ +--> /.test(line)).length === 1;
  }
  if (code !== 1) return false;
  if (oracle === "go") {
    const start = unique(text, (line) => line === "=== RUN   TestBenchExpectedFailure");
    const block = bounded(text, start, (line) => /^(?:=== RUN|--- (?:PASS|FAIL|SKIP):)/.test(line));
    return !!block && /^--- FAIL: TestBenchExpectedFailure \(\d+(?:\.\d+)?s\)$/.test(text[block.stop]) &&
      block.body.some((line) => /^ {4}bench_expected_failure_test\.go:[1-9][0-9]*: (.*)$/.exec(line)?.[1] === marker) &&
      text.slice(block.stop + 1).includes("FAIL") &&
      text.slice(block.stop + 1).some((line) => /^FAIL[ \t]+[^\s]+\t\d+(?:\.\d+)?s$/.test(line));
  }
  if (oracle === "pytest") {
    const start = unique(text, (line) => /^=+ FAILURES =+$/.test(line));
    const short = unique(text, (line) => /^=+ short test summary info =+$/.test(line));
    if (start < 0 || short <= start) return false;
    const heading = unique(text, (line) => /^_+ test_bench_expected_failure _+$/.test(line));
    const block = bounded(text, heading, (line) => /^(?:_+ |={3,} )/.test(line));
    if (!block || heading <= start || block.stop > short) return false;
    const body = block.body.filter((line) => line !== "");
    const error = body.findIndex((line) => /^E +AssertionError: (.*)$/.exec(line)?.[1] === marker);
    const assertion = /^> +assert False, (["'])(.*)\1$/.exec(body[error - 1] ?? "");
    const location = /^tests\/bench_expected_failure_test\.py:[1-9][0-9]*: AssertionError$/.test(body.at(-1) ?? "");
    const tail = error === body.length - 2 || error === body.length - 3 && /^E +assert False$/.test(body[error + 1]);
    const failed = text.slice(short + 1).filter((line) => /^FAILED \S+::test_bench_expected_failure(?: |$)/.test(line));
    return error >= 2 && body[error - 2].trim() === "def test_bench_expected_failure():" &&
      assertion?.[2] === marker && location && tail && failed.length === 1 &&
      /^FAILED tests\/bench_expected_failure_test\.py::test_bench_expected_failure(?: - .*)?$/.test(failed[0]) &&
      text.slice(short + 1).some((line) => pytestSummary(line) && /\b[1-9][0-9]* failed\b/.test(line));
  }
  return false;
}
