// Prints native captures for inspection; it does not write or normalize fixtures.
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const project = process.env.T01_PROJECT;
if (!project) throw new Error("T01_PROJECT must name the disposable project");
const compiler = resolve("node_modules/typescript/bin/tsc");
const stages = {
  initial: [
    ["success", ["-p", "tsconfig.json", "--pretty", "false"]],
    ["no-emit", ["-p", "tsconfig.json", "--noEmit", "--pretty", "false"]],
    ["plain-error", ["-p", "error.json", "--noEmit", "--pretty", "false"]],
    ["pretty-error", ["-p", "error.json", "--noEmit", "--pretty", "true"]],
    ["build-initial", ["-b", "refs", "--verbose", "--pretty", "false"]],
    ["build-up-to-date", ["-b", "refs", "--verbose", "--pretty", "false"]],
    ["diagnostics", ["-p", "tsconfig.json", "--diagnostics", "--pretty", "false"]],
    ["extended-diagnostics", ["-p", "tsconfig.json", "--extendedDiagnostics", "--pretty", "false"]],
    ["list-files", ["-p", "tsconfig.json", "--listFiles", "--pretty", "false"]],
    ["list-emitted-files", ["-p", "tsconfig.json", "--listEmittedFiles", "--pretty", "false"]],
    ["explain-files", ["-p", "tsconfig.json", "--explainFiles", "--pretty", "false"]],
    ["metrics-lists", ["-p", "tsconfig.json", "--extendedDiagnostics", "--listFiles", "--listEmittedFiles", "--explainFiles", "--pretty", "false"]],
    ["error-metrics-lists", ["-p", "error.json", "--noEmit", "--diagnostics", "--listFiles", "--listEmittedFiles", "--explainFiles", "--pretty", "true"]],
  ],
  incremental: [
    ["build-incremental", ["-b", "refs", "--verbose", "--pretty", "false"]],
    ["build-metrics-lists", ["-b", "refs", "--force", "--verbose", "--extendedDiagnostics", "--listFiles", "--listEmittedFiles", "--explainFiles", "--pretty", "false"]],
  ],
  failure: [
    ["build-error", ["-b", "refs", "--verbose", "--pretty", "true"]],
    ["project-incremental-initial", ["-p", "tsconfig.json", "--incremental", "--pretty", "false"]],
    ["project-incremental-cached", ["-p", "tsconfig.json", "--incremental", "--pretty", "false"]],
  ],
};
const variants = stages[process.argv[2] ?? "initial"];
if (!variants) throw new Error("Unknown capture stage");
for (const [name, argv] of variants) {
  const result = spawnSync(process.execPath, [compiler, ...argv], { cwd: project });
  if (result.error || result.signal || result.status === null) throw result.error ?? new Error("Incomplete capture");
  if (result.stderr.length) throw new Error("Unexpected stderr; a merged boundary needs a different recorder");
  const output = result.stdout.toString("utf8");
  if (!Buffer.from(output, "utf8").equals(result.stdout)) throw new Error("Non-UTF-8 output cannot be saved losslessly as text");
  console.log(JSON.stringify({ name, argv, code: result.status, output }));
}
