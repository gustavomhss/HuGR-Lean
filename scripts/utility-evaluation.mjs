// Native fixture utility only: no upstream execution, historical replay or latency sampling.
import { createHash } from "node:crypto";
import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const FAMILIES = { go: ["go-test-verbose"], pytest: ["pytest"], node: ["node-test"], cargo: ["cargo-test", "cargo-build"] };
const SCHEMA = "hugr-lean/utility-corpus/1";
const hash = (data) => createHash("sha256").update(data).digest("hex");
const record = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const nonempty = (v) => typeof v === "string" && v.length > 0;
const digest = (v) => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
const sha = (v) => typeof v === "string" && /^[a-f0-9]{40}$/.test(v);
function demand(ok, code, context) {
  if (!ok) throw new Error(`${code}: ${context}`);
}
function keys(value, required, optional, context) {
  demand(record(value), "INVALID_OBJECT", context);
  demand(required.every((key) => Object.hasOwn(value, key)), "MISSING_FIELD", context);
  demand(Object.keys(value).every((key) => required.includes(key) || optional.includes(key)), "UNKNOWN_FIELD", context);
}
function list(value, context) {
  demand(Array.isArray(value) && value.length > 0, "EMPTY_OR_INVALID_LIST", context);
  return value;
}
function safe(file, context) {
  demand(nonempty(file) && !file.includes("\\") && !file.includes("\0") && !path.posix.isAbsolute(file)
    && file.split("/").every((part) => part.length > 0 && part !== "." && part !== ".."), "UNSAFE_PATH", `${context}: ${file}`);
  return file;
}
function descriptor(value, context, source = false) {
  keys(value, ["file", "sha256", "bytes"], source ? ["sourceFile"] : [], context);
  safe(value.file, context);
  demand(digest(value.sha256) && Number.isSafeInteger(value.bytes) && value.bytes >= 0, "INVALID_DIGEST_DESCRIPTOR", context);
  if (value.sourceFile !== undefined) safe(value.sourceFile, context);
}
function decode(data, context) {
  let text;
  try { text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(data); }
  catch { throw new Error(`NON_UTF8: ${context}`); }
  demand(Buffer.from(text).equals(data), "UTF8_ROUNDTRIP", context);
  return text;
}
function json(data, context) {
  try { return JSON.parse(decode(data, context)); }
  catch (error) { throw new Error(`INVALID_JSON: ${context}: ${error.message}`); }
}
async function inventory(root) {
  demand(!(await lstat(root)).isSymbolicLink(), "SYMLINK", root);
  const files = new Map(), identities = new Set();
  async function walk(directory, prefix) {
    const entries = await readdir(directory);
    demand(entries.length > 0, "EMPTY_DIRECTORY", directory);
    for (const name of entries.sort()) {
      const file = prefix ? `${prefix}/${name}` : name, absolute = path.join(directory, name);
      safe(file, root);
      const stat = await lstat(absolute);
      demand(!stat.isSymbolicLink(), "SYMLINK", file);
      if (stat.isDirectory()) await walk(absolute, file);
      else {
        demand(stat.isFile(), "NOT_PLAIN_FILE", file);
        const identity = `${stat.dev}:${stat.ino}`;
        demand(!identities.has(identity), "FILE_ALIAS", file);
        identities.add(identity);
        demand(await realpath(absolute) === absolute, "PATH_ALIAS", file);
        files.set(file, await readFile(absolute));
      }
    }
  }
  await walk(root, "");
  return files;
}
function artifact(files, used, ref, context, shared = false) {
  descriptor(ref, context, shared);
  const data = files.get(ref.file);
  demand(data !== undefined, "MISSING_ARTIFACT", `${context}: ${ref.file}`);
  demand(shared || !used.has(ref.file), "DUPLICATE_ARTIFACT_PATH", `${context}: ${ref.file}`);
  demand(data.length === ref.bytes && hash(data) === ref.sha256, "ARTIFACT_DIGEST_MISMATCH", `${context}: ${ref.file}`);
  used.add(ref.file);
  return decode(data, `${context}: ${ref.file}`);
}
function tools(value, context) {
  const names = new Set();
  for (const tool of list(value, context)) {
    keys(tool, ["name", "version", "executable"], [], context);
    demand([tool.name, tool.version, tool.executable].every(nonempty) && path.isAbsolute(tool.executable), "INVALID_TOOL", context);
    demand(!names.has(tool.name), "DUPLICATE_TOOL", `${context}: ${tool.name}`);
    names.add(tool.name);
  }
}
function anchors(original, expected, required, context) {
  let sourceEnd = 0, outputEnd = 0;
  return list(required, `${context}: required`).map((anchor) => {
    keys(anchor, ["text", "occurrence"], [], context);
    demand(nonempty(anchor.text) && Number.isSafeInteger(anchor.occurrence) && anchor.occurrence >= 0, "INVALID_ANCHOR", context);
    let start = -1, cursor = 0;
    for (let occurrence = 0; occurrence <= anchor.occurrence; occurrence++) {
      start = original.indexOf(anchor.text, cursor);
      demand(start >= 0, "MISSING_SOURCE_ANCHOR", `${context}: ${JSON.stringify(anchor)}`);
      cursor = start + anchor.text.length;
    }
    demand(start >= sourceEnd, "DUPLICATE_OR_UNORDERED_ANCHOR", context);
    sourceEnd = start + anchor.text.length;
    const emitted = expected.indexOf(anchor.text, outputEnd);
    demand(emitted >= 0, "EXPECTED_ANCHOR_LOSS", `${context}: ${JSON.stringify(anchor)}`);
    outputEnd = emitted + anchor.text.length;
    return { ...anchor, sourceSpan: [start, sourceEnd], expectedSpan: [emitted, outputEnd] };
  });
}
function sameDigest(actual, expected, context) {
  demand(record(actual) && actual.file === expected.file && actual.bytes === expected.bytes
    && actual.sha256 === expected.sha256, "RECEIPT_ARTIFACT_MISMATCH", context);
}
function receiptCheck(receipt, item, manifest, context) {
  demand(record(receipt), "INVALID_RECEIPT", context);
  const facts = receipt.facts ?? receipt;
  demand(record(facts), "INVALID_RECEIPT_FACTS", context);
  for (const key of ["command", "exitCode", "complete", "signal", "timedOut"]) {
    demand(facts[key] === item[key], "RECEIPT_FACT_MISMATCH", `${context}: ${key}`);
    if (Object.hasOwn(receipt, key)) demand(receipt[key] === facts[key], "CONFLICTING_RECEIPT_FACTS", `${context}: ${key}`);
  }
  demand(nonempty(facts.cwd) && path.isAbsolute(facts.cwd), "INVALID_CAPTURE_CWD", context);
  demand(facts.nativeSpawned === true && typeof facts.nativeExitObserved === "boolean", "INVALID_NATIVE_FACTS", context);
  const errors = [facts.launchError, facts.encodingError, receipt.errors?.launch, receipt.errors?.encoding, receipt.errors?.preparation];
  const cleanup = [facts.killErrors, facts.cleanupErrors, receipt.cleanupErrors, receipt.errors?.cleanup];
  demand(errors.every((v) => v === undefined || v === null)
    && cleanup.every((v) => v === undefined || (Array.isArray(v) && v.length === 0)), "CAPTURE_ERRORS", context);
  const complete = !facts.timedOut && Number.isSafeInteger(facts.exitCode) && facts.signal === null;
  demand(facts.complete === complete && (!complete || facts.nativeExitObserved), "INCOHERENT_CAPTURE_FACTS", context);
  demand(!facts.timedOut || item.role === "exact", "TIMED_OUT_NOISE", context);
  demand(Number.isFinite(facts.durationMs) && facts.durationMs >= 0 && nonempty(facts.durationBoundary), "INVALID_DURATION_PROVENANCE", context);
  demand(sha(receipt.baseline ?? receipt.baselineSourceSHA)
    && (receipt.sourceHead === undefined || sha(receipt.sourceHead)), "INVALID_SOURCE_PROVENANCE", context);
  demand(nonempty(receipt.environmentPolicy) || record(receipt.environmentPolicy) || record(receipt.environment), "MISSING_ENVIRONMENT_PROVENANCE", context);
  demand(record(receipt.producer)
    && (receipt.producer.script ?? receipt.producer.file) === manifest.producer.script
    && (receipt.producer.sourceSHA256 ?? receipt.producer.sha256) === manifest.producer.sourceSHA256, "PRODUCER_MISMATCH", context);
  const streams = receipt.artifacts ?? receipt.streams ?? receipt;
  for (const key of ["original", "stdout", "stderr"]) sameDigest(streams[key], item[key], `${context}: ${key}`);
  const sources = list(receipt.fixtureSources, `${context}: receipt.fixtureSources`), mapped = new Set();
  demand(sources.length === item.fixtureSources.length, "SOURCE_INVENTORY_MISMATCH", context);
  for (const source of item.fixtureSources) {
    const name = source.sourceFile ?? source.file;
    demand(!mapped.has(name), "DUPLICATE_SOURCE_MAPPING", `${context}: ${name}`);
    mapped.add(name);
    const matches = sources.filter((entry) => entry.file === name);
    demand(matches.length === 1, "SOURCE_MAPPING_MISMATCH", `${context}: ${name}`);
    sameDigest(matches[0], { ...source, file: name }, `${context}: ${name}`);
  }
  for (const tool of manifest.tools) {
    const direct = receipt.tools?.filter((entry) => entry.name === tool.name) ?? [];
    const version = direct[0]?.version ?? receipt.versions?.[tool.name];
    const executable = direct[0]?.executable ?? receipt.versions?.[`${tool.name}Executable`] ?? receipt.versions?.[`${tool.name}Module`];
    demand(direct.length <= 1 && version === tool.version && executable === tool.executable, "TOOL_PROVENANCE_MISMATCH", `${context}: ${tool.name}`);
  }
  return facts;
}

