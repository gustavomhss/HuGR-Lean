import { iterateLines } from "../core/lines.js";
import { tokenizeCommand } from "../core/command.js";
import type { Line, Observation, Profile, Reduction } from "../core/types.js";
import { nativeProfile, reduction, uint } from "./runner-utils.js";

function cargoIdentity(argv: readonly string[], subcommand: string): boolean {
  if (argv[0] !== "cargo" || argv[1] !== subcommand) return false;
  let color = false, library = false;
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--lib" && subcommand === "test" && !library) library = true;
    else if (!color && (argv[i] === "--color=never" || (argv[i] === "--color" && argv[i + 1] === "never"))) {
      color = true;
      if (argv[i] === "--color") i++;
    } else return false;
  }
  return true;
}

const compiling = /^   Compiling [A-Za-z0-9_-]+ v\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?(?: \([^()]+\))?$/;
const rustName = "[\\p{L}_][\\p{L}\\p{N}_]*(?:::[\\p{L}_][\\p{L}\\p{N}_]*)*";
const rustTest = new RegExp(`^test (${rustName}) \\.\\.\\. (ok|ignored(?:, .+)?)$`, "u");
const docTest = new RegExp(`^test ([^\\s()]+\\.rs - ${rustName} \\(line (\\d+)\\)) \\.\\.\\. (ok|ignored(?:, .+)?)$`, "u");
const executableHeader = /^     Running (unittests [^\s()]+\.rs|tests\/[^\s()]+\.rs) \(((?:\/[^\s()]+\/)?target\/debug\/deps\/([^\s()]+))\)$/;
const docHeader = /^   Doc-tests ([A-Za-z0-9_-]+)$/;
const finishRow = /^    Finished `(test|dev)` profile \[unoptimized \+ debuginfo\] target\(s\) in (?:(\d+)m )?(\d+(?:\.\d+)?)s$/;
const summaryRow = /^test result: ok\. (\d+) passed; 0 failed; (\d+) ignored; 0 measured; (\d+) filtered out; finished in (\d+(?:\.\d+)?)s$/;

function finiteSeconds(value: string, minuteComponent = false): boolean {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds >= 0 && (!minuteComponent || seconds < 60);
}

function cargo(output: string, observation: Observation, testing: boolean): Reduction | undefined {
  const argv = tokenizeCommand(observation.command);
  if (!argv || !cargoIdentity(argv, testing ? "test" : "build")) return undefined;
  const libraryOnly = testing && argv.includes("--lib");
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
  const finish = finishRow.exec(finished?.text ?? "");
  if (!finished || !finish || finish[1] !== mode || !finiteSeconds(finish[3]!, finish[2] !== undefined) ||
      (finish[2] !== undefined && (uint(finish[2]) === undefined || Number(finish[2]) < 1))) return undefined;
  const kept: Line[] = [finished];
  if (!testing) return current === undefined ? reduction(kept) : undefined;

  const contexts = new Set<string>(), executables = new Set<string>();
  let suites = 0;
  while (current?.text === "") take();
  while (current !== undefined) {
    const header = take()!;
    const executable = executableHeader.exec(header.text), doc = docHeader.exec(header.text);
    if (!executable && !doc) return undefined;
    const context = executable ? `exec:${executable[1]}` : `doc:${doc![1]}`;
    if (contexts.has(context)) return undefined;
    if (libraryOnly && (suites !== 0 || executable?.[1] !== "unittests src/lib.rs")) return undefined;
    contexts.add(context);
    if (executable) {
      // Absolute and relative spellings of the same target cannot supply a second context.
      const target = executable[3]!;
      if (executables.has(target)) return undefined;
      executables.add(target);
    }
    suites++;
    kept.push(header);
    while (current?.text === "") take();
    const count = /^running (\d+) (test|tests)$/.exec(take()?.text ?? "");
    const total = uint(count?.[1]);
    if (total === undefined || count?.[2] !== (total === 1 ? "test" : "tests")) return undefined;
    let passed = 0, ignored = 0;
    const names = new Set<string>();
    while (current?.text.startsWith("test ") && !current.text.startsWith("test result:")) {
      const line = take()!;
      const test = (doc ? docTest : rustTest).exec(line.text);
      if (!test || names.has(test[1]!) || (doc && (uint(test[2]) === undefined || Number(test[2]) < 1))) return undefined;
      names.add(test[1]!);
      if (test[doc ? 3 : 2] === "ok") passed++;
      else { ignored++; kept.push(line); }
    }
    while (current?.text === "") take();
    const summary = take();
    const result = summaryRow.exec(summary?.text ?? "");
    if (!summary || !result || uint(result[1]) !== passed || uint(result[2]) !== ignored ||
        uint(result[3]) === undefined || passed + ignored !== total || !finiteSeconds(result[4]!)) return undefined;
    kept.push(summary);
    while (current?.text === "") take();
  }
  if (suites === 0) return undefined;
  return reduction(kept);
}

export const cargoProfiles: readonly Profile[] = [
  nativeProfile("cargo-test", (argv) => cargoIdentity(argv, "test"), (output, observation) => cargo(output, observation, true)),
  nativeProfile("cargo-build", (argv) => cargoIdentity(argv, "build"), (output, observation) => cargo(output, observation, false)),
];
