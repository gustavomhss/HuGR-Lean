#!/usr/bin/env node
/** Native OpenCode proof. Local SSE mock supplies commands, never command output. */
import { access, constants, cp, mkdir, mkdtemp, readFile, readdir, realpath, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { cpus, homedir, loadavg, release, tmpdir, totalmem } from "node:os";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isolatedEnvironment, runProcess, runScenario } from "../opencode-boundary.mjs";

const SOURCE = "69607794cbb2a3ce6707a509777ac648aa859bdd";
const HOST_VERSION = "1.18.17";
const OPTIONS = { enabled: true, raw: false };
const TOOL_TIMEOUT = 30000;
const issuedArguments = (command) => ({ command, description: "Local deterministic boundary probe", timeout: TOOL_TIMEOUT });
const STAGED = "host-staged-café.txt", UNTRACKED = "host-untracked-🔥.txt";
const MISSING_REF = "missing-HuGR-real-host-ref";
const GIT_HINTS = new Set([
  '  (use "git restore --staged <file>..." to unstage)',
  '  (use "git add <file>..." to update what will be committed)',
  '  (use "git restore <file>..." to discard changes in working directory)',
  '  (use "git add <file>..." to include in what will be committed)',
]);

function requireFact(value, code, detail = "") {
  if (!value) throw Object.assign(new Error(`${code}${detail ? `: ${detail}` : ""}`), { code });
}
const bytes = (text) => Buffer.byteLength(text, "utf8");
const digest = (text) => createHash("sha256").update(text).digest("hex");
const json = async (file, value) => writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
const equal = (a, b, code) => requireFact(isDeepStrictEqual(a, b), code);
const rowsOf = (text) => (text.endsWith("\n") ? text.slice(0, -1) : text).split("\n");
const guide = `# Native host artifacts

Reproduce: build this package, then run \`node scripts/real-world/host.mjs NEW_OUTPUT_DIR\`.
The default installs the pinned SDK in a fresh isolated directory with a 45-second bound.
Set HUGR_SMOKE_DEPS to reuse an isolated SDK tree; the selected source and lock hash are recorded.
OpenCode uses only the local HTTP/SSE model mock, isolated HOME/XDG/config, and the compiled file plugin.
OPENCODE_EXPERIMENTAL_DISABLE_FILEWATCHER=1 disables background watching (https://opencode.ai/docs/cli/).
report.json records Node/npm/native tool versions and resolved paths, source provenance, OS/load and failures.
Each observer.jsonl persists the original after-hook boundary BEFORE calling the real compiled hook.
original.txt/model.txt and host-result.json retain that same execution and its second-request model result.
All native metadata fields are recorded separately before/after and at the completed host event.
The full issued arguments, observer arguments and completed native input are compared and recorded.
rawBytes/modelBytes/savedBytes are UTF-8 boundary bytes. Upstream-truncated output remains exact;
native-full.txt records the full native stress output separately. The stress and Cargo fixture are controls.
Scenario elapsedMs is host-session wall time (startup, mock, native command, hook); setupMs is preparation.
The top-level report.elapsedMs is total suite wall time including setup.
hookElapsedMs measures the hook call, excluding sidecar writes. CPU isolation is not controlled.
Missing tools, requests, observers, evidence or unexpected exits leave named failures and retained roots.
`;

/** Write original boundary before invoking the compiled plugin; no core replay or replacement fixture. */
export function observerPlugin(plugin, sidecar) {
  return `import plugin from ${JSON.stringify(pathToFileURL(path.resolve(plugin)).href)};
import { appendFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const plain = value => JSON.parse(JSON.stringify(value));
const save = value => appendFile(${JSON.stringify(sidecar)}, JSON.stringify(value) + "\\n");
export default async (context, options) => {
  const hooks = await plugin(context, options);
  const hook = hooks["tool.execute.after"];
  await save({ kind: "loaded", options: plain(options), hookPresent: typeof hook === "function" });
  return { "tool.execute.after": async (input, output) => {
    if (input.tool !== "bash") return;
    const original = output.output;
    await save({ kind: "before", input: plain(input), boundary: plain(output),
      originalSha256: createHash("sha256").update(original).digest("hex") });
    const start = performance.now();
    await hook(input, output);
    const hookElapsedMs = performance.now() - start;
    await save({ kind: "after", input: plain(input), boundary: plain(output), hookElapsedMs });
  } };
};
`;
}

