import { tokenizeCommand } from "../core/command.js";
import { lines } from "../core/lines.js";
import type { Observation, Profile, Reduction, Span } from "../core/types.js";

// Closed witnessed command surface. Version selectors cannot pass the shared
// literal tokenizer; this profile never rewrites them or widens that grammar.
const modulePath = /^[a-z0-9]+(?:[.-][a-z0-9]+)+(?:\/[A-Za-z0-9_][A-Za-z0-9_.-]*)+$/;
const version = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(\+incompatible)?$/;
// Independently authored constraints; authoritative source pin in G05 SOURCES.md.
const reservedComponent = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
function moduleName(value: string): boolean {
  if (!modulePath.test(value) || !value.split("/")[0]!.includes(".") ||
      value.startsWith("gopkg.in/")) return false;
  const suffix = /\/v([0-9.]+)$/.exec(value);
  if (suffix && (!/^[1-9]\d*$/.test(suffix[1]!) || BigInt(suffix[1]!) < 2n)) return false;
  return value.split("/").every(part => !part.endsWith(".") &&
    !reservedComponent.test(part.split(".")[0]!));
}
type Release = { core: bigint[]; prerelease: string[] };
function moduleRelease(name: string, value: string): Release | undefined {
  const parsed = version.exec(value);
  if (!moduleName(name) || !parsed) return undefined;
  const prerelease = parsed[4]?.split(".") ?? [];
  if (prerelease.some(part => /^0\d+$/.test(part))) return undefined;
  const major = BigInt(parsed[1]!);
  const suffix = /\/v([0-9.]+)$/.exec(name);
  if (suffix) {
    if (BigInt(suffix[1]!) !== major || parsed[5]) return undefined;
  } else if (major >= 2n ? !parsed[5] : parsed[5]) return undefined;
  return { core: parsed.slice(1, 4).map(part => BigInt(part!)), prerelease };
}
function compareRelease(left: Release, right: Release): number {
  for (let index = 0; index < 3; index++) {
    if (left.core[index]! !== right.core[index]!) return left.core[index]! < right.core[index]! ? -1 : 1;
  }
  if (!left.prerelease.length || !right.prerelease.length) {
    return left.prerelease.length ? -1 : right.prerelease.length ? 1 : 0;
  }
  for (let index = 0; index < Math.max(left.prerelease.length, right.prerelease.length); index++) {
    const a = left.prerelease[index], b = right.prerelease[index];
    if (a === b) continue;
    if (a === undefined || b === undefined) return a === undefined ? -1 : 1;
    const aNumeric = /^\d+$/.test(a), bNumeric = /^\d+$/.test(b);
    if (aNumeric && bNumeric) return BigInt(a) < BigInt(b) ? -1 : 1;
    if (aNumeric !== bNumeric) return aNumeric ? -1 : 1;
    return a < b ? -1 : 1;
  }
  return 0;
}
function identity(argv: readonly string[]): { mode: string; requested: boolean } | undefined {
  if (argv[0] !== "go") return undefined;
  const mode = argv[1] === "get" ? "get" : argv[1] === "mod" ? argv[2] : undefined;
  if (mode !== "get" && mode !== "download" && mode !== "tidy") return undefined;
  const allowed = mode === "download" ? ["-x", "-json"] : mode === "tidy" ? ["-v"] : ["-v", "-x"];
  const flags = new Set<string>();
  let operand = false;
  for (const arg of argv.slice(mode === "get" ? 2 : 3)) {
    if (arg.startsWith("-")) {
      if (operand || !allowed.includes(arg) || flags.has(arg)) return undefined;
      flags.add(arg);
    } else {
      if (mode === "tidy" || !moduleName(arg)) return undefined;
      operand = true;
    }
  }
  return { mode, requested: flags.size > 0 };
}

function reduce(output: string, observation: Observation): Reduction | undefined {
  const argv = tokenizeCommand(observation.command);
  const command = argv && identity(argv);
  if (!command || command.mode !== "get" || command.requested || observation.source !== "shell" ||
      observation.completeness !== "complete" || observation.termination.kind !== "exited" ||
      observation.termination.code !== 0 || output !== observation.output ||
      !output.endsWith("\n") || output.includes("\r")) return undefined;
  const downloading = new Map<string, { version: string; offset: number }>();
  const changes = new Map<string, { version: string; offset: number }>();
  const required: Span[] = [];
  for (const row of lines(output)) {
    const progress = /^go: downloading (\S+) (\S+)$/.exec(row.text);
    if (progress) {
      const name = progress[1]!, release = progress[2]!;
      if (!moduleRelease(name, release) || downloading.has(name)) return undefined;
      downloading.set(name, { version: release, offset: row.span[0] });
      continue;
    }
    const added = /^go: added (\S+) (\S+)$/.exec(row.text);
    const upgraded = /^go: upgraded (\S+) (\S+) => (\S+)$/.exec(row.text);
    if (!added && !upgraded) return undefined;
    const name = (added ?? upgraded)![1]!;
    const release = added ? added[2]! : upgraded![3]!;
    const next = moduleRelease(name, release);
    const previous = upgraded ? moduleRelease(name, upgraded[2]!) : undefined;
    if (!next || changes.has(name) ||
        (upgraded && (!previous || compareRelease(previous, next) >= 0))) return undefined;
    changes.set(name, { version: release, offset: row.span[0] });
    required.push(row.span);
  }
  if (downloading.size === 0 || required.length === 0) return undefined;
  for (const [name, progress] of downloading) {
    const change = changes.get(name);
    if (!change || change.version !== progress.version || change.offset <= progress.offset) return undefined;
  }
  return { pieces: required, required };
}

export const familyProfiles: readonly Profile[] = Object.freeze([{
  id: "go-mod", match: (argv) => identity(argv) !== undefined, reduce,
}]);
