import { tokenizeCommand } from "../core/command.js";
import { lines } from "../core/lines.js";
import type { Line, Observation, Profile, Reduction } from "../types.js";
import { nativeProfile, uint } from "./runner-utils.js";

// Observed flags only; values are identifiers, never fixture package/path constants.
const identifier = /^[A-Za-z_][A-Za-z0-9_-]*$/;
function command(argv: readonly string[]): string | undefined {
  if (argv[0] !== "cargo" || argv[1] !== "clippy") return undefined;
  const seen = new Set<string>(), packages = new Set<string>();
  let profile = "dev";
  for (let i = 2; i < argv.length; i++) {
    const flag = argv[i]!;
    if (flag === "--") {
      return argv.length === i + 3 && argv[i + 1] === "-D" && argv[i + 2] === "warnings" ? profile : undefined;
    }
    if (!["--offline", "--workspace", "--all-targets", "--lib", "-p", "--features", "--target", "--profile"].includes(flag)) return undefined;
    if (flag !== "-p" && seen.has(flag)) return undefined;
    seen.add(flag);
    if (["-p", "--features", "--target", "--profile"].includes(flag)) {
      const value = argv[++i];
      if (!value || (flag === "--features" ?
        !value.split(",").every(feature => feature.split("/").length <= 2 && feature.split("/").every(part => identifier.test(part))) :
        !identifier.test(value))) return undefined;
      if (flag === "-p") {
        if (packages.has(value)) return undefined;
        packages.add(value);
      }
      if (flag === "--profile") profile = value;
    }
  }
  if (seen.has("--all-targets") && seen.has("--lib")) return undefined;
  return profile;
}

const progress = /^(?:   Compiling|    Checking) ([A-Za-z_][A-Za-z0-9_-]*) v\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)? \([^()]+\)$/;
const location = /^ --> (.+\.rs):([1-9]\d*):([1-9]\d*)$/;
const source = /^([1-9]\d*) \| (.*)$/;
const marker = /^  \| [ |_]*\^+(?: help: .+)?$/;
const link = /^  = help: for further information visit https:\/\/rust-lang\.github\.io\/rust-clippy\/rust-(\d+\.\d+\.\d+)\/index\.html#([a-z][a-z0-9_]*)$/;
const note = /^  = note: `#\[warn\(clippy::([a-z][a-z0-9_]*)\)\]` on by default$/;
const summary = /^warning: `([A-Za-z_][A-Za-z0-9_-]*)` \((lib(?: test)?|bin "[A-Za-z_][A-Za-z0-9_-]*"(?: test)?)\) generated ([1-9]\d*) (warnings|warning)(.*)$/;
const finished = /^    Finished `([A-Za-z_][A-Za-z0-9_-]*)` profile \[unoptimized \+ debuginfo\] target\(s\) in (?:(\d+)m )?(\d+(?:\.\d+)?)s$/;

interface Diagnostic { next: number; fixes: number; code: string; version: string }
/** A closed native warning frame: source -> caret -> link/note -> optional help diff -> blank. */
function diagnostic(rows: readonly Line[], start: number, knownCodes: ReadonlySet<string>): Diagnostic | undefined {
  let i = start;
  if (!/^warning: \S.*$/.test(rows[i++]?.text ?? "")) return undefined;
  const at = location.exec(rows[i++]?.text ?? "");
  const first = uint(at?.[2]), column = uint(at?.[3]);
  if (!at || !first || !column || rows[i++]?.text !== "  |") return undefined;
  let lineNumber = first, sourceCount = 0;
  while (source.test(rows[i]?.text ?? "")) {
    const row = source.exec(rows[i++]!.text)!;
    if (uint(row[1]) !== lineNumber++) return undefined;
    sourceCount++;
  }
  const underline = rows[i++]?.text ?? "";
  if (!sourceCount || !marker.test(underline) || rows[i++]?.text !== "  |") return undefined;
  let fixes = underline.includes(" help: ") ? 1 : 0;
  const info = link.exec(rows[i++]?.text ?? "");
  if (!info) return undefined;
  const code = info[2]!, version = info[1]!;
  const lintNote = note.exec(rows[i]?.text ?? "");
  if (lintNote) {
    if (lintNote[1] !== code) return undefined;
    i++;
  } else if (!knownCodes.has(code)) return undefined;
  if (/^help: \S.*$/.test(rows[i]?.text ?? "")) {
    if (fixes) return undefined;
    fixes = 1;
    i++;
    if (rows[i++]?.text !== "  |") return undefined;
    const before = /^([1-9]\d*) - .+$/.exec(rows[i++]?.text ?? "");
    const after = /^([1-9]\d*) \+ .+$/.exec(rows[i++]?.text ?? "");
    if (uint(before?.[1]) !== first || uint(after?.[1]) !== first || rows[i++]?.text !== "  |") return undefined;
  }
  if (rows[i++]?.text !== "") return undefined;
  return { next: i, fixes, code, version };
}

