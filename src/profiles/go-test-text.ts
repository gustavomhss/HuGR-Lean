import { goProfile } from "./go.js";
import { goMode } from "./go-mode.js";
import { tokenizeCommand } from "../core/command.js";
import { lines } from "../core/lines.js";
import type { Line, Profile, Reduction } from "../core/types.js";
import { nativeProfile, reduction } from "./runner-utils.js";

interface Options {
  verbose: boolean;
  cover: boolean;
  count: number;
  run: string;
}

// A Go -run regex with no metacharacters: slash-separated literal substring selectors.
const literalSelector = /^[A-Za-z0-9_][A-Za-z0-9_-]*(?:\/[A-Za-z0-9_][A-Za-z0-9_-]*)*$/;

function boundedPositive(value: string, maximum: number): boolean {
  return /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) <= maximum;
}

/** Closed delta argv. Anchored regexes cannot cross the frozen literal command tokenizer. */
function options(argv: readonly string[]): Options | undefined {
  if (goMode(argv) !== "text") return undefined;
  const seen = new Map<string, string>();
  let packageSeen = false;
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === ".") {
      if (packageSeen || i !== argv.length - 1) return undefined;
      packageSeen = true;
      continue;
    }
    const equal = arg.indexOf("=");
    const key = equal < 0 ? arg : arg.slice(0, equal);
    if (seen.has(key)) return undefined;
    if (["-v", "-race", "-cover"].includes(key)) {
      if (equal >= 0) return undefined;
      seen.set(key, "true");
    } else if (["-run", "-count", "-parallel"].includes(key)) {
      const value = equal < 0 ? argv[++i] : arg.slice(equal + 1);
      if (!value || (key === "-run" ? !literalSelector.test(value) :
        !boundedPositive(value, key === "-count" ? 100 : 256))) return undefined;
      seen.set(key, value);
    } else return undefined;
  }
  const run = seen.get("-run") ?? "";
  const verbose = seen.has("-v"), cover = seen.has("-cover");
  const count = Number(seen.get("-count") ?? "1");
  if (seen.size && !packageSeen && !(argv.length === 3 && argv[2] === "-v")) return undefined;
  return { verbose, cover, count, run };
}

interface Scope {
  name: string;
  parent: Scope | undefined;
  children: Scope[];
  rows: number[];
  parallel: boolean;
  paused: boolean;
  resumed: boolean;
  ended: boolean;
  keep: boolean;
}

const testName = /^Test[\p{L}\p{N}_]+(?:\/[\p{L}\p{N}_.-]+)*$/u;
const seconds = "(?:0|[1-9]\\d*)(?:\\.\\d+)?";
const resultRow = new RegExp(`^( *)(?:--- (PASS|SKIP):) (\\S+) \\((${seconds})s\\)$`, "u");

function ancestors(scope: Scope): Scope[] {
  const path: Scope[] = [];
  for (let node: Scope | undefined = scope; node; node = node.parent) path.push(node);
  return path.reverse();
}

function protect(scope: Scope): void {
  for (let node: Scope | undefined = scope; node; node = node.parent) node.keep = true;
}

function finished(scope: Scope): boolean {
  return scope.ended && scope.children.every(finished);
}

class Lifecycle {
  readonly scopes: Scope[] = [];
  readonly occurrences = new Map<string, number>();
  private current = new Map<string, Scope>();
  private stack: Scope[] = [];
  private diagnostic: Scope | undefined;
  private firstRound: string[] = [];
  private repeating = false;
  private repeatStarts = 0;

  constructor(private readonly config: Options) {}

  private selected(name: string): boolean {
    if (!this.config.run) return true;
    const path = name.split("/"), selected = this.config.run.split("/");
    // Go runs matching ancestors to discover selected descendants; unanchored literals match substrings.
    return selected.every((part, i) => path[i] === undefined || path[i]!.includes(part));
  }

  private registerRoot(name: string): boolean {
    if (!this.repeating && !this.occurrences.has(name)) {
      this.firstRound.push(name);
      return true;
    }
    // First repeated root freezes registration order; -shuffle is outside this argv grammar.
    this.repeating = true;
    const expected = this.firstRound[this.repeatStarts % this.firstRound.length];
    if (name !== expected || this.repeatStarts >= this.firstRound.length * (this.config.count - 1)) return false;
    this.repeatStarts++;
    return true;
  }

  private run(name: string, index: number): boolean {
    if (!testName.test(name) || !this.selected(name) || name.split("/").length > 128) return false;
    const slash = name.lastIndexOf("/");
    let parent: Scope | undefined;
    if (slash < 0) {
      if ([...this.current.values()].some(node => !node.ended)) return false;
      if (!this.registerRoot(name)) return false;
      this.current = new Map();
      this.stack = [];
      const count = (this.occurrences.get(name) ?? 0) + 1;
      if (count > this.config.count) return false;
      this.occurrences.set(name, count);
    } else {
      parent = this.current.get(name.slice(0, slash));
      if (!parent || parent.ended || parent.paused || !this.stack.includes(parent) ||
        [...this.current.values()].some(node => node.resumed)) return false;
      this.stack = this.stack.slice(0, this.stack.indexOf(parent) + 1);
    }
    if (this.current.has(name)) return false;
    const scope: Scope = { name, parent, children: [], rows: [index], parallel: false,
      paused: false, resumed: false, ended: false, keep: false };
    parent?.children.push(scope);
    this.scopes.push(scope);
    this.current.set(name, scope);
    this.stack.push(scope);
    return true;
  }

