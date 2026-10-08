import { tokenizeCommand } from "../core/command.js";
import { lines } from "../core/lines.js";
import type { Observation, Profile, Reduction, Span } from "../core/types.js";

// Pinned TS 5.9.3 plain verbose solution-build grammar. Observation has no
// producer-version field: a version banner or changed grammar is refused,
// but an otherwise identical report from another version is indistinguishable.
type Build = { project: string; force: boolean };
const timestamp = /^((?:[1-9]|1[0-2]):[0-5]\d:[0-5]\d [AP]M - )(.+)$/u;
function path(value: string): boolean {
  if (!/^(?:\.{1,2}\/)*\/?[\p{L}\p{M}\p{N}\p{S}_ .@+-]+(?:\/[\p{L}\p{M}\p{N}\p{S}_ .@+-]+)*$/u.test(value)) return false;
  return !/["'\\:]/u.test(value) && !value.replace(/^(?:\.{1,2}\/)+/u, "").split("/").some((part) => part === "." || part === "..");
}
const canonical = (value: string): string => value.replace(/^(?:\.{1,2}\/)+/u, "").replace(/^\//u, "");
function build(argv: readonly string[]): Build | undefined {
  let start = 0;
  if (argv[0] === "tsc") start = 1;
  else if (argv[0] === "npx" && argv[1] === "tsc") start = 2;
  else if (argv[0] === "npx" && argv[1] === "--no-install" && argv[2] === "tsc") start = 3;
  else return undefined;
  if (argv[start] !== "-b" && argv[start] !== "--build") return undefined;
  let project = "", verbose = false, pretty = false, force = false;
  for (let index = start + 1; index < argv.length; index++) {
    const arg = argv[index]!;
    if (arg === "--verbose" && !verbose) verbose = true;
    else if (arg === "--force" && !force) force = true;
    else if (arg === "--pretty" && !pretty && argv[++index] === "false") pretty = true;
    else if (!arg.startsWith("-") && !project && path(arg)) project = arg;
    else return undefined;
  }
  return project && verbose && pretty ? { project, force } : undefined;
}

function reduce(output: string, observation: Observation): Reduction | undefined {
  if (observation.source !== "shell" || observation.completeness !== "complete" || observation.presentation !== "unknown" ||
      observation.termination.kind !== "exited" || observation.termination.code !== 0 ||
      !/\r?\n\r?\n$/u.test(output) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]|\r(?!\n)/u.test(output)) return undefined;
  const argv = tokenizeCommand(observation.command), command = argv && build(argv);
  if (!command) return undefined;
  const rows = lines(output), pieces: Span[] = [], required: Span[] = [];
  let cursor = 0, previousTime = "", removed = false, actionBase: string | undefined;
  const keep = (span: Span): void => { pieces.push(span); required.push(span); };
  function event(): string | undefined {
    const row = rows[cursor++];
    if (!row) return undefined;
    const match = timestamp.exec(row.text);
    if (!match) return undefined;
    const prefix = match[1]!;
    if (prefix === previousTime) { keep([row.span[0] + prefix.length, row.span[1]]); removed = true; }
    else {
      pieces.push(row.span);
      required.push([row.span[0], row.span[0] + prefix.length]);
      required.push([row.span[0] + prefix.length, row.span[1]]);
    }
    previousTime = prefix;
    return match[2];
  }
  function blank(): boolean {
    const row = rows[cursor++];
    if (!row || row.text !== "") return false;
    keep(row.span); return true;
  }
  if (event() !== "Projects in this build: ") return undefined;
  const projects: string[] = [];
  while (rows[cursor]?.text.startsWith("    * ")) {
    const row = rows[cursor++]!, name = row.text.slice(6);
    if (!path(name) || !name.endsWith("/tsconfig.json") ||
        projects.some((project) => canonical(project) === canonical(name)) || projects.length >= 128) return undefined;
    projects.push(name); keep(row.span);
  }
  // This finite grammar describes a reference solution: the final listed root
  // has no own compilation event. Every preceding project must finish in order.
  const requested = command.project.endsWith("/tsconfig.json") ? command.project : `${command.project}/tsconfig.json`;
  if (projects.length < 2 || canonical(projects.at(-1)!) !== canonical(requested) || !blank()) return undefined;
  let rebuilt = false;
  for (const project of projects.slice(0, -1)) {
    const body = event(), heading = `Project '${project}' `;
    if (!body?.startsWith(heading) || !blank()) return undefined;
    const state = body.slice(heading.length), directory = project.slice(0, -"tsconfig.json".length);
    const belongs = (value: string, suffix: string): boolean => path(value) && value.startsWith(directory) && value.endsWith(suffix);
    let action: "Building project" | "Updating output timestamps of project" | undefined;
    if (command.force) {
      if (state !== "is being forcibly rebuilt") return undefined;
      action = "Building project";
    } else if (state === "is up to date with .d.ts files from its dependencies") {
      if (!rebuilt) return undefined;
      action = "Updating output timestamps of project";
    } else {
      const missing = /^is out of date because output file '([^']+)' does not exist$/u.exec(state);
      const changed = /^is out of date because output '([^']+)' is older than input '([^']+)'$/u.exec(state);
      const current = /^is up to date because newest input '([^']+)' is older than output '([^']+)'$/u.exec(state);
      if (missing && belongs(missing[1]!, ".tsbuildinfo")) action = "Building project";
      else if (changed && belongs(changed[1]!, ".tsbuildinfo") && belongs(changed[2]!, ".ts")) action = "Building project";
      else if (!(current && belongs(current[1]!, ".ts") && belongs(current[2]!, ".tsbuildinfo"))) return undefined;
    }
    if (action) {
      const next = event(), match = next && /^(Building project|Updating output timestamps of project) '([^']+)'\.\.\.$/u.exec(next);
      if (!match || match[1] !== action || !path(match[2]!) || !match[2]!.startsWith("/")) return undefined;
      const relative = canonical(project), absolute = match[2]!;
      if (!absolute.endsWith(`/${relative}`)) return undefined;
      const base = absolute.slice(0, -relative.length);
      if (actionBase !== undefined && base !== actionBase) return undefined;
      actionBase = base;
      if (!blank()) return undefined;
      if (action === "Building project") rebuilt = true;
    }
  }
  return cursor === rows.length && removed ? { pieces, required } : undefined;
}

export const familyProfiles: readonly Profile[] = [
  { id: "tsc", match: (argv) => build(argv) !== undefined, reduce },
];