function parse(output: string, observation: Observation): Reduction | undefined {
  const argv = tokenizeCommand(observation.command);
  const profile = argv && command(argv);
  if (!profile || !output.endsWith("\n") || /^warning: [A-Za-z_][A-Za-z0-9_-]*@\S+: /m.test(output)) return undefined;
  const rows = lines(output);
  let i = 0;
  while (progress.test(rows[i]?.text ?? "")) i++;
  const boundary = rows[i]?.span[0];
  if (!i || boundary === undefined) return undefined; // Cache has no removable leading progress.
  const contexts = new Set<string>(), originals = new Map<string, number>(), codes = new Set<string>();
  let pending = 0, fixes = 0, version: string | undefined;
  while (i < rows.length) {
    const text = rows[i]!.text;
    const end = finished.exec(text);
    if (end) {
      const seconds = Number(end[3]), minutes = end[2] === undefined ? undefined : uint(end[2]);
      if (pending || !contexts.size || end[1] !== profile || !Number.isFinite(seconds) ||
          seconds < 0 || (end[2] !== undefined && (!minutes || seconds >= 60)) || i !== rows.length - 1) return undefined;
      // One required source suffix protects every diagnostic, help, summary and later progress row.
      const span = [boundary, output.length] as const;
      return { pieces: [span], required: [span] };
    }
    if (progress.test(text)) {
      if (pending || !contexts.size) return undefined;
      i++;
      // Progress must introduce more diagnostics, not an unbound footer.
      if (!/^warning: /.test(rows[i]?.text ?? "")) return undefined;
      continue;
    }
    const total = summary.exec(text);
    if (total) {
      const pkg = total[1]!, context = total[2]!, count = uint(total[3]);
      const key = `${pkg}:${context}`, canonical = `${pkg}:${context.replace(/ test$/, "")}`;
      if (!count || total[4] !== (count === 1 ? "warning" : "warnings") || contexts.has(key)) return undefined;
      const tail = total[5]!;
      const duplicate = /^ \(([1-9]\d*) (duplicate|duplicates)\)$/.exec(tail);
      if (duplicate) {
        const duplicates = uint(duplicate[1]);
        if (pending || duplicates !== count || originals.get(canonical) !== count ||
            duplicate[2] !== (count === 1 ? "duplicate" : "duplicates")) return undefined;
      } else {
        if (pending !== count || originals.has(canonical)) return undefined;
        if (tail) {
          const advice = /^ \(run `(.+)` to apply ([1-9]\d*) (suggestion|suggestions)\)$/.exec(tail);
          const suggestions = uint(advice?.[2]);
          const selector = context.startsWith("lib") ? "--lib" : `--bin ${context.replace(/ test$/, "").slice(4)}`;
          const tests = context.endsWith(" test") ? " --tests" : "";
          if (!advice || !suggestions || suggestions !== fixes || suggestions > count ||
              advice[3] !== (suggestions === 1 ? "suggestion" : "suggestions") ||
              advice[1] !== `cargo clippy --fix ${selector} -p ${pkg}${tests} -- `) return undefined;
        } else if (fixes) return undefined;
        originals.set(canonical, count);
      }
      contexts.add(key);
      pending = 0; fixes = 0; i++;
      continue;
    }
    const warning = diagnostic(rows, i, codes);
    if (!warning || (version !== undefined && version !== warning.version)) return undefined;
    version = warning.version;
    codes.add(warning.code);
    pending++; fixes += warning.fixes; i = warning.next;
  }
  return undefined;
}

export const familyProfiles: readonly Profile[] = [
  nativeProfile("cargo-clippy", argv => command(argv) !== undefined, parse),
];
