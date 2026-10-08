// Native fixture utility only: no upstream execution, historical replay or latency sampling.
import { createHash } from "node:crypto";
import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import path from "node:path";

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