export const HOST_SCENARIOS = Object.freeze([
  { id: "git-status", command: "git status", oracle: "git", category: "control", expectExit: 0 },
  { id: "rg-source", command: "rg -n 'readonly' src", oracle: "rg", category: "primary", expectExit: 0 },
  { id: "git-diff", command: "git diff -- README.md", oracle: "exact", category: "primary", expectExit: 0 },
  { id: "cargo-native", command: "cargo test", oracle: "cargo", category: "control", expectExit: 0, nativeCwd: true },
  { id: "unknown-read", command: "cat README.md", oracle: "exact", category: "primary", expectExit: 0 },
  { id: "git-failed", command: `git show ${MISSING_REF}`, oracle: "failure", category: "control", expectExit: 128 },
  { id: "host-truncated", command: "git status --untracked-files=all", oracle: "truncated", category: "control", expectExit: 0 },
]);

/** Whole-block native Cargo grammar, independent of the production parser and renderer. */
function cargoEvidence(original) {
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]|\r(?!\n)/u.test(original)) return undefined;
  const n = "(?:0|[1-9]\\d*)", eol = "\\r?\\n";
  const block = new RegExp([
    `^(?:   Compiling [A-Za-z0-9_-]+ v\\d+\\.\\d+\\.\\d+(?:-[A-Za-z0-9.-]+)?(?: \\([^()\\r\\n]+\\))?${eol})*`,
    `(?<finished>    Finished \`test\` profile \\[unoptimized \\+ debuginfo\\] target\\(s\\) in \\d+(?:\\.\\d+)?s${eol})`,
    `(?<runner>     Running (?:unittests [^\\s()]+\\.rs|tests/[^\\s()]+\\.rs) \\(target/debug/deps/[^\\s()]+\\)${eol})`,
    `(?:${eol})*running (?<total>${n}) (?<noun>tests?)${eol}(?<tests>(?:test [^\\r\\n]+${eol})*)(?:${eol})*`,
    `(?<summary>test result: ok\\. (?<passed>${n}) passed; 0 failed; (?<ignored>${n}) ignored; 0 measured; (?<filtered>${n}) filtered out; finished in \\d+(?:\\.\\d+)?s${eol})(?:${eol})*$`,
  ].join(""), "u").exec(original);
  if (!block || block[0].length !== original.length) return undefined;
  const fields = block.groups, counts = [fields.total, fields.passed, fields.ignored, fields.filtered].map(Number);
  if (!counts.every(Number.isSafeInteger) || fields.noun !== (counts[0] === 1 ? "test" : "tests")) return undefined;
  const name = "[\\p{L}_][\\p{L}\\p{N}_]*(?:::[\\p{L}_][\\p{L}\\p{N}_]*)*";
  const rowPattern = new RegExp(`^test (${name}) \\.\\.\\. (ok|ignored(?:, [^\\r\\n]+)?)${eol}$`, "u");
  const testRows = fields.tests.match(/[^\n]*\n/gu) ?? [], records = testRows.map((row) => rowPattern.exec(row));
  if (records.some((row) => !row) || records.length !== counts[0] || new Set(records.map((row) => row[1])).size !== counts[0]) return undefined;
  const passed = records.filter((row) => row[2] === "ok").length;
  if (passed !== counts[1] || records.length - passed !== counts[2]) return undefined;
  return [fields.finished, fields.runner, ...testRows.filter((_, i) => records[i][2] !== "ok"), fields.summary];
}

