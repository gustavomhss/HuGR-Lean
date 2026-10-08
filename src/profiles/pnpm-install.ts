import { tokenizeCommand } from "../core/command.js";
import { lines } from "../core/lines.js";
import type { Observation, Profile, Reduction, Span } from "../core/types.js";

// Pinned native append-only pipe grammar. Only progress rows may disappear.
const MAX = 1_000_000;
const integer = "(?:0|[1-9][0-9]{0,6})";
const name = "(?:@[a-z0-9][a-z0-9._-]*/)?[a-z0-9][a-z0-9._-]*";
const version = "(?:0|[1-9][0-9]*)\\.(?:0|[1-9][0-9]*)\\.(?:0|[1-9][0-9]*)(?:-[0-9A-Za-z.-]+)?(?:\\+[0-9A-Za-z.-]+)?";
const progress = new RegExp(`^Progress: resolved (${integer}), reused (${integer}), downloaded (${integer}), added (${integer})(, done)?$`);
const deprecated = new RegExp(`^ WARN  deprecated (${name})@(${version}): (\\S(?:.*\\S)?)$`);
const dependency = new RegExp(`^\\+ (${name}) (${version})(?: deprecated| \\((${version}) is available\\)| <- ([A-Za-z0-9_@./ -]+))?$`);
const peerParent = new RegExp(`^└─┬ (${name}) (${version})$`);
const peerChild = new RegExp(`^  └── ✕ unmet peer (${name})@([0-9A-Za-z.*^~<>=| +-]+): found (${version})$`);

function match(argv: readonly string[]): boolean {
  if (argv[0] !== "pnpm" || argv[1] !== "install") return false;
  const seen = new Set<string>();
  for (let i = 2; i < argv.length; i++) {
    const flag = argv[i]!;
    if (seen.has(flag)) return false;
    seen.add(flag);
    if (flag === "--store-dir") {
      const value = argv[++i];
      if (!value || value.startsWith("-") || !/^[A-Za-z0-9_./:+ -]+$/.test(value)) return false;
    } else if (!["--ignore-scripts", "--ignore-pnpmfile", "--offline", "--frozen-lockfile"].includes(flag)) return false;
  }
  return seen.has("--ignore-scripts") && seen.has("--ignore-pnpmfile");
}

function reduce(output: string, observation: Observation): Reduction | undefined {
  const argv = tokenizeCommand(observation.command);
  if (!argv || !match(argv) || observation.source !== "shell" || observation.completeness !== "complete"
    || observation.termination.kind !== "exited" || observation.termination.code !== 0
    || observation.presentation !== "unknown" || output !== observation.output) return undefined;
  if (!output.endsWith("\n") || output.length > 1_048_576
    || /[\x00-\x09\x0b-\x1f\x7f-\x9f\p{Cf}\p{Zl}\p{Zp}]/u.test(output)) return undefined;
  const rows = lines(output);
  if (rows.length > 10_000) return undefined;
  let cursor = 0;
  const text = (): string | undefined => rows[cursor]?.text;
  const scope = /^Scope: all ([1-9][0-9]{0,6}) workspace projects$/.exec(text() ?? "");
  if (scope) {
    if (Number(scope[1]) > MAX) return undefined;
    cursor++;
  }
  if (text() === "Lockfile is up to date, resolution step is skipped") cursor++;
  const removed = new Set<number>();
  const deprecations: { name: string; version: string }[] = [];
  let previous = [0, 0, 0, 0];
  let packageCount: number | undefined;
  let done = false;
  let initial = false;
  while (cursor < rows.length && !done) {
    const row = text()!;
    const warning = deprecated.exec(row);
    if (warning) {
      deprecations.push({ name: warning[1]!, version: warning[2]! });
      cursor++;
      continue;
    }
    const count = /^Packages: \+([1-9][0-9]{0,4})$/.exec(row);
    if (count) {
      if (!initial || packageCount !== undefined) return undefined;
      packageCount = Number(count[1]);
      if (packageCount > 10_000 || rows[cursor + 1]?.text !== "+".repeat(packageCount)) return undefined;
      cursor += 2;
      continue;
    }
    const step = progress.exec(row);
    if (!step) return undefined;
    const counters = step.slice(1, 5).map(Number);
    const [resolved, reused, downloaded, added] = counters as [number, number, number, number];
    if (counters.some((n, i) => n > MAX || n < previous[i]!)
      || reused + downloaded > resolved || added > reused + downloaded
      || (packageCount === undefined ? added !== 0 : added > packageCount)) return undefined;
    done = step[5] !== undefined;
    if (done && (packageCount === undefined || added !== packageCount || resolved !== reused + downloaded)) return undefined;
    initial = true;
    previous = counters;
    removed.add(cursor++);
  }
  if (!done || removed.size < 2) return undefined;

  let peer: { parent: string; version: string; name: string; found: string } | undefined;
  if (text() === " WARN  Issues with peer dependencies found") {
    if (rows[++cursor]?.text !== ".") return undefined;
    const parent = peerParent.exec(rows[++cursor]?.text ?? "");
    const child = peerChild.exec(rows[++cursor]?.text ?? "");
    if (!parent || !child) return undefined;
    peer = { parent: parent[1]!, version: parent[2]!, name: child[1]!, found: child[3]! };
    cursor++;
  }
  if (text() !== "") return undefined;
  cursor++;
  const installed = new Map<string, string>();
  if (text() === "dependencies:") {
    cursor++;
    while (text()?.startsWith("+ ")) {
      const entry = dependency.exec(text()!);
      if (!entry || installed.has(entry[1]!)) return undefined;
      installed.set(entry[1]!, entry[2]!);
      cursor++;
    }
    if (installed.size === 0 || text() !== "") return undefined;
    cursor++;
  }
  if (peer && (installed.get(peer.parent) !== peer.version || installed.get(peer.name) !== peer.found)) return undefined;
  if (deprecations.some(w => installed.get(w.name) !== w.version)) return undefined;
  if (!/^Done in (?:[1-9][0-9]{0,8}ms|(?:0|[1-9][0-9]{0,5})(?:\.[0-9]{1,3})?s) using pnpm v10\.18\.3$/.test(text() ?? "")
    || cursor !== rows.length - 1) return undefined;

  // Every other byte, including blank lines and warning trees, is required evidence.
  const retained: Span[] = rows.filter((_, index) => !removed.has(index)).map(row => row.span);
  return { pieces: retained, required: retained };
}

export const familyProfiles: readonly Profile[] = Object.freeze([{ id: "pnpm-install", match, reduce }]);
