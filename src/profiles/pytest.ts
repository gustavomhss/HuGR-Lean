import { lines } from "../core/lines.js";
import type { Line, Reduction } from "../core/types.js";
import { blankEnd, nativeProfile, reduction, uint } from "./runner-utils.js";

function pytestIdentity(argv: readonly string[]): boolean {
  let end: number;
  if (argv[0] === "pytest") end = 1;
  else if ((argv[0] === "python" || argv[0] === "python3") && argv[1] === "-m" && argv[2] === "pytest") end = 3;
  else return false;
  return argv.length === end || (argv.length === end + 1 && argv[end] === "--color=no");
}

function pytest(rows: readonly Line[]): Reduction | undefined {
  let i = 0;
  if (!/^={3,} test session starts ={3,}$/.test(rows[i++]?.text ?? "")) return undefined;
  const platform = rows[i++];
  // Reporter/version pair measured with native pytest; other versions stay exact.
  if (!platform || !/^platform (?:darwin|linux|win32) -- Python 3\.\d+\.\d+, pytest-9\.0\.3, pluggy-1\.6\.0$/.test(platform.text)) return undefined;
  const root = rows[i++];
  if (!root || !/^rootdir: \S.*$/.test(root.text)) return undefined;
  const kept: Line[] = [platform, root];
  if (rows[i]?.text.startsWith("configfile: ")) {
    const config = rows[i++]!;
    if (!/^configfile: [^\r\n]+\.(?:toml|ini|cfg)$/.test(config.text)) return undefined;
    kept.push(config);
  }
  const collection = /^collected (\d+) (item|items)$/.exec(rows[i++]?.text ?? "");
  const total = uint(collection?.[1]);
  if (total === undefined || total === 0 || collection?.[2] !== (total === 1 ? "item" : "items")) return undefined;
  while (rows[i]?.text === "") i++;
  let passed = 0;
  let skipped = 0;
  const files = new Set<string>();
  while (rows[i] && !rows[i]!.text.startsWith("=")) {
    const line = rows[i++]!;
    if (line.text === "") break;
    const progress = /^([^\s]+\.py) ([.s]+) +\[ *(\d+)%\]$/.exec(line.text);
    if (!progress || files.has(progress[1]!)) return undefined;
    files.add(progress[1]!);
    for (const mark of progress[2]!) {
      if (mark === ".") passed++;
      else skipped++;
    }
    if (passed + skipped > total || uint(progress[3]) !== Math.floor((passed + skipped) * 100 / total)) return undefined;
    // Mixed rows carry file/skip evidence, so retain the whole native row.
    if (progress[2]!.includes("s")) kept.push(line);
  }
  while (rows[i]?.text === "") i++;
  const summary = rows[i++];
  const result = /^={3,} (?:(\d+) passed(?:, (\d+) skipped)?|(\d+) skipped) in \d+(?:\.\d+)?s ={3,}$/.exec(summary?.text ?? "");
  if (!summary || !result) return undefined;
  const summaryPassed = result[1] === undefined ? 0 : uint(result[1]);
  const summarySkipped = result[2] === undefined && result[3] === undefined ? 0 : uint(result[2] ?? result[3]);
  if (summaryPassed !== passed || summarySkipped !== skipped || passed + skipped !== total ||
      (result[1] !== undefined && summaryPassed === 0) ||
      ((result[2] !== undefined || result[3] !== undefined) && summarySkipped === 0) || !blankEnd(rows, i)) return undefined;
  kept.push(summary);
  return reduction(kept);
}

export const pytestProfile = nativeProfile("pytest", pytestIdentity, (output) => pytest(lines(output)));