/** Independent evidence oracle; fake-host unit specimens do not establish native compatibility. */
export function verifyHostScenario(scenario, result, rows) {
  requireFact(["git", "rg", "cargo", "exact", "failure", "truncated"].includes(scenario.oracle), "REAL_HOST_UNKNOWN_ORACLE");
  requireFact(Array.isArray(rows) && rows.length > 0, "REAL_HOST_OBSERVER_MISSING");
  const loaded = rows.filter((row) => row.kind === "loaded");
  const befores = rows.filter((row) => row.kind === "before");
  const afters = rows.filter((row) => row.kind === "after");
  requireFact(loaded.length === 1 && loaded[0].hookPresent === true, "REAL_HOST_PLUGIN_HOOK_MISSING");
  equal(loaded[0].options, OPTIONS, "REAL_HOST_OPTIONS_MISMATCH");
  requireFact(befores.length === 1 && afters.length === 1, "REAL_HOST_OBSERVER_ROUNDTRIP_MISSING");
  requireFact(rows.indexOf(loaded[0]) < rows.indexOf(befores[0]) && rows.indexOf(befores[0]) < rows.indexOf(afters[0]), "REAL_HOST_OBSERVER_ORDER_INVALID");
  const before = befores[0], after = afters[0];
  const original = before.boundary?.output, model = result.modelResult?.content;
  requireFact(typeof original === "string" && original.length > 0, "REAL_HOST_ORIGINAL_MISSING");
  requireFact(digest(original) === before.originalSha256, "REAL_HOST_ORIGINAL_MISMATCH");
  requireFact(result.requests === 2 && typeof model === "string", "REAL_HOST_SECOND_REQUEST_MISSING");
  equal(model, result.tool?.state?.output, "REAL_HOST_MODEL_EVENT_MISMATCH");
  equal(model, after.boundary?.output, "REAL_HOST_MODEL_OBSERVER_MISMATCH");
  equal(result.command, scenario.command, "REAL_HOST_COMMAND_CHANGED");
  for (const input of [before.input, after.input, result.tool?.state?.input]) equal(input?.args?.command ?? input?.command, scenario.command, "REAL_HOST_COMMAND_CHANGED");
  const issuedArgs = scenario.expectedArgs ?? issuedArguments(scenario.command);
  for (const args of [before.input?.args, after.input?.args, result.tool?.state?.input]) equal(args, issuedArgs, "REAL_HOST_ARGUMENTS_CHANGED");
  equal(before.input, after.input, "REAL_HOST_HOOK_INPUT_CHANGED");
  equal(before.input.callID, result.tool.callID, "REAL_HOST_CALL_ID_MISMATCH");
  requireFact(result.tool.state.status === "completed", "REAL_HOST_TOOL_NOT_COMPLETED");
  const metadata = before.boundary.metadata;
  requireFact(metadata && typeof metadata.output === "string" && metadata.output.length > 0 && typeof metadata.truncated === "boolean", "REAL_HOST_NATIVE_METADATA_MISSING");
  equal(metadata, after.boundary.metadata, "REAL_HOST_METADATA_CHANGED");
  equal(metadata, result.tool.state.metadata, "REAL_HOST_EXIT_METADATA_MISMATCH");
  equal(metadata.exit, scenario.expectExit, "REAL_HOST_UNEXPECTED_EXIT");
  // 1.18.17 retains a separate native preview: prefix for short output, ellipsis + tail for stress.
  const tailPreview = metadata.truncated && metadata.output.startsWith("...\n\n") ? metadata.output.slice(5) : undefined;
  requireFact(original.startsWith(metadata.output) || (tailPreview?.length > 0 && original.endsWith(tailPreview)), "REAL_HOST_ORIGINAL_NATIVE_MISMATCH");
  const { output: ignoredBefore, ...otherBefore } = before.boundary;
  const { output: ignoredAfter, ...otherAfter } = after.boundary;
  requireFact([before.boundary, after.boundary, result.tool.state].every((boundary) => Object.hasOwn(boundary, "title") && typeof boundary.title === "string"), "REAL_HOST_TITLE_MISSING");
  equal(otherBefore, otherAfter, "REAL_HOST_NONOUTPUT_CHANGED");
  equal(before.boundary.title, result.tool.state.title, "REAL_HOST_TITLE_CHANGED");
  requireFact(Number.isFinite(after.hookElapsedMs) && after.hookElapsedMs >= 0, "REAL_HOST_HOOK_TIMING_MISSING");
  requireFact(bytes(model) <= bytes(original), "REAL_HOST_OUTPUT_EXPANDED");
  requireFact(metadata.truncated === (scenario.oracle === "truncated"), "REAL_HOST_TRUNCATION_MISMATCH");
  let required = [], cargoGrammarAdmitted;
  if (scenario.oracle === "git") {
    requireFact(original.startsWith("On branch host-native\n") && ["Changes to be committed:", "Changes not staged for commit:", "Untracked files:", STAGED, "README.md", UNTRACKED].every((text) => original.includes(text)), "REAL_HOST_KNOWN_GIT_CONTROL_MISSING");
    requireFact([...GIT_HINTS].every((hint) => original.split("\n").includes(hint)), "REAL_HOST_GIT_HINTS_MISSING");
    required = original.split("\n").filter((line) => !GIT_HINTS.has(line));
    requireFact(bytes(model) < bytes(original), "REAL_HOST_KNOWN_GIT_NOT_REDUCED");
    equal(model, required.join("\n"), "REAL_HOST_GIT_EVIDENCE_LOST");
  } else if (scenario.oracle === "rg") {
    const records = rowsOf(original).map((line) => /^([^:]+):([1-9]\d*):(.*)$/u.exec(line));
    requireFact(records.length > 1 && records.every(Boolean), "REAL_HOST_RG_CONTROL_MISSING");
    equal(model.endsWith("\n"), original.endsWith("\n"), "REAL_HOST_RG_EVIDENCE_LOST");
    let groupedPath, groupConsumed = false;
    const finishGroup = () => requireFact(groupedPath === undefined || groupConsumed, "REAL_HOST_RG_EVIDENCE_LOST");
    const recovered = [];
    for (const line of rowsOf(model)) {
      const full = /^([^:]+):([1-9]\d*):(.*)$/u.exec(line);
      if (full) { finishGroup(); recovered.push([full[1], full[2], full[3]]); groupedPath = undefined; }
      else if (/^[^:]+:$/u.test(line)) { finishGroup(); groupedPath = line.slice(0, -1); groupConsumed = false; }
      else {
        const entry = /^([1-9]\d*):(.*)$/u.exec(line);
        requireFact(groupedPath && entry, "REAL_HOST_RG_EVIDENCE_LOST");
        recovered.push([groupedPath, entry[1], entry[2]]);
        groupConsumed = true;
      }
    }
    finishGroup();
    required = records.map((record) => record.slice(1));
    equal(recovered, required, "REAL_HOST_RG_EVIDENCE_LOST");
  } else if (scenario.oracle === "cargo") {
    const evidence = cargoEvidence(original);
    cargoGrammarAdmitted = evidence !== undefined;
    required = evidence ?? [original];
    // Unsupported rows, diagnostics, counts or reporters require the entire original, not summaries.
    if (!cargoGrammarAdmitted) equal(model, original, "REAL_HOST_CARGO_UNKNOWN_CHANGED");
    else if (model !== original) equal(model, evidence.join(""), "REAL_HOST_CARGO_EVIDENCE_LOST");
  } else {
    equal(model, original, "REAL_HOST_EXACT_OUTPUT_CHANGED");
    if (scenario.oracle === "failure") requireFact(original.includes(MISSING_REF) && original.includes("fatal:"), "REAL_HOST_NATIVE_FAILURE_MISSING");
    if (scenario.oracle === "truncated") requireFact(typeof metadata.outputPath === "string" && original.includes(metadata.outputPath), "REAL_HOST_TRUNCATION_PATH_MISSING");
  }
  return {
    rawBytes: bytes(original), modelBytes: bytes(model), savedBytes: bytes(original) - bytes(model),
    metadataExact: true, evidenceOK: true, hookElapsedMs: after.hookElapsedMs,
    metadataBefore: metadata, metadataAfter: after.boundary.metadata, nativeMetadata: result.tool.state.metadata,
    metadataFields: Object.keys(metadata).sort(), presentation: "unknown", requiredEvidence: required,
    cargoGrammarAdmitted, issuedArgs, observerArgsBefore: before.input.args, observerArgsAfter: after.input.args,
    nativeInput: result.tool.state.input, requests: result.requests,
    observation: { source: "shell", command: scenario.command, output: original, presentation: "unknown",
      completeness: metadata.truncated ? "truncated" : "complete", termination: { kind: "exited", code: metadata.exit } },
    note: scenario.oracle === "truncated" ? "host limit: native output truncated upstream; exact boundary preserved, zero savings" : undefined,
  };
}

