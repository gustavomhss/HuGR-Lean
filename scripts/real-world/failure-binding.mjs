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
const pytestBody = (text) => text.replace(/^=+\s*|\s*=+$/g, "").trim();
function parsedPytestSummary(text) {
  const body = pytestBody(text), split = body.lastIndexOf(" in "), duration = body.slice(split + 4);
  if (split <= 0 || !/^\d+(?:\.\d+)?s$/.test(duration) || !Number.isFinite(Number(duration.slice(0, -1)))) return undefined;
  const counts = new Map();
  for (const token of body.slice(0, split).split(", ")) {
    const count = /^(0|[1-9][0-9]*) (passed|skipped|failed|errors?|xfailed|xpassed|warnings?|subtests passed)$/.exec(token);
    if (!count || !Number.isSafeInteger(Number(count[1]))) return undefined;
    const category = count[2].replace(/^(error|warning)s$/, "$1");
    if (counts.has(category)) return undefined;
    counts.set(category, Number(count[1]));
  }
  return counts;
}
export function pytestSummary(text) { return parsedPytestSummary(text) !== undefined; }

function pytestFooter(text, short) {
  let final = text.length - 1;
  while (text[final] === "") final--;
  const counts = parsedPytestSummary(text[final] ?? ""), records = text.slice(short + 1, final), nodeids = new Set();
  if (!counts || !(counts.get("failed") > 0) || (counts.get("error") ?? 0) > 0 || !records.length) return false;
  // Wrapped duration delimiters and plain " in <token>s" rows are candidates
  // independently of counts; retain known outcome-shaped malformed rows too.
  const summaryLike = (line) => /^=+ .* in .* =+$/.test(line) || /^\S.* in \S+s$/.test(line) ||
    /^(?:\S+ (?:passed|skipped|failed|errors?|xfailed|xpassed|warnings?|subtests passed)\b|[+-]?\d\S* .+ in )/.test(pytestBody(line));
  for (const line of records) {
    const record = /^FAILED (\S+::\S+) - (.+)$/.exec(line);
    if (!record || nodeids.has(record[1])) return false;
    nodeids.add(record[1]);
  }
  // Only validated FAILED rows in this bounded section take precedence over candidates.
  if (text.some((line, index) => index !== final && !(index > short && index < final) && summaryLike(line))) return false;
  return counts.get("failed") === nodeids.size;
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
    const identity = /^FAILED tests\/bench_expected_failure_test\.py::test_bench_expected_failure - (.*)$/.exec(failed[0] ?? "");
    return error >= 2 && body[error - 2].trim() === "def test_bench_expected_failure():" &&
      assertion?.[2] === marker && location && tail && failed.length === 1 &&
      !!identity && ["As...", `AssertionError: ${marker}`].includes(identity[1]) &&
      pytestFooter(text, short);
  }
  if (oracle === "jest") return jestFailure(text, marker);
  if (oracle === "vitest") return vitestFailure(text, marker);
  return false;
}

