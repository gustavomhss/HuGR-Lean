import { lines } from "../core/lines.js";
import type { Line, Reduction } from "../core/types.js";
import { nativeProfile, reduction } from "./runner-utils.js";

function goIdentity(argv: readonly string[]): boolean {
  return argv[0] === "go" && argv[1] === "test" && argv[2] === "-v" &&
    (argv.length === 3 || (argv.length === 4 && argv[3] === "."));
}

function go(rows: readonly Line[]): Reduction | undefined {
  let i = 0;
  const kept: Line[] = [];
  const names = new Set<string>();
  while (rows[i]?.text.startsWith("=== RUN   ")) {
    const start = rows[i++]!;
    const run = /^=== RUN   (Test[\p{L}\p{N}_]+)$/u.exec(start.text);
    if (!run || names.has(run[1]!)) return undefined;
    names.add(run[1]!);
    const end = rows[i++];
    const result = /^--- (PASS|SKIP): (Test[\p{L}\p{N}_]+) \(\d+(?:\.\d+)?s\)$/u.exec(end?.text ?? "");
    // In particular, t.Log rows between RUN and PASS must not disappear.
    if (!end || !result || result[2] !== run[1]) return undefined;
    if (result[1] === "SKIP") kept.push(start, end);
  }
  const pass = rows[i++];
  const summary = rows[i++];
  if (names.size === 0 || pass?.text !== "PASS" || !summary ||
      !/^ok  \t[^\s]+\t\d+(?:\.\d+)?s$/.test(summary.text) || i !== rows.length) return undefined;
  kept.push(pass, summary);
  return reduction(kept);
}

export const goProfile = nativeProfile("go-test-verbose", goIdentity, (output) => go(lines(output)));