export async function runObservedScenario({ scenario, plugin, outputDir, setup, ...options }) {
  const directory = path.join(outputDir, scenario.id);
  await mkdir(directory, { recursive: true });
  requireFact((await readdir(directory)).length === 0, "REAL_HOST_SCENARIO_DIR_NOT_EMPTY", directory);
  const sidecar = path.join(directory, "observer.jsonl"), wrapper = path.join(directory, "observer.mjs");
  // Empty directory prevents stale sidecars from satisfying an absent observer.
  await writeFile(sidecar, "");
  await writeFile(wrapper, observerPlugin(plugin, sidecar));
  const began = performance.now(), loadBefore = loadavg();
  let started, setupMs, setupEvidence, isolatedRoot;
  try {
    const result = await runScenario({ ...options, plugin: wrapper, pluginOptions: OPTIONS, command: scenario.command, toolTimeout: TOOL_TIMEOUT, timeout: 45000, keep: true,
      setup: async (context) => { isolatedRoot = context.root; if (setup) setupEvidence = await setup(context); started = performance.now(); setupMs = started - began; } });
    const elapsedMs = performance.now() - started;
    await writeFile(path.join(directory, "host.stdout.jsonl"), result.stdout);
    await writeFile(path.join(directory, "host.stderr.txt"), result.stderr);
    await json(path.join(directory, "host-result.json"), result);
    const rawRows = await readFile(sidecar, "utf8").catch((error) => { throw Object.assign(new Error(`REAL_HOST_OBSERVER_SIDECAR_MISSING: ${error.message}`), { code: "REAL_HOST_OBSERVER_SIDECAR_MISSING" }); });
    requireFact(rawRows.trim().length > 0, "REAL_HOST_OBSERVER_MISSING", sidecar);
    let rows;
    try { rows = rawRows.trim().split("\n").map((line) => JSON.parse(line)); }
    catch (error) { throw Object.assign(new Error(`REAL_HOST_OBSERVER_INVALID: ${error.message}`), { code: "REAL_HOST_OBSERVER_INVALID" }); }
    const original = rows.find((row) => row.kind === "before")?.boundary?.output;
    if (typeof original === "string") await writeFile(path.join(directory, "original.txt"), original);
    await writeFile(path.join(directory, "model.txt"), result.modelResult.content);
    if (typeof setupEvidence?.expectedOriginal === "string") equal(original, setupEvidence.expectedOriginal, "REAL_HOST_ORIGINAL_SOURCE_MISMATCH");
    if (scenario.id === "git-diff") requireFact(original?.startsWith("diff --git a/README.md b/README.md\n") && original.includes("+Native host diff evidence café 🔥.\n"), "REAL_HOST_NATIVE_DIFF_MISSING");
    const facts = verifyHostScenario(scenario, result, rows);
    let nativeFullBytes;
    if (scenario.oracle === "truncated") {
      const stored = await realpath(facts.metadataBefore.outputPath).catch((error) => { throw Object.assign(new Error(`REAL_HOST_NATIVE_FULL_OUTPUT_MISSING: ${error.message}`), { code: "REAL_HOST_NATIVE_FULL_OUTPUT_MISSING" }); });
      const relative = path.relative(await realpath(result.root), stored);
      requireFact(relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative), "REAL_HOST_NATIVE_OUTPUT_PATH_OUTSIDE_ISOLATION");
      const full = await readFile(stored);
      await writeFile(path.join(directory, "native-full.txt"), full);
      nativeFullBytes = full.length;
      requireFact(nativeFullBytes > 51200, "REAL_HOST_STRESS_TOO_SMALL");
      requireFact(full.includes(Buffer.from("host-stress-")), "REAL_HOST_STRESS_NATIVE_ENTRIES_MISSING");
      const prefix = `...output truncated...\n\nFull output saved to: ${facts.metadataBefore.outputPath}\n\n`;
      requireFact(original.startsWith(prefix) && full.toString("utf8").endsWith(original.slice(prefix.length)), "REAL_HOST_NATIVE_TRUNCATION_MISMATCH");
    }
    const record = { ...scenario, ...facts, elapsedMs, setupMs, nativeFullBytes, loadBefore, loadAfter: loadavg(), isolatedRoot: result.root, artifacts: directory, pluginOptions: OPTIONS, setupEvidence };
    await json(path.join(directory, "record.json"), record);
    return record;
  } catch (error) {
    const diagnostics = error.diagnostics;
    if (diagnostics) {
      isolatedRoot = diagnostics.root ?? isolatedRoot;
      if (typeof diagnostics.stdout === "string") await writeFile(path.join(directory, "host.stdout.jsonl"), diagnostics.stdout);
      if (typeof diagnostics.stderr === "string") await writeFile(path.join(directory, "host.stderr.txt"), diagnostics.stderr);
      await json(path.join(directory, "host-result.json"), { status: "failed", ...diagnostics });
    }
    if (!error.code?.startsWith("REAL_HOST_")) {
      const message = error.message;
      error.code = message.includes("second-request tool result") ? "REAL_HOST_SECOND_REQUEST_MISSING"
        : message.includes("Cannot execute") ? "REAL_HOST_MISSING_HOST"
        : message.includes("OpenCode timeout") ? "REAL_HOST_TIMEOUT"
        : message.includes("Host changed the native command") ? "REAL_HOST_COMMAND_CHANGED"
        : message.includes("exact completed tool result") ? "REAL_HOST_MODEL_EVENT_MISMATCH"
        : "REAL_HOST_NATIVE_ROUNDTRIP_FAILED";
    }
    await json(path.join(directory, "failure.json"), { status: "failed", name: error.code ?? "REAL_HOST_SCENARIO_FAILED", message: error.message, diagnostics, elapsedMs: performance.now() - began, artifacts: directory, isolatedRoot, loadBefore, loadAfter: loadavg() });
    throw Object.assign(new Error(`${error.code}: ${error.message}`, { cause: error }), { code: error.code, diagnostics });
  }
}

