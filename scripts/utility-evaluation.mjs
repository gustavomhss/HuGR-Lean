// Native fixture utility only: no upstream execution, historical replay or latency sampling.
import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readUtilityCorpus, readArtifactInventory as inventory } from "./utility-corpus.mjs";
export { readUtilityCorpus } from "./utility-corpus.mjs";

const record = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const nonempty = (v) => typeof v === "string" && v.length > 0;
const sha = (v) => typeof v === "string" && /^[a-f0-9]{40}$/.test(v);
function demand(ok, code, context) {
  if (!ok) throw new Error(`${code}: ${context}`);
}
function safe(file, context) {
  demand(nonempty(file) && !file.includes("\\") && !file.includes("\0") && !path.posix.isAbsolute(file)
    && file.split("/").every((part) => part.length > 0 && part !== "." && part !== ".."), "UNSAFE_PATH", `${context}: ${file}`);
  return file;
}

/** Injected functions permit schema teeth tests. CLI always uses compiled default implementations. */
export async function evaluateUtilityCorpus({ root, filter, createAfterHook }) {
  const report = { schema: "hugr-lean/utility-evaluation/1", scope: "new native fixture utility; no upstream execution or historical replay",
    oracle: "independent golden bytes and ordered rendered anchors; Profile.required and emitted-span declarations checked by parser tests",
    ok: false, expectedCases: null, checked: 0, passed: 0, records: [], failures: [], families: [] };
  let corpus;
  try {
    demand(typeof filter === "function" && typeof createAfterHook === "function", "MISSING_EVALUATION_DEPENDENCY", "filter/createAfterHook");
    corpus = await readUtilityCorpus(root);
  } catch (error) {
    report.failures.push({ id: "corpus", stage: "read", error: error.message });
    return report;
  }
  report.expectedCases = corpus.cases.length;
  for (const item of corpus.cases) {
    const row = { id: item.id, family: item.family, role: item.role, command: item.command,
      exitCode: item.exitCode, signal: item.signal, complete: item.complete, timedOut: item.timedOut,
      expectedStatus: item.expectedStatus, expectedProfile: item.profile, material: item.material,
      inputBytes: item.original.bytes, expectedBytes: item.expected.bytes, expectedSavedBytes: item.original.bytes - item.expected.bytes,
      capture: item.capture, original: item.original, expected: item.expected, fixtureSources: item.fixtureSources,
      ok: false, result: null };
    let stage = "filter";
    try {
      const observation = structuredClone(item.observation), before = structuredClone(observation);
      const actual = await filter(observation);
      row.result = actual;
      demand(isDeepStrictEqual(observation, before), "OBSERVATION_CHANGED", item.id);
      demand(record(actual) && actual.status === item.expectedStatus, "STATUS_MISMATCH", item.id);
      demand(actual.inputBytes === item.original.bytes && actual.outputBytes === item.expected.bytes, "BYTE_METRIC_MISMATCH", item.id);
      demand(nonempty(actual.reason), "MISSING_RESULT_REASON", item.id);
      demand(item.role === "noise" ? actual.profile === item.profile && actual.replacement === item.expectedText
        : !Object.hasOwn(actual, "replacement") && !Object.hasOwn(actual, "profile"), "CORE_GOLDEN_OR_PROFILE_MISMATCH", item.id);
      stage = "evidence";
      const outputText = item.role === "noise" ? actual.replacement : item.originalText;
      for (const anchor of item.required) {
        const [start, end] = anchor.expectedSpan;
        demand(item.originalText.slice(...anchor.sourceSpan) === anchor.text && outputText.slice(start, end) === anchor.text,
          "RENDERED_ANCHOR_LOSS", item.id);
      }
      stage = "hook";
      const input = { tool: "bash", args: { command: item.command }, callID: item.id };
      const output = { title: item.id, output: item.originalText, metadata: {
        exit: item.timedOut || item.signal !== null ? null : item.exitCode,
        truncated: item.complete ? false : undefined, output: item.originalText,
      } };
      const inputBefore = structuredClone(input), outputBefore = structuredClone(output);
      const hook = createAfterHook({ raw: false });
      demand(typeof hook === "function", "INVALID_AFTER_HOOK", item.id);
      await hook(input, output);
      demand(output.output === item.expectedText, "HOOK_GOLDEN_MISMATCH", item.id);
      demand(isDeepStrictEqual(input, inputBefore)
        && isDeepStrictEqual(output, { ...outputBefore, output: output.output }), "EXECUTION_FACTS_CHANGED", item.id);
      row.ok = true; report.passed++;
    } catch (error) {
      report.failures.push({ id: item.id, stage, error: error instanceof Error ? error.message : String(error) });
    }
    report.records.push(row); report.checked++;
  }
  report.families = corpus.families.map(({ family, tools, producer }) => {
    const rows = report.records.filter((row) => row.family === family);
    return { family, tools, producer, cases: rows.length, passed: rows.filter((row) => row.ok).length,
      exact: rows.filter((row) => row.role === "exact").length, material: rows.filter((row) => row.material).length,
      inputBytes: rows.reduce((sum, row) => sum + row.inputBytes, 0), expectedBytes: rows.reduce((sum, row) => sum + row.expectedBytes, 0) };
  });
  report.ok = report.checked > 0 && report.checked === report.expectedCases && report.passed === report.checked && report.failures.length === 0;
  return report;
}

