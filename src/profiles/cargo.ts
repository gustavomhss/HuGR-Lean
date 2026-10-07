import { iterateLines } from "../core/lines.js";
import type { Line, Profile, Reduction } from "../core/types.js";
import { nativeProfile, reduction, uint } from "./runner-utils.js";

function cargoIdentity(argv: readonly string[], subcommand: string): boolean {
  return argv[0] === "cargo" && argv[1] === subcommand && (
    argv.length === 2 ||
    (argv.length === 3 && argv[2] === "--color=never") ||
    (argv.length === 4 && argv[2] === "--color" && argv[3] === "never")
  );
}

const compiling = /^   Compiling [A-Za-z0-9_-]+ v\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?(?: \([^()]+\))?$/;
const rustName = "[\\p{L}_][\\p{L}\\p{N}_]*(?:::[\\p{L}_][\\p{L}\\p{N}_]*)*";
const rustTest = new RegExp(`^test (${rustName}) \\.\\.\\. (ok|ignored(?:, .+)?)$`, "u");

function cargo(output: string, testing: boolean): Reduction | undefined {
  const rows = iterateLines(output);
  let current = rows.next().value ?? undefined;
  function take(): Line | undefined {
    const line = current;
    current = rows.next().value ?? undefined;
    return line;
  }
  while (current && compiling.test(current.text)) take();
  const finished = take();
  const mode = testing ? "test" : "dev";
  if (!finished || !new RegExp(
    `^    Finished \`${mode}\` profile \\[unoptimized \\+ debuginfo\\] target\\(s\\) in \\d+(?:\\.\\d+)?s$`,
  ).test(finished.text)) return undefined;
  const kept: Line[] = [finished];
  if (!testing) return current === undefined ? reduction(kept) : undefined;

  const running = take();
  if (!running || !/^     Running (?:unittests [^\s()]+\.rs|tests\/[^\s()]+\.rs) \(target\/debug\/deps\/[^\s()]+\)$/.test(running.text)) return undefined;
  kept.push(running);
  while (current?.text === "") take();
  const count = /^running (\d+) (test|tests)$/.exec(take()?.text ?? "");
  const total = uint(count?.[1]);
  if (total === undefined || count?.[2] !== (total === 1 ? "test" : "tests")) return undefined;
  let passed = 0;
  let ignored = 0;
  const names = new Set<string>();
  while (current?.text.startsWith("test ")) {
    const line = take()!;
    const test = rustTest.exec(line.text);
    if (!test || names.has(test[1]!)) return undefined;
    names.add(test[1]!);
    if (test[2] === "ok") passed++;
    else { ignored++; kept.push(line); }
  }
  while (current?.text === "") take();
  const summary = take();
  const result = /^test result: ok\. (\d+) passed; 0 failed; (\d+) ignored; 0 measured; (\d+) filtered out; finished in \d+(?:\.\d+)?s$/.exec(summary?.text ?? "");
  if (!summary || !result || uint(result[1]) !== passed || uint(result[2]) !== ignored ||
      uint(result[3]) === undefined || passed + ignored !== total) return undefined;
  while (current?.text === "") take();
  if (current !== undefined) return undefined;
  kept.push(summary);
  return reduction(kept);
}

export const cargoProfiles: readonly Profile[] = [
  nativeProfile("cargo-test", (argv) => cargoIdentity(argv, "test"), (output) => cargo(output, true)),
  nativeProfile("cargo-build", (argv) => cargoIdentity(argv, "build"), (output) => cargo(output, false)),
];