async function checked(binary, args, context, name) {
  let result;
  try { result = await runProcess(binary, args, { cwd: context.cwd, env: context.env, timeout: 45000 }); }
  catch (error) {
    const code = error.message.includes("OpenCode timeout") ? `${name}_TIMEOUT` : name;
    throw Object.assign(new Error(`${code}: ${error.message}`), { code });
  }
  requireFact(result.code === 0, name, JSON.stringify(result));
  return result;
}

export async function resolvedTool(binary, { cwd, env }) {
  const names = process.platform === "win32" && !path.extname(binary) ? [binary, ...(env.PATHEXT ?? ".EXE;.CMD;.BAT").split(";").map((ext) => binary + ext)] : [binary];
  const directories = /[/\\]/u.test(binary) ? [""] : (env.PATH ?? "").split(path.delimiter);
  for (const directory of directories) for (const name of names) {
    const candidate = path.resolve(cwd, directory, name);
    try { if ((await stat(candidate)).isFile()) { await access(candidate, constants.X_OK); return await realpath(candidate); } }
    catch (error) { if (!["ENOENT", "ENOTDIR", "EACCES"].includes(error.code)) throw error; }
  }
  requireFact(false, "REAL_HOST_TOOL_PATH_MISSING", binary);
}

async function provision(repoRoot, root, env) {
  const cwd = path.join(root, "pinned-hugr");
  await mkdir(cwd);
  const context = { cwd, env };
  const revision = await checked("git", ["rev-parse", "--verify", `${SOURCE}^{commit}`], { cwd: repoRoot, env }, "REAL_HOST_PIN_MISSING");
  equal(revision.stdout.trim(), SOURCE, "REAL_HOST_PIN_MISMATCH");
  const archive = path.join(root, "pinned-hugr.tar");
  await checked("git", ["archive", "--format=tar", `--output=${archive}`, SOURCE], { cwd: repoRoot, env }, "REAL_HOST_PROJECT_ARCHIVE_FAILED");
  await checked("tar", ["-xf", archive, "-C", cwd], { cwd: root, env }, "REAL_HOST_PROJECT_EXTRACT_FAILED");
  await checked("git", ["init", "--quiet", "-b", "host-native"], context, "REAL_HOST_PROJECT_INIT_FAILED");
  const files = (await checked("git", ["ls-tree", "-r", "--name-only", "-z", SOURCE], { cwd: repoRoot, env }, "REAL_HOST_PIN_FILES_MISSING")).stdout.split("\0").filter(Boolean);
  requireFact(files.length > 0, "REAL_HOST_PIN_FILES_EMPTY");
  await checked("git", ["add", "-f", "--", ...files], context, "REAL_HOST_PIN_STAGE_FAILED");
  const commitEnv = { ...env, GIT_AUTHOR_NAME: "HuGR Native Host", GIT_AUTHOR_EMAIL: "native-host@example.invalid", GIT_COMMITTER_NAME: "HuGR Native Host", GIT_COMMITTER_EMAIL: "native-host@example.invalid", GIT_AUTHOR_DATE: "2000-01-01T00:00:00Z", GIT_COMMITTER_DATE: "2000-01-01T00:00:00Z" };
  await checked("git", ["commit", "--quiet", "-m", "Create the pinned native host snapshot"], { cwd, env: commitEnv }, "REAL_HOST_PIN_COMMIT_FAILED");
  const sourceTree = (await checked("git", ["rev-parse", `${SOURCE}^{tree}`], { cwd: repoRoot, env }, "REAL_HOST_PIN_TREE_MISSING")).stdout.trim();
  equal((await checked("git", ["rev-parse", "HEAD^{tree}"], context, "REAL_HOST_SNAPSHOT_TREE_MISSING")).stdout.trim(), sourceTree, "REAL_HOST_SNAPSHOT_TREE_MISMATCH");
  const snapshotCommit = (await checked("git", ["rev-parse", "HEAD"], context, "REAL_HOST_SNAPSHOT_COMMIT_MISSING")).stdout.trim();
  const license = await readFile(path.join(cwd, "LICENSE"), "utf8");
  requireFact(license.includes("MIT License"), "REAL_HOST_PIN_LICENSE_MISMATCH");
  await writeFile(path.join(cwd, "README.md"), `${await readFile(path.join(cwd, "README.md"), "utf8")}\nNative host diff evidence café 🔥.\n`);
  await writeFile(path.join(cwd, STAGED), "native staged Unicode path\n");
  await checked("git", ["add", "--", STAGED], context, "REAL_HOST_GIT_STAGE_FAILED");
  await writeFile(path.join(cwd, UNTRACKED), "native untracked Unicode path\n");
  return { cwd, repository: "https://github.com/gmhelmold/HuGR-Lean", commit: SOURCE, sourceTree, snapshotCommit, license: "MIT", licenseSha256: digest(license),
    modifications: ["append README.md diff evidence", `stage ${STAGED}`, `create untracked ${UNTRACKED}`],
    cargo: { category: "control", source: "fixtures/runners/native", note: "Own committed native runner fixture, not external upstream coverage" } };
}