// Framing prevents ambiguous name/content concatenations. Final release/tarball/report binding is lead-owned.
function inventoryHash(files) {
  const framed = createHash("sha256");
  for (const [name, data] of [...files].sort(([a], [b]) => a.localeCompare(b))) {
    framed.update(`${Buffer.byteLength(name)}:${name}:${data.length}:`).update(data);
  }
  return framed.digest("hex");
}
async function buildProvenance(root) {
  const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", timeout: 10000 });
  const sourceSHA = git("rev-parse", "HEAD").trim();
  demand(sha(sourceSHA), "INVALID_GIT_HEAD", root);
  const paths = ["src", "scripts", "package.json", "package-lock.json", "tsconfig.json", "tsconfig.build.json"];
  demand(!git("status", "--porcelain", "--untracked-files=all", "--", ...paths).trim(), "DIRTY_EVALUATION_SOURCE", root);
  const names = git("ls-files", "-z", "--", ...paths).split("\0").filter(Boolean), source = new Map();
  demand(names.length > 0, "EMPTY_SOURCE_INVENTORY", root);
  for (const file of names) {
    safe(file, root);
    const absolute = path.join(root, file), stat = await lstat(absolute);
    demand(stat.isFile() && !stat.isSymbolicLink() && await realpath(absolute) === absolute, "SOURCE_PATH_ALIAS", file);
    source.set(file, await readFile(absolute));
  }
  const { default: ts } = await import("typescript");
  const config = ts.readConfigFile(path.join(root, "tsconfig.build.json"), ts.sys.readFile);
  demand(!config.error, "BUILD_CONFIG_ERROR", root);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
  demand(parsed.errors.length === 0 && parsed.fileNames.length > 0, "BUILD_CONFIG_ERROR", root);
  const emitted = new Map(), program = ts.createProgram(parsed.fileNames, parsed.options);
  const result = program.emit(undefined, (file, text) => emitted.set(path.relative(path.join(root, "dist"), file).split(path.sep).join("/"), Buffer.from(text)));
  demand(!result.emitSkipped && ts.getPreEmitDiagnostics(program).length === 0 && result.diagnostics.length === 0, "BUILD_DIAGNOSTICS", root);
  const compiled = await inventory(path.join(root, "dist"));
  demand(compiled.size > 0 && compiled.size === emitted.size
    && [...emitted].every(([file, data]) => compiled.get(file)?.equals(data)), "STALE_OR_UNCLEAN_BUILD", "run npm run build before utility evaluation");
  return { sourceSHA, sourceSHA256: inventoryHash(source), compiledSHA256: inventoryHash(compiled),
    sourceFiles: source.size, compiledFiles: compiled.size, buildCheck: "exact TypeScript compiler output and closed dist inventory" };
}
async function cli(args) {
  let report;
  try {
    demand(args.length === 1 || args.length === 3, "INVALID_CLI_ARGUMENTS", "usage: node scripts/utility-evaluation.mjs --clean-build [--root fixtures/utility]");
    demand(args[0] === "--clean-build", "CLEAN_BUILD_REQUIRED", "run npm run build, then pass --clean-build");
    demand(args.length === 1 || (args[1] === "--root" && nonempty(args[2])), "INVALID_CLI_ARGUMENTS", "--root requires a corpus path");
    const packageRoot = fileURLToPath(new URL("../", import.meta.url)), provenance = await buildProvenance(packageRoot);
    const { filter } = await import(new URL("../dist/core/index.js", import.meta.url));
    const { createAfterHook } = await import(new URL("../dist/opencode/index.js", import.meta.url));
    report = await evaluateUtilityCorpus({ root: args[2] ?? path.join(packageRoot, "fixtures/utility"), filter, createAfterHook });
    report.provenance = provenance;
  } catch (error) {
    report = { ok: false, checked: 0, failures: [{ id: "cli", stage: "provenance", error: error.message }] };
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.ok) process.exitCode = 1;
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) await cli(process.argv.slice(2));
