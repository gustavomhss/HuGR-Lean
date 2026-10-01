// Pure, independent checks of captured native output. No production parsers or I/O.
// Signals are original native rows, not execution, coverage or savings claims.
import { nativeFailureBinding, pytestSummary } from "./failure-binding.mjs";

const oracles = new Set(["exact", "cargo-build", "cargo-test", "pytest", "go", "jest", "vitest", "git", "rg", "node"]);
const statuses = new Set(["reduced", "normalized", "passthrough", "failed_open"]);
const bytes = (text) => Buffer.byteLength(text, "utf8");
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const owns = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const uint = (text) => /^(0|[1-9][0-9]*)$/.test(text) && Number.isSafeInteger(Number(text));
const equal = (left, right) => JSON.stringify(left) === JSON.stringify(right);
// Inspection only: bounded simple SGR parameters. Unknown controls cannot supply
// evidence. Raw rows, metrics and the production observation are never projected.
function inspect(text) {
  const plain = text.replace(/\x1b\[((?:[0-9]{1,3}(?:;[0-9]{1,3}){0,15})?)m/g, (raw, parameters) =>
    parameters === "" || parameters.split(";").every((value) => /^(?:[0-9]|2[1-57-9]|[34][0-79]|9[0-7]|10[0-7])$/.test(value)) ? "" : raw);
  return /[\x00-\x08\x0b-\x1f\x7f-\x9f]/.test(plain) ? undefined : plain;
}
function rows(output) {
  return (output.match(/[^\n]*\n|[^\n]+$/g) ?? []).map((raw) => {
    const eol = raw.endsWith("\r\n") ? "\r\n" : raw.endsWith("\n") ? "\n" : "";
    const text = raw.slice(0, raw.length - eol.length);
    return { raw, text, view: inspect(text), eol };
  });
}
const advice = [
  ['(use "git restore --staged <file>..." to unstage)'],
  ['(use "git restore --staged <file>..." to unstage)', '(use "git add <file>..." to mark resolution)'],
  ['(use "git add <file>..." to update what will be committed)', '(use "git add/rm <file>..." to update what will be committed)', '(use "git restore <file>..." to discard changes in working directory)', '(commit or discard the untracked or modified content in submodules)'],
  ['(use "git add <file>..." to include in what will be committed)'],
];
const branchAdvice = [
  '(use "git push" to publish your local commits)', '(use "git pull" to update your local branch)',
  '(use "git pull" to merge the remote branch into yours)', '(use "git branch --unset-upstream" to fixup)',
];
const mergeAdvice = ['(fix conflicts and run "git commit")', '(use "git merge --abort" to abort the merge)', '(use "git commit" to conclude merge)'];
const fixedAdvice = new Set([...advice.flat(), ...branchAdvice, ...mergeAdvice]);

// Summary discovery does not depend on full-grammar acceptance. Unknown variants
// can still expose a critical native summary while requiring exact passthrough.
function summaries(oracle, source) {
  return source.filter(({ view: text }) => {
    if (text === undefined) return false;
    switch (oracle) {
      case "cargo-build": return /^(?:Finished |error: )/.test(text.trimStart());
      case "cargo-test": return text.trimStart().startsWith("Finished ") || text.startsWith("test result:");
      case "pytest": return pytestSummary(text);
      case "go": return text === "PASS" || text === "FAIL" || /^(?:ok|FAIL)[ \t]/.test(text);
      case "jest": return /^(?:Test Suites:|Tests:|Snapshots:|Seed:|Time:|Ran all test suites)/.test(text);
      case "vitest": return /^(?:Test Files|Tests|Start at|Duration)\s/.test(text.trimStart());
      case "git": return text !== "" && !fixedAdvice.has(text.trim());
      case "rg": return text !== "";
      default: return false;
    }
  });
}
// Bind the catalog's controlled identities to native diagnostics, not prose or
// a marker quoted in source/arguments. Unsupported failure proofs fail closed.
function failureBinding(oracle, source, marker, code) {
  if (source.some((row) => row.view === undefined)) return false;
  const text = source.map((row) => row.view ?? ""), trimmed = text.map((line) => line.trim());
  if (["cargo-build", "cargo-test", "go", "pytest"].includes(oracle)) return nativeFailureBinding(oracle, text, marker, code);
  const segment = (start, end) => {
    const index = text.findIndex(start);
    if (index < 0) return [];
    const tail = text.slice(index + 1), stop = tail.findIndex(end);
    return stop < 0 ? tail : tail.slice(0, stop);
  };
  const failed = (prefix) => trimmed.some((line) => {
    const count = new RegExp(`^${prefix} +([1-9][0-9]*) failed(?:[, |]|$)`).exec(line);
    return count && uint(count[1]);
  });
  if (code !== 1) return false;
  if (oracle === "jest") {
    const suite = segment((line) => /^ ?FAIL (?:src|test|tests)\/bench-expected-failure\.test\.[cm]?[jt]s(?: \(\d+(?:\.\d+)? s\))?$/.test(line), (line) => /^(?: ?(?:PASS|FAIL) |Test Suites:)/.test(line));
    const start = suite.findIndex((line) => line.trim() === `● ${marker}`);
    if (start < 0) return false;
    const tail = suite.slice(start + 1), stop = tail.findIndex((line) => /^\s*● /.test(line)), body = (stop < 0 ? tail : tail.slice(0, stop)).map((line) => line.trim());
    const assertion = body.findIndex((line) => /^expect\(received\)\..*\(expected\)/.test(line));
    const expected = body.findIndex((line) => line.startsWith("Expected:")), received = body.findIndex((line) => line.startsWith("Received:"));
    return assertion >= 0 && expected > assertion && received > expected && failed("Tests:");
  }
  if (oracle === "vitest") {
    const body = segment((line) => /^ FAIL +test\/bench-expected-failure\.test\.[cm]?[jt]s > /.test(line) &&
      line.trim().endsWith(` > ${marker}`), (line) => /^(?: FAIL | Test Files| +Tests )/.test(line));
    return body.some((line) => line.trim().startsWith("AssertionError: ")) && failed("Tests");
  }
  return false;
}

function runnerEvidence(oracle, source) {
  const kept = [], counts = { passed: 0, ignored: 0, total: undefined, files: 0, leaves: 0 };
  const names = new Set(), fileLeaves = [];
  let shape = "", depth = 0;
  let known = true, finished = 0, summary = 0, running = 0, platform = 0, root = 0, banner = 0;
  let pendingGo, pendingHeading = false;
  const keep = (row, text = row.text) => kept.push(text + row.eol);
  for (const row of source) {
    const { text } = row;
    if (text === "") { if (oracle === "jest" || oracle === "vitest") kept.push(row.raw); continue; }
    if (oracle.startsWith("cargo-")) {
      if (/^   Compiling \S+ v\d+\.\d+\.\d+(?:[-+][\w.-]+)?(?: \(.+\))?$/.test(text)) { shape += "c"; continue; }
      if (/^    Finished `(?:dev|test)` profile \[unoptimized \+ debuginfo\] target\(s\) in \d+(?:\.\d+)?s$/.test(text)) {
        shape += "f"; finished++; known &&= text.includes(oracle === "cargo-build" ? "`dev`" : "`test`"); keep(row); continue;
      }
      if (oracle === "cargo-test") {
        if (/^     Running (?:unittests |tests\/).+ \(target\/debug\/deps\/.+\)$/.test(text)) { shape += "r"; running++; keep(row); continue; }
        const count = /^running (\d+) tests?$/.exec(text);
        if (count && uint(count[1])) { shape += "h"; known &&= counts.total === undefined && text.endsWith(Number(count[1]) === 1 ? " test" : " tests"); counts.total = Number(count[1]); continue; }
        if (text.startsWith("test ")) {
          const parts = text.slice(5).split(" ... ");
          if (parts.length === 2 && /^[\p{L}_][\p{L}\p{N}_]*(?:::[\p{L}_][\p{L}\p{N}_]*)*$/u.test(parts[0])) {
            known &&= !names.has(parts[0]); names.add(parts[0]);
            if (parts[1] === "ok") { shape += "p"; counts.passed++; continue; }
            if (parts[1] === "ignored" || parts[1].startsWith("ignored, ")) { shape += "i"; counts.ignored++; keep(row); continue; }
          }
        }
        const result = /^test result: ok\. (\d+) passed; 0 failed; (\d+) ignored; 0 measured; (\d+) filtered out; finished in \d+(?:\.\d+)?s$/.exec(text);
        if (result && result.slice(1).every(uint)) {
          shape += "z"; summary++; known &&= Number(result[1]) === counts.passed && Number(result[2]) === counts.ignored;
          keep(row); continue;
        }
      }
    } else if (oracle === "pytest") {
      if (/^=+ test session starts =+$/.test(text)) { shape += "b"; banner++; continue; }
      if (/^platform \S+ -- Python \d+\.\d+\.\d+, pytest-9\.0\.3, pluggy-1\.6\.0$/.test(text)) { shape += "v"; platform++; keep(row); continue; }
      if (text.startsWith("rootdir: ") && text.length > 9) { shape += "r"; root++; keep(row); continue; }
      if (/^configfile: .+\.(?:toml|ini|cfg)$/.test(text)) { shape += "c"; keep(row); continue; }
      const count = /^collected (\d+) items?$/.exec(text);
      if (count && uint(count[1])) { shape += "h"; known &&= counts.total === undefined && text.endsWith(Number(count[1]) === 1 ? " item" : " items"); counts.total = Number(count[1]); continue; }
      const progress = /^(\S+\.py) ([.s]+) +\[ *(\d+)%\]$/.exec(text);
      if (progress) {
        shape += progress[2].includes("s") ? "i" : "p";
        known &&= !names.has(progress[1]); names.add(progress[1]);
        counts.passed += [...progress[2]].filter((mark) => mark === ".").length;
        counts.ignored += [...progress[2]].filter((mark) => mark === "s").length;
        known &&= Number(progress[3]) === Math.floor((counts.passed + counts.ignored) * 100 / counts.total);
        if (progress[2].includes("s")) keep(row);
        continue;
      }
      const result = /^=+ (?:(\d+) passed(?:, (\d+) skipped)?|(\d+) skipped) in \d+(?:\.\d+)?s =+$/.exec(text);
      if (result) {
        shape += "z"; summary++; known &&= result.slice(1).filter((value) => value !== undefined).every((value) => uint(value) && Number(value) > 0) &&
          Number(result[1] ?? 0) === counts.passed && Number(result[2] ?? result[3] ?? 0) === counts.ignored;
        keep(row); continue;
      }
    } else if (oracle === "go") {
      if (text.startsWith("=== RUN   ") && /^Test[\p{L}\p{N}_]+$/u.test(text.slice(10))) {
        shape += "r"; known &&= pendingGo === undefined && !names.has(text.slice(10)); names.add(text.slice(10)); pendingGo = row; running++; continue;
      }
      const end = /^--- (PASS|SKIP): (Test[\p{L}\p{N}_]+) \(\d+(?:\.\d+)?s\)$/u.exec(text);
      if (end) {
        shape += end[1] === "PASS" ? "p" : "i";
        known &&= pendingGo?.text.slice(10) === end[2];
        if (end[1] === "SKIP" && pendingGo) { keep(pendingGo); keep(row); }
        pendingGo = undefined; continue;
      }
      if (text === "PASS") { shape += "f"; finished++; keep(row); continue; }
      if (/^ok[ \t]+[^\s]+\t\d+(?:\.\d+)?s$/.test(text)) { shape += "z"; summary++; keep(row); continue; }
    } else if (oracle === "jest") {
      if (/^ ?PASS .+$/.test(text)) { shape += "f"; known &&= !pendingHeading; depth = 0; counts.files++; fileLeaves.push(0); keep(row, "+ " + text.slice(text.startsWith(" ") ? 6 : 5)); continue; }
      const leaf = /^( {2,})✓ (.+)$/.exec(text);
      const heading = /^( {2,})[^\s✓○✎].*$/.exec(text);
      const detail = leaf ?? heading;
      if (detail && counts.files) {
        const level = detail[1].length / 2;
        known &&= Number.isInteger(level) && level <= depth + 1 && (!pendingHeading || level === depth + 1);
        if (leaf) { shape += "d"; counts.leaves++; fileLeaves[fileLeaves.length - 1]++; depth = Math.min(depth, level - 1); pendingHeading = false; keep(row, leaf[1] + "- " + leaf[2]); }
        else { shape += "h"; depth = level; pendingHeading = true; keep(row); }
        continue;
      }
      const total = /^(Test Suites|Tests): +(\d+) passed, (\d+) total$/.exec(text);
      if (total && uint(total[2]) && total[2] === total[3] && Number(total[2]) > 0) {
        shape += total[1] === "Test Suites" ? "S" : "T";
        known &&= total[1] === "Test Suites" ? Number(total[2]) === counts.files : !counts.leaves || Number(total[2]) === counts.leaves;
        if (total[1] === "Test Suites") finished++; else summary++;
        keep(row); continue;
      }
      const snapshots = /^Snapshots: +(\d+) passed, (\d+) total$/.exec(text);
      if (/^Snapshots: +0 total$/.test(text) || snapshots && uint(snapshots[1]) && snapshots[1] === snapshots[2]) { shape += "n"; keep(row); continue; }
      if (/^Seed: +-?\d+$/.test(text)) { shape += "q"; keep(row); continue; }
      if (/^Time: +\d+(?:\.\d+)? s(?:, estimated \d+(?:\.\d+)? s)?$/.test(text)) { shape += "v"; keep(row); continue; }
      if (/^Ran all test suites(?: matching .+)?\.$/.test(text)) { shape += "z"; keep(row); continue; }
    } else if (oracle === "vitest") {
      if (/^ RUN  v\d+\.\d+\.\d+(?:[-+][\w.-]+)? .+$/.test(text)) { shape += "b"; banner++; keep(row); continue; }
      const file = /^ ✓ (.+) \(([1-9]\d*) tests?\)(?: (\d+(?:\.\d+)?)ms)?$/.exec(text);
      if (file && uint(file[2])) {
        shape += "f"; counts.files++; counts.leaves += Number(file[2]);
        keep(row, file[3] === undefined ? text : text.slice(0, -(file[3].length + 3))); continue;
      }
      const total = /^ +(Test Files|Tests) +(\d+) passed \((\d+)\)$/.exec(text);
      if (total && uint(total[2]) && total[2] === total[3]) {
        shape += total[1] === "Test Files" ? "S" : "T";
        known &&= Number(total[2]) === (total[1] === "Test Files" ? counts.files : counts.leaves);
        if (total[1] === "Test Files") finished++; else summary++;
        keep(row); continue;
      }
      if (/^ {3}Start at +(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(text)) { shape += "v"; platform++; keep(row); continue; }
      if (/^ {3}Duration +\d+(?:\.\d+)?(?:ms|s)(?: \((?:(?:transform|setup|collect|import|tests|environment|prepare) \d+(?:\.\d+)?(?:ms|s)(?:, )?)+\))?$/.test(text)) { shape += "z"; root++; keep(row); continue; }
    }
    known = false;
  }
  if (oracle === "cargo-build") known &&= finished === 1;
  if (oracle === "cargo-test") known &&= finished === 1 && running === 1 && summary === 1 && counts.total === counts.passed + counts.ignored;
  if (oracle === "pytest") known &&= banner === 1 && platform === 1 && root === 1 && summary === 1 && counts.total > 0 && counts.total === counts.passed + counts.ignored;
  if (oracle === "go") known &&= running > 0 && pendingGo === undefined && finished === 1 && summary === 1;
  if (oracle === "jest") known &&= counts.files > 0 && !pendingHeading && finished === 1 && summary === 1;
  if (oracle === "vitest") known &&= counts.files > 0 && banner <= 1 && finished === 1 && summary === 1 && platform === 1 && root === 1;
  const shapes = { "cargo-build": /^c*f$/, "cargo-test": /^c*frh[pi]*z$/, pytest: /^bvrc?h[pi]+z$/, go: /^(?:r[pi])+fz$/, jest: /^(?:f[hd]*)+STn?q?v?z?$/, vitest: /^b?f+STvz$/ };
  known &&= shapes[oracle].test(shape) && (oracle !== "jest" || counts.leaves === 0 || fileLeaves.every((count) => count > 0));
  return { known, kept };
}

// Git reduction may remove fixed, context-valid advice only. Every other native
// nonblank row stays intact, including status labels, rename ends and submodules.
function gitEvidence(source) {
  const titles = ["Changes to be committed:", "Unmerged paths:", "Changes not staged for commit:", "Untracked files:"];
  const kept = [], counts = [0, 0, 0, 0], used = new Set();
  let section = -1, tracking = false, initial = false, merge = "", footer = false, divergence = false;
  let allowed = [], known = /^(?:On branch .+|HEAD detached (?:at|from) .+|Not currently on any branch\.)$/.test(source[0]?.text ?? "");
  const path = (text) => text.length > 0 && text.trim() === text && !/["'\\:\t\r\n]/.test(text) && !text.includes(" -> ") &&
    [...text].every((char) => /[\p{L}\p{M}\p{N}\p{S} _./@+-]/u.test(char));
  for (let index = 0; index < source.length; index++) {
    const row = source[index], { text } = row;
    if (divergence) {
      kept.push(row.raw);
      known &&= /^and have [1-9]\d* and [1-9]\d* different commits each, respectively\.$/.test(text);
      divergence = false; continue;
    }
    if (text === "") { kept.push(row.raw); continue; }
    if (index === 0) { kept.push(row.raw); continue; }
    if (footer) known = false;
    if (fixedAdvice.has(text.trim()) && /^(?:  |\t)\(/.test(text)) {
      const key = section + text.trim();
      known &&= (section < 0 ? allowed : counts[section] === 0 ? advice[section] : []).includes(text.trim()) && !used.has(key);
      used.add(key); continue;
    }
    kept.push(row.raw);
    const next = titles.indexOf(text);
    if (next >= 0) { known &&= next > section && (section < 0 || counts[section] > 0); section = next; continue; }
    if (section < 0 && text.startsWith("Your branch ")) {
      known &&= !tracking; tracking = true;
      const variants = [
        /^Your branch is ahead of '.+' by [1-9]\d* commits?\.$/, /^Your branch is behind '.+' by [1-9]\d* commits?, and can be fast-forwarded\.$/,
        /^Your branch and '.+' have diverged,$/, /^Your branch is based on '.+', but the upstream is gone\.$/,
      ];
      const variant = variants.findIndex((pattern) => pattern.test(text));
      known &&= variant >= 0 || /^Your branch is up to date with '.+'\.$/.test(text);
      if (variant >= 0) allowed.push(branchAdvice[variant]);
      divergence = variant === 2; continue;
    }
    if (section < 0 && (text === "No commits yet" || text === "Initial commit")) { known &&= !initial; initial = true; continue; }
    if (section < 0 && ["You have unmerged paths.", "All conflicts fixed but you are still merging."].includes(text)) {
      known &&= !merge; merge = text; allowed.push(...(text.startsWith("You have") ? mergeAdvice.slice(0, 2) : mergeAdvice.slice(2))); continue;
    }
    const clean = ["nothing to commit, working tree clean", 'nothing to commit (create/copy files and use "git add" to track)'].includes(text);
    const unstaged = text === 'no changes added to commit (use "git add" and/or "git commit -a")';
    const untracked = text === 'nothing added to commit but untracked files present (use "git add" to track)';
    if (clean || unstaged || untracked) {
      known &&= clean ? counts.every((count) => count === 0) : unstaged ? counts[0] === 0 && counts[1] + counts[2] > 0 : counts[0] + counts[1] + counts[2] === 0 && counts[3] > 0;
      footer = true; continue;
    }
    if (section < 0 || !(text.startsWith("\t") || text.startsWith("  "))) { known = false; continue; }
    const entry = text.slice(text.startsWith("\t") ? 1 : 2);
    let valid = false;
    if (section === 3) valid = path(entry);
    else {
      const colon = entry.indexOf(":"), label = entry.slice(0, colon), body = entry.slice(colon + 1).replace(/^ +/, "");
      const labels = section === 1 ? ["both modified", "both added", "both deleted", "added by us", "added by them", "deleted by us", "deleted by them"] : ["modified", "new file", "deleted", "renamed", "copied", "typechange"];
      let paths = body;
      if (section === 2 && label === "modified") paths = body.replace(/ \((?:new commits(?:, modified content)?(?:, untracked content)?|modified content(?:, untracked content)?|untracked content)\)$/, "");
      valid = colon > 0 && entry[colon + 1] === " " && labels.includes(label) &&
        (["renamed", "copied"].includes(label) ? paths.split(" -> ").length === 2 && paths.split(" -> ").every(path) : path(paths));
    }
    known &&= valid; counts[section]++;
  }
  known &&= !divergence && (section < 0 || counts[section] > 0) && (counts[0] > 0 || !!merge || footer);
  known &&= !(tracking && initial) && (!(tracking || initial) || source[0]?.text.startsWith("On branch "));
  known &&= !merge || (merge.startsWith("You have") ? counts[1] > 0 : counts[1] === 0 && counts[0] > 0);
  return { known, kept };
}

// Split explicit delimiters, never choose a "best" numeric delimiter. A second
// numeric token between colons makes path/column/content association ambiguous.
function numbered(text) {
  const tokens = text.split(":"), number = tokens.shift();
  if (!uint(number) || Number(number) === 0 || tokens.length === 0 || tokens.slice(0, -1).some((token) => /^[0-9]+$/.test(token))) return undefined;
  return { number, content: tokens.join(":") };
}
function nativeRecord(row) {
  const colon = row.text.indexOf(":"), path = row.text.slice(0, colon);
  if (colon <= 0 || /^[0-9]+$/.test(path)) return undefined;
  const record = numbered(row.text.slice(colon + 1));
  return record && [path, record.number, record.content, row.eol];
}
function rgRecords(source, grouped) {
  const records = [];
  let path, children = 0;
  const close = () => path === undefined || children >= 2;
  for (const row of source) {
    const native = nativeRecord(row);
    if (native) { if (!close()) return undefined; path = undefined; records.push(native); continue; }
    const colon = row.text.indexOf(":");
    if (grouped && colon > 0 && colon === row.text.length - 1 && row.eol === "\n" && !/^[0-9]+$/.test(row.text.slice(0, -1))) {
      if (!close()) return undefined;
      path = row.text.slice(0, -1); children = 0; continue;
    }
    const child = grouped && path !== undefined ? numbered(row.text) : undefined;
    if (!child) return undefined;
    records.push([path, child.number, child.content, row.eol]); children++;
  }
  return records.length && close() ? records : undefined;
}

/** checkEvidence(spec, capture, actual FilterResult) -> named violations and native signals. */
export function checkEvidence(spec, capture, result) {
  const violations = [], signals = [];
  const fail = (code, detail) => violations.push(`${spec?.id ?? "case"}: ${code}: ${detail}`);
  if (!object(spec) || !oracles.has(spec.oracle)) fail("oracle", "missing or unknown oracle ID");
  if (!object(spec) || !["zero", "nonzero"].includes(spec.expectExit)) fail("expect_exit", "expected zero or nonzero");
  if (object(spec) && owns(spec, "allowEmpty") && typeof spec.allowEmpty !== "boolean") fail("allow_empty", "flag must be boolean");
  if (!object(capture) || typeof capture.output !== "string") {
    fail("capture", "output must be a string"); return { ok: false, violations, signals };
  }
  const { output, exitCode, signal, complete, timedOut } = capture;
  const source = rows(output);
  const exited = Number.isSafeInteger(exitCode) && exitCode >= 0;
  if (!(exitCode === null || exited) || !(signal === null || typeof signal === "string" && signal.length > 0) ||
      typeof complete !== "boolean" || typeof timedOut !== "boolean" || exited && signal !== null) fail("capture_metadata", "invalid native exit/signal/completeness/timeout facts");
  if (complete === false) fail("native_completeness", "native capture is incomplete");
  const normalExit = exited && signal === null && timedOut === false;
  if (!normalExit || (spec?.expectExit === "zero" ? exitCode !== 0 : exitCode === 0)) fail("native_exit", `expected ${spec?.expectExit}; observed exit=${exitCode}, signal=${signal}, timedOut=${timedOut}`);
  if (output.length === 0 && spec?.allowEmpty !== true) fail("empty_capture", "empty output requires explicit allowEmpty: true");
  const marker = spec?.marker;
  if (marker !== undefined && (typeof marker !== "string" || marker.length === 0)) fail("marker", "marker must be a nonempty literal string");
  if (spec?.expectExit === "nonzero" && !(typeof marker === "string" && marker.length > 0)) fail("failure_marker", "intended failure requires a native marker");
  if (typeof marker === "string" && marker.length > 0 && !source.some((row) => row.view?.includes(marker))) fail("marker_missing", `native output lacks ${JSON.stringify(marker)}`);
  if (spec?.expectExit === "nonzero" && typeof marker === "string" && marker.length > 0 && !failureBinding(spec.oracle, source, marker, exitCode))
    fail("failure_binding", "intended failure lacks framework-bound failed identity, assertion/compiler diagnostics or native failed result");
  if (!object(result)) { fail("filter_result", "missing filter result"); return { ok: false, violations, signals }; }
  if (!statuses.has(result.status)) fail("status", `unknown filter status ${String(result.status)}`);
  if (typeof result.reason !== "string" || result.reason.length === 0) fail("reason", "missing filter reason");
  const replacing = result.status === "reduced" || result.status === "normalized";
  const hasReplacement = "replacement" in result;
  if (replacing ? typeof result.replacement !== "string" : hasReplacement) fail("replacement_shape", "replacement must exist only for reduced/normalized results");
  const filtered = replacing && typeof result.replacement === "string" ? result.replacement : output;
  const inputBytes = bytes(output), outputBytes = bytes(filtered);
  if (result.inputBytes !== inputBytes) fail("input_bytes", `reported ${result.inputBytes}; actual UTF-8 bytes ${inputBytes}`);
  if (result.outputBytes !== outputBytes) fail("output_bytes", `reported ${result.outputBytes}; actual UTF-8 bytes ${outputBytes}`);
  if (outputBytes > inputBytes) fail("expansion", `${inputBytes} -> ${outputBytes} UTF-8 bytes`);
  if (replacing && outputBytes >= inputBytes) fail("not_smaller", "replacement must strictly save UTF-8 bytes");
  const noReplacement = (why) => {
    if (hasReplacement || !["passthrough", "failed_open"].includes(result.status)) fail("no_replacement", why);
  };
  const nativeSummaries = summaries(spec?.oracle, source);
  signals.push(...nativeSummaries.map((row) => row.raw));
  const rendered = rows(filtered).filter((row) => ["jest", "vitest", "git"].includes(spec?.oracle) || row.text !== "").map((row) => row.raw);
  // Ordinal matching prevents one surviving duplicate from proving all copies.
  let cursor = 0;
  for (const row of spec?.oracle === "rg" ? [] : nativeSummaries) {
    const index = rendered.indexOf(row.raw, cursor);
    if (index < 0) fail("native_signal", `missing or changed native evidence ${JSON.stringify(row.text)}`);
    else cursor = index + 1;
  }
  const unsafe = !normalExit || exitCode !== 0 || complete !== true || !oracles.has(spec?.oracle) || ["exact", "node"].includes(spec?.oracle);
  if (unsafe) noReplacement("failure, incomplete, unknown, exact and Node surfaces require whole original output");
  // Whole passthrough proves byte preservation; native capture validity is separate.
  if (unsafe || !hasReplacement && ["passthrough", "failed_open"].includes(result.status)) return { ok: violations.length === 0, violations, signals };
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]|\r(?!\n)/.test(output)) {
    noReplacement("unknown control/presentation surface");
  } else if (spec.oracle === "rg") {
    const before = rgRecords(source, false), after = rgRecords(rows(filtered), true);
    if (!before) noReplacement("ambiguous or unknown native rg records");
    else if (!after || !equal(before, after)) fail("rg_records", "path, line, content, ordinal, multiplicity or line ending changed");
  } else {
    const evidence = spec.oracle === "git" ? gitEvidence(source) : runnerEvidence(spec.oracle, source);
    if (!evidence.known) noReplacement("unknown or inconsistent native grammar");
    else if (!equal(evidence.kept, rendered)) fail("native_evidence", "native identities, summaries, skips or Git fact rows changed; only declared noise/formatting may differ");
  }
  return { ok: violations.length === 0, violations, signals };
}