/** Frozen public API. All host sessions retained; setup failures stay red and retain diagnostics. */
export async function runRealHost({ repoRoot = fileURLToPath(new URL("../../", import.meta.url)), outputDir, dependencies, binary = process.env.OPENCODE_BIN ?? "opencode" } = {}) {
  requireFact(typeof outputDir === "string" && outputDir.length > 0, "REAL_HOST_OUTPUT_DIR_MISSING");
  repoRoot = path.resolve(repoRoot); outputDir = path.resolve(outputDir);
  await mkdir(outputDir, { recursive: true });
  requireFact((await readdir(outputDir)).length === 0, "REAL_HOST_OUTPUT_DIR_NOT_EMPTY", outputDir);
  await writeFile(path.join(outputDir, "README.md"), guide);
  const root = await mkdtemp(path.join(tmpdir(), "hugr-real-host-"));
  const gitEnv = { GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_COUNT: "3", GIT_CONFIG_KEY_0: "core.quotePath", GIT_CONFIG_VALUE_0: "false", GIT_CONFIG_KEY_1: "color.ui", GIT_CONFIG_VALUE_1: "false", GIT_CONFIG_KEY_2: "advice.statusHints", GIT_CONFIG_VALUE_2: "true", GIT_TERMINAL_PROMPT: "0" };
  const hostFlags = { OPENCODE_EXPERIMENTAL_DISABLE_FILEWATCHER: "1" };
  const env = isolatedEnvironment(root, { ...gitEnv, ...hostFlags }), context = { cwd: root, env };
  await Promise.all([env.HOME, env.XDG_CONFIG_HOME, env.XDG_DATA_HOME, env.XDG_CACHE_HOME, env.XDG_STATE_HOME, env.OPENCODE_CONFIG_DIR].map((dir) => mkdir(dir, { recursive: true })));
  const started = performance.now();
  const report = { status: "running", version: null, platform: process.platform, scenarios: [], failures: [], outputDir, setupRoot: root, binary, hostFlags, gitEnvironment: gitEnv,
    environment: { arch: process.arch, osRelease: release(), cpus: cpus().length, cpuModel: cpus()[0]?.model, totalMemoryBytes: totalmem(), loadBefore: loadavg(), isolatedCPU: false }, bootstrap: { mode: dependencies ? "isolated-sdk-copy" : "fresh-npm-install", dependencies: dependencies ?? null } };
  try {
    const version = await checked(binary, ["--version"], context, "REAL_HOST_MISSING_HOST");
    report.version = version.stdout.trim();
    equal(report.version, HOST_VERSION, "REAL_HOST_UNSUPPORTED_HOST_VERSION");
    report.versions = { node: process.version };
    report.resolvedTools = { node: await realpath(process.execPath), opencode: await resolvedTool(binary, context) };
    // Select installed stable toolchain artifacts directly; never load user's rustup/Cargo config.
    const toolchains = path.join(process.env.RUSTUP_HOME ?? path.join(homedir(), ".rustup"), "toolchains");
    const stable = (await readdir(toolchains).catch((error) => { if (error.code === "ENOENT") return []; throw error; })).sort().find((name) => name.startsWith("stable-"));
    if (stable) {
      report.environment.nativeToolchain = path.join(toolchains, stable, "bin");
      env.PATH = `${report.environment.nativeToolchain}${path.delimiter}${env.PATH}`;
    }
    const plugin = path.join(repoRoot, "dist/index.js");
    requireFact((await stat(plugin).catch(() => undefined))?.isFile(), "REAL_HOST_COMPILED_PLUGIN_MISSING", plugin);
    report.plugin = { path: plugin, compiled: [] };
    for (const file of ["index.js", "opencode/index.js", "core/engine.js", "profiles/formats.js", "profiles/runners.js"]) report.plugin.compiled.push({ path: `dist/${file}`, sha256: digest(await readFile(path.join(repoRoot, "dist", file))) });
    report.tools = {};
    for (const [tool, args] of [["git", ["--version"]], ["rg", ["--version"]], ["cargo", ["--version"]], ["rustc", ["--version"]], ["tar", ["--version"]], ["cat", []], ["npm", ["--version"]]]) {
      const result = await checked(tool, args, context, `REAL_HOST_MISSING_TOOL_${tool.toUpperCase()}`);
      report.tools[tool] = result.stdout.trim();
      report.resolvedTools[tool] = await resolvedTool(tool, context);
    }
    report.versions.npm = report.tools.npm;
    if (!dependencies) {
      await json(path.join(env.OPENCODE_CONFIG_DIR, "package.json"), { private: true });
      const npmStarted = performance.now();
      let installation;
      try {
        installation = await checked("npm", ["install", "--legacy-peer-deps", "--ignore-scripts", "--no-audit", "--no-fund", "--save-exact", `@opencode-ai/plugin@${HOST_VERSION}`], { cwd: env.OPENCODE_CONFIG_DIR, env }, "REAL_HOST_SDK_BOOTSTRAP_FAILED");
      } catch (error) {
        await json(path.join(outputDir, "sdk-install.json"), { status: "failed", message: error.message, retainedRoot: root });
        throw error;
      } finally { report.bootstrap.elapsedMs = performance.now() - npmStarted; }
      await json(path.join(outputDir, "sdk-install.json"), installation);
      dependencies = env.OPENCODE_CONFIG_DIR;
    }
    report.bootstrap.retainedSdk = path.resolve(dependencies);
    const sdkManifest = JSON.parse(await readFile(path.join(dependencies, "node_modules/@opencode-ai/plugin/package.json"), "utf8"));
    equal(sdkManifest.version, HOST_VERSION, "REAL_HOST_SDK_VERSION_MISMATCH");
    report.bootstrap.lockSha256 = digest(await readFile(path.join(dependencies, "package-lock.json")));
    report.project = await provision(repoRoot, root, env);
    report.setupMs = performance.now() - started;
    await json(path.join(outputDir, "setup.json"), report);
    for (const scenario of HOST_SCENARIOS) {
      try {
        const record = await runObservedScenario({ scenario, plugin, outputDir, binary, dependencies, setup: async ({ cwd, env: hostEnv }) => {
          Object.assign(hostEnv, gitEnv, hostFlags, { PATH: env.PATH });
          await cp(report.project.cwd, cwd, { recursive: true });
          const setupEvidence = { modifications: [], hostFlags };
          if (scenario.nativeCwd) {
            // bash starts in project; project unchanged committed Cargo files into that cwd.
            for (const file of ["Cargo.toml", "main.rs"]) await cp(path.join(cwd, "fixtures/runners/native", file), path.join(cwd, file));
            hostEnv.CARGO_HOME = path.join(path.dirname(cwd), "cargo-home");
            hostEnv.CARGO_NET_OFFLINE = "true";
            setupEvidence.modifications.push("project unchanged pinned fixtures/runners/native/{Cargo.toml,main.rs} into bash cwd; real cargo, offline, private CARGO_HOME");
          }
          if (scenario.oracle === "truncated") {
            const stress = path.join(cwd, "host-stress");
            await mkdir(stress);
            for (let i = 0; i < 1800; i++) await writeFile(path.join(stress, `host-stress-${String(i).padStart(4, "0")}-${"native-path-".repeat(5)}.txt`), "native Git entry\n");
            setupEvidence.modifications.push("create 1800 native Git untracked file entries under host-stress/; upstream default truncation limits");
          }
          if (scenario.id === "unknown-read") setupEvidence.expectedOriginal = await readFile(path.join(cwd, "README.md"), "utf8");
          return setupEvidence;
        } });
        report.scenarios.push(record);
      } catch (error) {
        const failure = JSON.parse(await readFile(path.join(outputDir, scenario.id, "failure.json"), "utf8"));
        report.scenarios.push({ ...scenario, status: "failed", ...failure });
        report.failures.push({ id: scenario.id, name: error.code, message: error.message });
      }
      await json(path.join(outputDir, "report.json"), report);
    }
    requireFact(report.scenarios.length === HOST_SCENARIOS.length && report.scenarios.length > 0, "REAL_HOST_SCENARIOS_EMPTY");
    requireFact(report.failures.length === 0, "REAL_HOST_SCENARIOS_FAILED", report.failures.map(({ id, name }) => `${id}: ${name}`).join("; "));
    report.status = "proved";
    report.elapsedMs = performance.now() - started;
    report.environment.loadAfter = loadavg();
    await json(path.join(outputDir, "report.json"), report);
    return report;
  } catch (error) {
    report.status = "failed";
    report.failure = { name: error.code ?? "REAL_HOST_SETUP_FAILED", message: error.message };
    report.elapsedMs = performance.now() - started;
    report.environment.loadAfter = loadavg();
    await json(path.join(outputDir, "report.json"), report);
    throw Object.assign(new Error(`${report.failure.name}: ${error.message}\nReal-host artifacts: ${outputDir}; setup: ${root}`, { cause: error }), { code: report.failure.name });
  }
}

if (process.argv[1] && await realpath(process.argv[1]).catch(() => null) === await realpath(fileURLToPath(import.meta.url))) {
  try {
    requireFact(process.argv.length === 3, "REAL_HOST_USAGE", "node scripts/real-world/host.mjs OUTPUT_DIR");
    const result = await runRealHost({ outputDir: process.argv[2], dependencies: process.env.HUGR_SMOKE_DEPS });
    console.log(JSON.stringify({ status: result.status, version: result.version, platform: result.platform, outputDir: result.outputDir, elapsedMs: result.elapsedMs,
      scenarios: result.scenarios.map(({ id, command, rawBytes, modelBytes, savedBytes, elapsedMs, metadataExact, evidenceOK, note }) => ({ id, command, rawBytes, modelBytes, savedBytes, elapsedMs, metadataExact, evidenceOK, note })) }, null, 2));
  } catch (error) { console.error(error.stack); process.exitCode = 1; }
}
