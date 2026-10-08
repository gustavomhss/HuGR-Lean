import type { Profile, Reduction } from "../core/types.js";
import { lines } from "../core/lines.js";
import { nativeProfile, reduction, uint } from "./runner-utils.js";

function match(argv: readonly string[]): boolean {
  if ((argv[0] !== "node" && argv[0] !== "tsx") || argv[1] !== "--test") return false;
  let reporter = false, concurrency = false, paths = false;
  for (const argument of argv.slice(2)) {
    if (argument.startsWith("-")) {
      if (paths) return false;
      if (argument === "--test-reporter=tap" && !reporter) reporter = true;
      else if (argument.startsWith("--test-concurrency=") && !concurrency) {
        const count = uint(argument.slice("--test-concurrency=".length));
        if (count === undefined || count === 0) return false;
        concurrency = true;
      } else return false;
    } else {
      // Literal paths only; the core still owns shell identity and quoting.
      if (!/^[A-Za-z0-9_./][A-Za-z0-9_./:+, -]*$/.test(argument)) return false;
      paths = true;
    }
  }
  return true;
}

interface Counts { tests: number; pass: number; skipped: number; todo: number }
interface TestBlock {
  start: number;
  result: number;
  end: number;
  children: Scope | undefined;
  critical: boolean;
  counts: Counts;
}
interface Scope { blocks: TestBlock[]; plan: number; counts: Counts }
const emptyCounts = (): Counts => ({ tests: 0, pass: 0, skipped: 0, todo: 0 });
function addCounts(target: Counts, source: Counts): void {
  target.tests += source.tests;
  target.pass += source.pass;
  target.skipped += source.skipped;
  target.todo += source.todo;
}

function duration(value: string | undefined): number | undefined {
  if (value === undefined || !/^(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(value)) return undefined;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : undefined;
}
function directive(name: string, value: string | undefined): "" | "SKIP" | "TODO" | undefined {
  const expected = name;
  if (value === undefined || !value.startsWith(expected)) return undefined;
  // Match the entire header description before interpreting any directive suffix.
  const suffix = value.slice(expected.length);
  if (suffix === "") return "";
  const marker = /^ # (SKIP|TODO)(?: .*)?$/.exec(suffix)?.[1];
  return marker === "SKIP" || marker === "TODO" ? marker : undefined;
}

function parse(output: string): Reduction | undefined {
  const rows = lines(output);
  let cursor = 0;
  function take(text: string): boolean {
    if (rows[cursor]?.text !== text) return false;
    cursor++;
    return true;
  }
  function field(prefix: string): string | undefined {
    const text = rows[cursor]?.text;
    if (text === undefined || !text.startsWith(prefix)) return undefined;
    cursor++;
    return text.slice(prefix.length);
  }
  function scope(depth: number): Scope | undefined {
    if (depth > 32) return undefined;
    const indent = "    ".repeat(depth), blocks: TestBlock[] = [], counts = emptyCounts();
    while (rows[cursor]?.text.startsWith(`${indent}# Subtest: `)) {
      const block = testBlock(depth, blocks.length + 1);
      if (!block) return undefined;
      blocks.push(block);
      addCounts(counts, block.counts);
    }
    const plan = cursor, count = uint(field(`${indent}1..`));
    if (count === undefined || count !== blocks.length || blocks.length === 0) return undefined;
    return { blocks, plan, counts };
  }
  function testBlock(depth: number, index: number): TestBlock | undefined {
    const indent = "    ".repeat(depth), start = cursor;
    const name = field(`${indent}# Subtest: `);
    if (name === undefined || name.length === 0) return undefined;
    let children: Scope | undefined;
    if (rows[cursor]?.text.startsWith(`${indent}    # Subtest: `)) {
      children = scope(depth + 1);
      if (!children) return undefined;
    }
    const result = cursor, mode = directive(name, field(`${indent}ok ${index} - `));
    if (mode === undefined || !take(`${indent}  ---`)) return undefined;
    if (duration(field(`${indent}  duration_ms: `)) === undefined) return undefined;
    if (!take(`${indent}  type: 'test'`) || !take(`${indent}  ...`)) return undefined;
    let critical = mode !== "";
    // Only same-scope comments immediately after YAML bind to this test.
    // Comments before a header or at an unsupported indentation fail the next state.
    while (rows[cursor]?.text.startsWith(`${indent}# `) &&
           !rows[cursor]?.text.startsWith(`${indent}# Subtest: `)) {
      critical = true;
      cursor++;
    }
    const counts: Counts = { tests: 1, pass: mode === "" ? 1 : 0,
      skipped: mode === "SKIP" ? 1 : 0, todo: mode === "TODO" ? 1 : 0 };
    if (children) addCounts(counts, children.counts);
    return { start, result, end: cursor, children, critical, counts };
  }

  if (!take("TAP version 13")) return undefined;
  const root = scope(0);
  if (!root) return undefined;
  const footer = cursor;
  const expected = { tests: root.counts.tests, suites: 0, pass: root.counts.pass,
    fail: 0, cancelled: 0, skipped: root.counts.skipped, todo: root.counts.todo };
  for (const key of ["tests", "suites", "pass", "fail", "cancelled", "skipped", "todo"] as const) {
    const count = uint(field(`# ${key} `));
    if (count === undefined || count !== expected[key]) return undefined;
  }
  if (duration(field("# duration_ms ")) === undefined || cursor !== rows.length) return undefined;

  const kept = new Set<number>([0]);
  function keepRange(start: number, end: number): void {
    for (let index = start; index < end; index++) kept.add(index);
  }
  function keepScope(value: Scope): void {
    for (const block of value.blocks) {
      if (block.critical) keepRange(block.start, block.end);
      else if (block.children) {
        kept.add(block.start);
        keepScope(block.children);
        keepRange(block.result, block.end);
      }
      // Only a silent passing leaf loses its header/result/YAML progress block.
    }
    kept.add(value.plan);
  }
  keepScope(root);
  keepRange(footer, cursor);
  return reduction(rows.filter((_, index) => kept.has(index)));
}

// Selected-profile authoring seam; the lead registers the reviewed profile later.
export const nodeTestProfile: Profile = nativeProfile("node-test", match, parse);
