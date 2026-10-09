import { lines } from "../core/lines.js";
import { tokenizeCommand } from "../core/command.js";
import type { Observation, Profile, Reduction } from "../core/types.js";
import { nativeProfile, uint } from "./runner-utils.js";

// Finite captured argv spellings; values are syntax, never fixture names or host paths.
type Options = { profile: string; target?: string; package?: string; workspace: boolean };
const name = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const pathValue = (value: string): boolean => value.length > 0 && !value.startsWith("-") &&
  !/[\p{Cc}\p{Cf}]/u.test(value) && !/[`<>|]/.test(value);
function options(argv: readonly string[]): Options | undefined {
  if (argv[0] !== "cargo" || argv[1] !== "doc") return undefined;
  const result: Options = { profile: "dev", workspace: false }, seen = new Set<string>();
  for (let i = 2; i < argv.length; i++) {
    const flag = argv[i]!;
    if (seen.has(flag)) return undefined;
    seen.add(flag);
    if (["--offline", "--no-deps", "--document-private-items", "--bins", "--workspace"].includes(flag)) {
      if (flag === "--workspace") result.workspace = true;
      continue;
    }
    if (!["-p", "--features", "--target", "--profile", "--manifest-path", "--jobs"].includes(flag)) return undefined;
    const value = argv[++i];
    if (!value || !pathValue(value)) return undefined;
    if (flag === "--features") {
      if (!/^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)?(?:[ ,][A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)?)*$/.test(value)) return undefined;
    } else if (flag === "--manifest-path") {
      if (!/(?:^|[\/\\])Cargo\.toml$/.test(value)) return undefined;
    } else if (flag === "--jobs") {
      if ((uint(value) ?? 0) < 1) return undefined;
    } else {
      if (!name.test(value)) return undefined;
      if (flag === "-p") result.package = value;
      if (flag === "--target") result.target = value;
      if (flag === "--profile") result.profile = value;
    }
  }
  // Combined package/workspace selection is not captured.
  return result.package && result.workspace ? undefined : result;
}

const progress = /^(   Compiling|    Checking| Documenting) ([A-Za-z0-9_-]+) v(\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?)(?: \(([^()]+)\))$/;
const finish = /^    Finished `([A-Za-z0-9_-]+)` profile \[unoptimized \+ debuginfo\] target\(s\) in (\d+(?:\.\d+)?)s$/;
const generated = /^   Generated (.+\/doc\/([A-Za-z_][A-Za-z0-9_]*)\/index\.html)(?: and ([1-9]\d*) other (file|files))?$/;
const identifier = "[\\p{L}_][\\p{L}\\p{N}_]*(?:::[\\p{L}_][\\p{L}\\p{N}_]*)*";
const linkMessage = new RegExp(`^warning: unresolved link to \u0060(${identifier})\u0060$`, "u");
const deadMessage = new RegExp(`^warning: function \u0060(${identifier})\u0060 is never used$`, "u");
const linkHelp = "  = help: to escape `[` and `]` characters, add '\\' before them like `\\[` or `\\]`";
const linkNote = "  = note: `#[warn(rustdoc::broken_intra_doc_links)]` on by default";
const deadNote = "  = note: `#[warn(dead_code)]` (part of `#[warn(unused)]`) on by default";

function parse(output: string, observation: Observation): Reduction | undefined {
  const argv = tokenizeCommand(observation.command), opts = argv && options(argv);
  if (!opts || !output.endsWith("\n") || /[\x00-\x09\x0b-\x1f\x7f-\x9f]|\p{Cf}/u.test(output)) return undefined;
  const rows = lines(output);
  let cursor = 0, removableEnd = 0, diagnostic = false, uncertain = false;
  let currentPackage: string | undefined, pending = 0, pendingKind: "lib" | "lib doc" | undefined;
  const documented = new Set<string>(), versions = new Map<string, string>();
  while (cursor < rows.length) {
    const text = rows[cursor]!.text, row = progress.exec(text);
    if (row) {
      if (pending || !pathValue(row[4]!)) return undefined;
      const oldVersion = versions.get(row[2]!);
      if (oldVersion && oldVersion !== row[3]) return undefined;
      versions.set(row[2]!, row[3]!);
      currentPackage = row[2]!;
      if (row[1] === " Documenting") {
        if (documented.has(currentPackage)) return undefined;
        documented.add(currentPackage);
      }
      // Checking syntax is recognized conservatively, never removed without native proof.
      if (row[1] === "    Checking") uncertain = true;
      if (!diagnostic && !uncertain) removableEnd = rows[cursor]!.span[1];
      cursor++;
      continue;
    }
    const link = linkMessage.exec(text), dead = deadMessage.exec(text);
    if (link || dead) {
      if (!currentPackage || !documented.has(currentPackage)) return undefined;
      diagnostic = true;
      const kind = link ? "lib doc" : "lib";
      if (pendingKind && pendingKind !== kind) return undefined;
      pendingKind = kind;
      const item = (link ?? dead)![1]!;
      const position = /^ --> (.+\.rs):([1-9]\d*):([1-9]\d*)$/.exec(rows[cursor + 1]?.text ?? "");
      const snippet = /^([1-9]\d*) \| (.+)$/.exec(rows[cursor + 3]?.text ?? "");
      const caret = /^  \| ( *)(\^+)(.*)$/.exec(rows[cursor + 4]?.text ?? "");
      if (!position || !pathValue(position[1]!) || uint(position[2]) === undefined || uint(position[3]) === undefined ||
          rows[cursor + 2]?.text !== "  |" || !snippet || snippet[1] !== position[2] || !caret ||
          caret[1]!.length + 1 !== Number(position[3]) || caret[2]!.length !== item.length ||
          !snippet[2]!.includes(item)) return undefined;
      if (link) {
        if (caret[3] !== ` no item named \u0060${item}\u0060 in scope` || rows[cursor + 5]?.text !== "  |" ||
            rows[cursor + 6]?.text !== linkHelp || rows[cursor + 7]?.text !== linkNote || rows[cursor + 8]?.text !== "") return undefined;
        cursor += 9;
      } else {
        if (caret[3] !== "" || rows[cursor + 5]?.text !== "  |" || rows[cursor + 6]?.text !== deadNote ||
            rows[cursor + 7]?.text !== "") return undefined;
        cursor += 8;
      }
      pending++;
      continue;
    }
    const summary = /^warning: `([A-Za-z0-9_-]+)` \((lib doc|lib)\) generated ([1-9]\d*) (warning|warnings)$/.exec(text);
    if (summary) {
      if (!pending || summary[1] !== currentPackage || summary[2] !== pendingKind || uint(summary[3]) !== pending ||
          summary[4] !== (pending === 1 ? "warning" : "warnings")) return undefined;
      pending = 0; pendingKind = undefined; cursor++;
      continue;
    }
    break;
  }
  if (pending || cursor + 2 !== rows.length) return undefined;
  const done = finish.exec(rows[cursor]!.text), artifact = generated.exec(rows[cursor + 1]!.text);
  if (!done || done[1] !== opts.profile || !Number.isFinite(Number(done[2])) || !artifact) return undefined;
  const extra = artifact[3] === undefined ? 0 : uint(artifact[3]);
  if (extra === undefined || (extra > 0 && artifact[4] !== (extra === 1 ? "file" : "files"))) return undefined;
  const path = artifact[1]!, segments = path.split("/");
  if (!pathValue(path) || segments.some((part, index) => part === "." || part === ".." || (part === "" && index > 0))) return undefined;
  if (opts.target && segments.at(-4) !== opts.target) return undefined;
  if (documented.size && documented.size !== extra + 1) return undefined;
  if (!documented.size && extra !== 0) return undefined;
  if (opts.package && documented.size && (!documented.has(opts.package) || documented.size !== 1)) return undefined;
  if (uncertain || removableEnd === 0) return undefined;
  // Entire preserved suffix is mandatory: warnings, subsequent progress, timings and paths.
  const span = [removableEnd, output.length] as const;
  return { pieces: [span], required: [span] };
}

export const familyProfiles: readonly Profile[] = [nativeProfile("cargo-doc", argv => options(argv) !== undefined, parse)];