/** Root is fixtures/utility, not a historical producer cwd. Reads only family-local plain artifacts. */
export async function readUtilityCorpus(root) {
  root = path.resolve(root);
  // Check every ancestor before canonicalizing: even an ancestor symlink is an alias.
  for (let dir = root; ; dir = path.dirname(dir)) {
    demand(!(await lstat(dir)).isSymbolicLink(), "SYMLINK", dir);
    if (dir === path.dirname(dir)) break;
  }
  const children = await readdir(root);
  demand(children.length > 0, "EMPTY_CORPUS", root);
  demand(children.every((family) => Object.hasOwn(FAMILIES, family)), "UNKNOWN_FAMILY", root);
  const ids = new Set(), families = [], cases = [];
  for (const [family, profiles] of Object.entries(FAMILIES)) {
    demand(children.includes(family), "MISSING_FAMILY", family);
    const files = await inventory(path.join(root, family)), used = new Set(["manifest.json", "SOURCES.md"]);
    demand(files.has("manifest.json"), "MISSING_MANIFEST", family);
    demand(files.has("SOURCES.md") && files.get("SOURCES.md").length > 0, "MISSING_SOURCES_NOTE", family);
    decode(files.get("SOURCES.md"), `${family}: SOURCES.md`);
    const manifest = json(files.get("manifest.json"), `${family}: manifest.json`);
    keys(manifest, ["schema", "family", "tools", "producer", "cases"], [], family);
    demand(manifest.schema === SCHEMA && manifest.family === family, "INVALID_SCHEMA_OR_FAMILY", family);
    tools(manifest.tools, family);
    keys(manifest.producer, ["script", "sourceSHA256"], [], family);
    safe(manifest.producer.script, family);
    demand(digest(manifest.producer.sourceSHA256), "INVALID_PRODUCER_DIGEST", family);
    const rows = [];
    for (const item of list(manifest.cases, `${family}: cases`)) {
      keys(item, ["id", "profile", "command", "role", "expectedStatus", "exitCode", "complete", "signal", "timedOut",
        "capture", "fixtureSources", "original", "stdout", "stderr", "expected", "required", "material"], [], family);
      const context = `${family}/${item.id}`;
      demand(nonempty(item.id) && !ids.has(item.id), "DUPLICATE_OR_INVALID_ID", context);
      ids.add(item.id);
      demand(profiles.includes(item.profile) && nonempty(item.command), "INVALID_PROFILE_OR_COMMAND", context);
      demand(["noise", "exact"].includes(item.role) && item.expectedStatus === (item.role === "noise" ? "reduced" : "passthrough"), "INVALID_EXPECTED_STATUS", context);
      demand((item.exitCode === null || (Number.isSafeInteger(item.exitCode) && item.exitCode >= 0))
        && typeof item.complete === "boolean" && typeof item.timedOut === "boolean"
        && (item.signal === null || nonempty(item.signal)) && typeof item.material === "boolean", "INVALID_CASE_FACTS", context);
      const local = new Set();
      for (const key of ["capture", "original", "stdout", "stderr", "expected"]) {
        descriptor(item[key], `${context}: ${key}`);
        demand(!local.has(item[key].file), "DUPLICATE_ARTIFACT_PATH", context);
        local.add(item[key].file);
      }
      const texts = {};
      for (const key of ["original", "stdout", "stderr", "expected"]) texts[key] = artifact(files, used, item[key], `${context}: ${key}`);
      demand(nonempty(texts.original) && nonempty(texts.expected), "EMPTY_CASE_OUTPUT", context);
      demand(item.original.bytes === item.stdout.bytes + item.stderr.bytes, "STREAM_LENGTH_MISMATCH", context);
      for (const source of list(item.fixtureSources, `${context}: fixtureSources`)) {
        demand(!local.has(source.file), "DUPLICATE_ARTIFACT_PATH", context);
        local.add(source.file);
        artifact(files, used, source, `${context}: fixtureSources`, true);
      }
      const receipt = json(Buffer.from(artifact(files, used, item.capture, `${context}: capture`)), `${context}: receipt`);
      const facts = receiptCheck(receipt, item, manifest, context);
      if (receipt.producer.snapshot) {
        const snapshot = receipt.producer.snapshot;
        sameDigest(snapshot, { ...snapshot, sha256: manifest.producer.sourceSHA256 }, `${context}: producer snapshot`);
        artifact(files, used, snapshot, `${context}: producer snapshot`, true);
      }
      if (files.has("producer-source.mjs")) {
        demand(hash(files.get("producer-source.mjs")) === manifest.producer.sourceSHA256, "PRODUCER_SNAPSHOT_MISMATCH", family);
        decode(files.get("producer-source.mjs"), `${family}: producer-source.mjs`);
        used.add("producer-source.mjs");
      }
      const saved = item.original.bytes - item.expected.bytes;
      demand(item.material === (saved >= 1024 && saved >= item.original.bytes * 0.1), "MATERIAL_FLAG_MISMATCH", context);
      demand(item.role === "exact" ? texts.expected === texts.original : saved > 0
        && item.exitCode === 0 && item.complete && !item.timedOut && item.signal === null, "ROLE_OUTPUT_MISMATCH", context);
      const required = anchors(texts.original, texts.expected, item.required, context);
      const observation = { source: "shell", command: item.command, output: texts.original, presentation: "unknown",
        completeness: facts.complete ? "complete" : "unknown",
        termination: facts.timedOut ? { kind: "timed_out" } : Number.isSafeInteger(facts.exitCode) && facts.signal === null
          ? { kind: "exited", code: facts.exitCode } : { kind: "unknown" } };
      const row = { ...item, family, originalText: texts.original, expectedText: texts.expected, required, observation };
      rows.push(row); cases.push(row);
    }
    demand(rows.some((row) => row.role === "noise") && rows.some((row) => row.role === "exact"), "MISSING_NOISE_OR_EXACT", family);
    demand(rows.some((row) => row.material), "MISSING_MATERIAL_CASE", family);
    demand(rows.some((row) => row.profile === profiles[0]), "MISSING_FAMILY_PROFILE", family);
    for (const file of files.keys()) demand(used.has(file), "UNMAPPED_ARTIFACT", `${family}: ${file}`);
    families.push({ family, tools: manifest.tools, producer: manifest.producer, cases: rows });
  }
  return { schema: SCHEMA, root, families, cases };
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
      inputBytes: item.original.bytes, expectedBytes: item.expected.bytes, savedBytes: item.original.bytes - item.expected.bytes,
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
