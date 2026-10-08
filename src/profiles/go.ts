import { lines } from "../core/lines.js";
import type { Line, Reduction } from "../core/types.js";
import { nativeProfile, reduction, uint } from "./runner-utils.js";

function goIdentity(argv: readonly string[]): boolean {
  return argv[0] === "go" && argv[1] === "test" && argv[2] === "-v" &&
    (argv.length === 3 || (argv.length === 4 && (argv[3] === "." || argv[3] === "./...")));
}

function go(rows: readonly Line[]): Reduction | undefined {
  let i = 0;
  const kept: Line[] = [];
  const packages = new Set<string>();
  let testPackages = 0;
  while (i < rows.length) {
    const noTests = /^\?[ \t]+([^\s]+)\t\[no test files\]$/.exec(rows[i]!.text);
    if (noTests) {
      if (packages.has(noTests[1]!)) return undefined;
      packages.add(noTests[1]!);
      kept.push(rows[i++]!);
      continue;
    }

    // A package's summary closes its test-name scope. Repeated names in other
    // packages are native and do not identify the same test instance.
    const names = new Set<string>();
    while (rows[i]?.text.startsWith("=== RUN   ")) {
      const start = i;
      const run = /^=== RUN   (Test[\p{L}\p{N}_]+)$/u.exec(rows[i++]!.text);
      if (!run || names.has(run[1]!)) return undefined;
      names.add(run[1]!);
      let diagnostic = false;
      while (rows[i]?.text.startsWith("    ")) {
        const row = rows[i++]!.text;
        const header = /^ {4}[^\s:]+\.go:([1-9]\d*):(?: .*)?$/.exec(row);
        if (header) {
          if (uint(header[1]) === undefined) return undefined;
          diagnostic = true;
        } else if (!diagnostic || !/^ {8}/.test(row) ||
            /^\s*(?:=== (?:RUN|PAUSE|CONT)|--- (?:PASS|SKIP|FAIL))\b/.test(row)) {
          return undefined;
        }
      }
      const end = rows[i++];
      const result = /^--- (PASS|SKIP): (Test[\p{L}\p{N}_]+) \((\d+(?:\.\d+)?)s\)$/u.exec(end?.text ?? "");
      if (!end || !result || result[2] !== run[1] || !Number.isFinite(Number(result[3]))) return undefined;
      // Protect the enclosing RUN/result, not just the diagnostic message.
      if (diagnostic || result[1] === "SKIP") kept.push(...rows.slice(start, i));
    }
    const pass = rows[i++];
    const summary = rows[i++];
    const packageResult = /^ok {2}\t([^\s]+)\t(\d+(?:\.\d+)?s|\(cached\))$/.exec(summary?.text ?? "");
    if (names.size === 0 || pass?.text !== "PASS" || !summary || !packageResult ||
        (packageResult[2] !== "(cached)" && !Number.isFinite(Number(packageResult[2]!.slice(0, -1)))) ||
        packages.has(packageResult[1]!)) return undefined;
    packages.add(packageResult[1]!);
    testPackages++;
    kept.push(pass, summary);
  }
  return testPackages > 0 ? reduction(kept) : undefined;
}

export const goProfile = nativeProfile("go-test-verbose", goIdentity, (output) => go(lines(output)));