  private switch(kind: string, name: string, index: number): boolean {
    const scope = this.current.get(name);
    if (!scope || scope.ended || scope.parent?.ended) return false;
    if (kind === "PAUSE") {
      // Captured support is subtest parallelism, not top-level parallel tests.
      if (!scope.parent || scope.parallel || this.stack.at(-1) !== scope) return false;
      scope.parallel = scope.paused = true;
      this.stack.pop();
    } else {
      if (kind === "CONT") {
        if (!scope.paused || scope.resumed) return false;
        scope.paused = false;
        scope.resumed = true;
      } else if (!scope.parallel || !scope.resumed || scope.paused) return false;
      this.stack = ancestors(scope);
    }
    scope.rows.push(index);
    return true;
  }

  private close(match: RegExpExecArray, index: number): boolean {
    const scope = this.current.get(match[3]!);
    if (!scope || scope.ended || scope.paused || !Number.isFinite(Number(match[4])) ||
      (scope.parent && !scope.parent.ended)) return false;
    if (match[1]!.length !== (ancestors(scope).length - 1) * 4) return false;
    if ([...this.current.values()].some(node => node.paused)) return false;
    const siblings = scope.parent?.children ?? [];
    for (const previous of siblings.slice(0, siblings.indexOf(scope))) {
      if (!finished(previous) && !(previous.parallel && scope.parallel)) return false;
    }
    if (match[2] === "SKIP") {
      if (scope.children.length) return false;
      protect(scope);
    }
    scope.ended = true;
    scope.rows.push(index);
    this.stack = [];
    return true;
  }

  consume(row: string, index: number): boolean {
    const event = /^=== (RUN  |PAUSE|CONT |NAME ) (\S+)$/.exec(row);
    if (event) {
      this.diagnostic = undefined;
      return event[1] === "RUN  " ? this.run(event[2]!, index) :
        this.switch(event[1]!.trim(), event[2]!, index);
    }
    // A log continuation may itself spell a nested result. Linkage wins over text shape.
    if (/^ {8}/.test(row) && this.diagnostic) {
      this.diagnostic.rows.push(index);
      return true;
    }
    const result = resultRow.exec(row);
    if (result) {
      this.diagnostic = undefined;
      return this.close(result, index);
    }
    const header = /^ {4}[^\s:]+\.go:([1-9]\d*):(?: .*)?$/.exec(row);
    if (header) {
      const active = this.stack.at(-1);
      if (!active || active.ended || active.paused || !Number.isSafeInteger(Number(header[1]))) return false;
      this.diagnostic = active;
      protect(active);
      active.rows.push(index);
      return true;
    }
    return false;
  }

  complete(): boolean {
    return this.scopes.length > 0 && this.scopes.every(node => node.ended) &&
      this.repeatStarts === this.firstRound.length * (this.config.count - 1) &&
      [...this.occurrences.values()].every(count => count === this.config.count);
  }
}

function summary(rows: readonly Line[], start: number, config: Options): boolean {
  if (rows[start]?.text !== "PASS") return false;
  let i = start + 1;
  let coverage: string | undefined;
  if (config.cover) {
    const match = /^coverage: (\d+\.\d%) of statements$/.exec(rows[i++]?.text ?? "");
    if (!match || Number(match[1]!.slice(0, -1)) > 100) return false;
    coverage = match[1];
  }
  const match = new RegExp(`^ok {2}\\t([^\\s]+)\\t(${seconds})s(?:\\tcoverage: (\\d+\\.\\d%) of statements)?$`).exec(rows[i++]?.text ?? "");
  return i === rows.length && !!match && Number.isFinite(Number(match[2])) &&
    match[3] === coverage;
}

function parse(output: string, config: Options): Reduction | undefined {
  // Summary-only nonverbose output has no removable material.
  if (!config.verbose) return undefined;
  const rows = lines(output), lifecycle = new Lifecycle(config);
  let i = 0;
  while (i < rows.length && rows[i]!.text !== "PASS") {
    if (!lifecycle.consume(rows[i]!.text, i)) return undefined;
    i++;
  }
  if (!lifecycle.complete() || !summary(rows, i, config)) return undefined;
  // Raw stdout can spell the same child lifecycle as Go. Preserve the entire enclosing tree.
  const ambiguousRoots = new Set(lifecycle.scopes.filter(scope => scope.children.length || scope.parallel)
    .map(scope => ancestors(scope)[0]!));
  const retained = new Set<number>();
  for (const scope of lifecycle.scopes) {
    if (scope.keep || ambiguousRoots.has(ancestors(scope)[0]!)) {
      for (const index of scope.rows) retained.add(index);
    }
  }
  const kept = rows.filter((_, index) => index >= i || retained.has(index));
  return kept.length < rows.length ? reduction(kept) : undefined;
}

const textProfile = nativeProfile("go-test-verbose",
  argv => goMode(argv) === "text" && (goProfile.match(argv) || options(argv) !== undefined),
  (output, observation) => {
    const argv = tokenizeCommand(observation.command);
    if (!argv || goMode(argv) !== "text") return undefined;
    // Preserve legacy success; a decline may still be fully validated by the new grammar.
    const legacy = goProfile.match(argv) ? goProfile.reduce(output, observation) : undefined;
    if (legacy !== undefined) return legacy;
    const config = options(argv);
    return config ? parse(output, config) : undefined;
  });

export const familyProfiles: readonly Profile[] = [textProfile];