function coherentCount(line, pattern) {
  const count = pattern.exec(line);
  return !!count && count.slice(1).every((value) => value === undefined || Number.isSafeInteger(Number(value))) &&
    Number(count[1]) + Number(count[2] ?? 0) === Number(count[3]);
}
function failedFooter(text, start, oracle, expectedFailures) {
  const suites = oracle === "jest" ? /^Test Suites: +([1-9]\d*) failed(?:, ([1-9]\d*) passed)?, ([1-9]\d*) total$/ :
    /^ Test Files +([1-9]\d*) failed(?: \| ([1-9]\d*) passed)? \(([1-9]\d*)\)$/;
  const tests = oracle === "jest" ? /^Tests: +([1-9]\d*) failed(?:, ([1-9]\d*) passed)?, ([1-9]\d*) total$/ :
    /^ {6}Tests +([1-9]\d*) failed(?: \| ([1-9]\d*) passed)? \(([1-9]\d*)\)$/;
  // Unique native summary labels include unsupported counts, even after other suites.
  const suitePrefix = oracle === "jest" ? /^Test Suites:/ : /^ Test Files\b/;
  const testPrefix = oracle === "jest" ? /^Tests:/ : /^ {6}Tests\b/;
  const index = unique(text, (line) => suitePrefix.test(line)), next = unique(text, (line) => testPrefix.test(line));
  return index >= start && next === index + 1 && coherentCount(text[index], suites) && coherentCount(text[next], tests) &&
    (expectedFailures === undefined || Number(tests.exec(text[next])[1]) === expectedFailures);
}
function controlledAssertion(source, marker) {
  const call = /^test\((["'])([^"']*)\1, \(\) => \{ expect\(true\)\.toBe\(false\); \}\);$/.exec(source);
  return call?.[2] === marker;
}

// Data-only association: native caret padding and location use source UTF-16
// columns after the numbered gutter, not UTF-8 bytes or compiler execution.
function positionedCaret(frameRow, caretRow, source, locationColumn) {
  const caret = /^( +)\|( +)\^$/.exec(caretRow ?? ""), gutter = frameRow.indexOf("|");
  if (!caret || caret[1].length !== gutter) return false;
  const column = caretRow.indexOf("^") - (gutter + 2) + 1, expected = Number(locationColumn);
  return Number.isSafeInteger(expected) && column === expected && column >= 1 && column <= source.length;
}

function jestFailure(text, marker) {
  const file = /^ ?FAIL ((?:src|test|tests)\/bench-expected-failure\.test\.[cm]?[jt]s)(?: \(\d+(?:\.\d+)? s\))?$/;
  const start = unique(text, (line) => file.test(line));
  const suite = bounded(text, start, (line) => /^(?: ?(?:PASS|FAIL) |Test Suites:)/.test(line));
  if (!suite) return false;
  const heading = unique(suite.body, (line) => line === `  ● ${marker}`);
  if (heading < 0 || suite.body.slice(0, heading).some((line) => line !== "")) return false;
  const tail = suite.body.slice(heading + 1), stop = tail.findIndex((line) => /^ {2}● /.test(line));
  const body = (stop < 0 ? tail : tail.slice(0, stop)).filter((line) => line !== "");
  if (!/^ {4}expect\(received\)\.toBe\(expected\)(?: \/\/ Object\.is equality)?$/.test(body[0] ?? "") ||
      body[1] !== "    Expected: false" || body[2] !== "    Received: true") return false;
  const pointer = body.findIndex((line) => /^ {4}> [1-9]\d* \| /.test(line));
  const frame = /^ {4}> ([1-9]\d*) \| (.*)$/.exec(body[pointer] ?? "");
  const at = body.findIndex((line) => /^ {6}at /.test(line));
  const location = /^ {6}at Object\.<anonymous> \(([^()]+):([1-9]\d*):([1-9]\d*)\)$/.exec(body[at] ?? "");
  const sourceRow = (line) => /^ +[1-9]\d* \|(?: .*)?$/.test(line);
  return pointer >= 3 && !!frame && controlledAssertion(frame[2], marker) &&
    body.slice(3, pointer).every(sourceRow) && !!location &&
    positionedCaret(body[pointer], body[pointer + 1], frame[2], location[3]) &&
    at > pointer + 1 && at === body.length - 1 && body.slice(pointer + 2, at).every(sourceRow) && !!location &&
    location[1] === file.exec(text[start])[1] && location[2] === frame[1] && failedFooter(text, suite.stop, "jest");
}

function vitestSection(text, control) {
  const header = /^⎯+ Failed Tests ([1-9]\d*) ⎯+$/;
  const start = unique(text, (line) => header.test(line));
  const section = bounded(text, start, (line) => /^(?: Test Files|⎯+ [^⎯]+ ⎯+$)/.test(line));
  if (!section || control <= start || control >= section.stop) return undefined;
  const count = Number(header.exec(text[start])[1]), identities = new Set();
  if (!Number.isSafeInteger(count)) return undefined;
  let pending = false, content = false, records = 0, ordinal;
  for (const [offset, line] of section.body.entries()) {
    if (line === "") continue;
    const record = /^ FAIL +(\S+) > (.+)$/.exec(line);
    if (record) {
      const identity = JSON.stringify(record.slice(1));
      if (pending || identities.has(identity)) return undefined;
      identities.add(identity); records++; pending = true; content = false;
      if (start + 1 + offset === control) ordinal = records;
      continue;
    }
    const trailer = /^⎯+\[([1-9]\d*)\/([1-9]\d*)\]⎯+$/.exec(line);
    if (trailer) {
      if (!pending || !content || Number(trailer[1]) !== records || Number(trailer[2]) !== count) return undefined;
      pending = false; continue;
    }
    if (!pending || /^(?: FAIL |⎯)/.test(line)) return undefined;
    content = true;
  }
  return !pending && records === count ? { count, ordinal, stop: section.stop } : undefined;
}

function vitestFailure(text, marker) {
  const file = /^ FAIL +((?:test)\/bench-expected-failure\.test\.[cm]?[jt]s) > (.+)$/;
  const start = unique(text, (line) => file.exec(line)?.[2] === marker);
  const block = bounded(text, start, (line) => /^(?: FAIL | Test Files)/.test(line));
  const section = vitestSection(text, start);
  if (!block || !section || block.stop > section.stop) return false;
  const body = block.body.filter((line) => line !== "");
  if (body[0] !== "AssertionError: expected true to be false // Object.is equality" ||
      body[1] !== "- Expected" || body[2] !== "+ Received" || body[3] !== "- false" || body[4] !== "+ true") return false;
  const location = /^ ❯ ([^:]+):([1-9]\d*):([1-9]\d*)$/.exec(body[5] ?? "");
  const pointer = body.findIndex((line, index) => index >= 6 && /^ +[1-9]\d*\| /.test(line) &&
    /^ +([1-9]\d*)\| /.exec(line)?.[1] === location?.[2]);
  const frame = /^ +([1-9]\d*)\| (.*)$/.exec(body[pointer] ?? "");
  const trailer = /^⎯+\[([1-9]\d*)\/([1-9]\d*)\]⎯+$/.exec(body.at(-1) ?? "");
  return !!location && location[1] === file.exec(text[start])[1] && pointer >= 6 && !!frame &&
    controlledAssertion(frame[2], marker) && body.slice(6, pointer).every((line) => /^ +[1-9]\d*\|(?: .*)?$/.test(line)) &&
    positionedCaret(body[pointer], body[pointer + 1], frame[2], location[3]) &&
    body.slice(pointer + 2, -1).every((line) => /^ +[1-9]\d*\|(?: .*)?$/.test(line)) &&
    !!trailer && Number(trailer[1]) === section.ordinal && Number(trailer[2]) === section.count &&
    failedFooter(text, section.stop, "vitest", section.count);
}
