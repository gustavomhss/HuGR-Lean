import { createHash } from "node:crypto";
import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual as isEqual } from "node:util";

const FAMILIES = { go: ["go-test-verbose"], pytest: ["pytest"], node: ["node-test"], cargo: ["cargo-test", "cargo-build"] };
const SCHEMA = "hugr-lean/utility-corpus/1";
const hash = (data) => createHash("sha256").update(data).digest("hex");
const record = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const nonempty = (v) => typeof v === "string" && v.length > 0;
const digest = (v) => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
const sha = (v) => typeof v === "string" && /^[a-f0-9]{40}$/.test(v);
const FACT_FIELDS = ["command", "cwd", "exitCode", "signal", "timedOut", "nativeSpawned", "nativeExitObserved", "complete",
  "durationMs", "guardianElapsedMs", "durationBoundary", "exitDurationMs", "bookkeepingMs", "durationDefinition", "guardianElapsedDefinition",
  "captureDefinition", "encodingError", "launchError", "killErrors", "cleanupErrors"];
const RECEIPT_FIELDS = ["id", "state", "baseline", "baselineSourceSHA", "sourceHead", "producer", "tools", "fixtureSources",
  "artifacts", "streams", "original", "stdout", "stderr", "environmentPolicy", "environment", "errors", "sourceInventorySHA256"];
const RECEIPT_VARIANTS = {
  go: ["timeout"], node: ["startedAt", "recordedAt", "timeoutMs", "artifactCleanup"],
  pytest: ["facts", "receipt", "retainedLiveDirectory", "observedRows", "versions", "timeoutMs", "sourceInventorySHA256", "prior", "role", "versionProof", "transformation"],
  cargo: ["expectedExit", "timeoutMs", "runtime", "helpers", "amendedProducer", "priorIndexSHA256", "originalProducerCommit",
    "fixtureSourcesBefore", "fixtureSourcesAfter", "checkedAbsentConfigs", "sourceChanges", "deliberateBuildDelaySeconds", "nativeFacts"],
};
function demand(ok, code, context) {
  if (!ok) throw new Error(`${code}: ${context}`);
}
function keys(value, required, optional, context) {
  demand(record(value), "INVALID_OBJECT", context);
  demand(required.every((key) => Object.hasOwn(value, key)), "MISSING_FIELD", context);
  const unknown = Object.keys(value).filter((key) => !required.includes(key) && !optional.includes(key));
  demand(unknown.length === 0, "UNKNOWN_FIELD", `${context}: ${unknown.join(",")}`);
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
function descriptor(value, context) {
  keys(value, ["file", "sha256", "bytes"], ["sourceFile"], context);
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
export async function readArtifactInventory(root) {
  root = path.resolve(root);
  demand(!(await lstat(root)).isSymbolicLink(), "SYMLINK", root);
  root = await realpath(root);
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
        demand(stat.nlink === 1 && !identities.has(identity), "FILE_ALIAS", file);
        identities.add(identity);
        const relative = path.relative(root, await realpath(absolute));
        demand(relative && !path.isAbsolute(relative) && relative.split(path.sep)[0] !== "..", "OUTSIDE_PATH", file);
        files.set(file, await readFile(absolute));
      }
    }
  }
  await walk(root, "");
  return files;
}
function artifactBytes(files, used, ref, context, shared = false) {
  descriptor(ref, context);
  const data = files.get(ref.file);
  demand(data !== undefined, "MISSING_ARTIFACT", `${context}: ${ref.file}`);
  demand(shared || !used.has(ref.file), "DUPLICATE_ARTIFACT_PATH", `${context}: ${ref.file}`);
  demand(data.length === ref.bytes && hash(data) === ref.sha256, "ARTIFACT_DIGEST_MISMATCH", `${context}: ${ref.file}`);
  used.add(ref.file);
  return data;
}
const artifact = (files, used, ref, context, shared = false) => decode(artifactBytes(files, used, ref, context, shared), context);
function tools(value, context) {
  const names = new Set();
  for (const tool of list(value, context)) {
    keys(tool, ["name", "version", "executable"], ["lockedIntegrity", "installation"], context);
    demand([tool.name, tool.version, tool.executable].every(nonempty) && path.isAbsolute(tool.executable), "INVALID_TOOL", context);
    demand(!names.has(tool.name), "DUPLICATE_TOOL", `${context}: ${tool.name}`);
    names.add(tool.name);
    for (const key of ["lockedIntegrity", "installation"]) if (tool[key] !== undefined) demand(nonempty(tool[key]), "INVALID_TOOL_DIAGNOSTIC", `${context}: ${key}`);
  }
}
function anchors(original, expected, required, context) {
  let sourceEnd = 0, outputEnd = 0;
  return list(required, `${context}: required`).map((anchor) => {
    keys(anchor, ["text", "occurrence"], [], context);
    demand(nonempty(anchor.text) && Buffer.from(anchor.text).toString("utf8") === anchor.text
      && Number.isSafeInteger(anchor.occurrence) && anchor.occurrence >= 0, "INVALID_ANCHOR", context);
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
function producer(value, context, raw = false) {
  keys(value, raw ? [] : ["script", "sourceSHA256"], raw ? ["script", "file", "sourceSHA256", "sha256", "bytes", "dependencies", "snapshot"] : [], context);
  demand(value.script === undefined || value.file === undefined || value.script === value.file, "CONFLICTING_PRODUCER_ALIAS", context);
  demand(value.sourceSHA256 === undefined || value.sha256 === undefined || value.sourceSHA256 === value.sha256, "CONFLICTING_PRODUCER_ALIAS", context);
  const normalized = { script: value.script ?? value.file, sourceSHA256: value.sourceSHA256 ?? value.sha256 };
  safe(normalized.script, context);
  demand(digest(normalized.sourceSHA256), "INVALID_PRODUCER_DIGEST", context);
  if (value.bytes !== undefined) demand(Number.isSafeInteger(value.bytes) && value.bytes > 0, "INVALID_PRODUCER_BYTES", context);
  return normalized;
}
function series(files, used, value, context) {
  keys(value, ["sha256", "bytes", "parts"], [], context);
  demand(digest(value.sha256) && Number.isSafeInteger(value.bytes) && value.bytes > 0, "INVALID_SERIES", context);
  const names = new Set(), chunks = list(value.parts, `${context}: parts`).map((part) => {
    demand(!names.has(part.file), "DUPLICATE_SERIES_PART", context); names.add(part.file);
    return artifactBytes(files, used, part, context);
  });
  const bytes = Buffer.concat(chunks);
  demand(bytes.length === value.bytes && hash(bytes) === value.sha256, "SERIES_DIGEST_MISMATCH", context);
  return json(bytes, context);
}
function indexRows(index, family) {
  if (family === "go") return list(index.receipts, "go: index.receipts");
  if (family === "node") return [...list(index.cases, "node: index.cases"), ...list(index.toolReceipts, "node: index.toolReceipts")];
  return list(index.captures, `${family}: index.captures`);
}
function sourceMatch(refs, wanted, context) {
  const matches = refs.filter((ref) => (ref.sourceFile ?? ref.file) === wanted.file && ref.sha256 === wanted.sha256
    && (wanted.bytes === undefined || ref.bytes === wanted.bytes));
  demand(matches.length === 1, "UNBOUND_SOURCE_RECORD", `${context}: ${wanted.file}`);
  return matches[0];
}
function bindIndexedCapture(row, receipt, references, context, family) {
  demand(record(row), "MISSING_INDEXED_CAPTURE", context);
  const facts = receipt.facts ?? receipt, indexed = row.facts ?? row;
  for (const key of ["command", "cwd", "exitCode", "complete", "signal", "timedOut", "nativeSpawned", "nativeExitObserved"]) {
    if (indexed[key] !== undefined) demand(isEqual(indexed[key], facts[key]), "INDEX_CAPTURE_FACT_MISMATCH", `${context}: ${key}`);
  }
  const streams = row.artifacts ?? row.streams ?? row;
  for (const key of ["original", "stdout", "stderr"]) sameDigest(streams[key], { ...references[key], file: references[key].sourceFile ?? references[key].file }, `${context}: ${key}`);
  const capture = row.capture ?? (record(row.receipt) ? row.receipt : undefined);
  if (capture) sameDigest(capture, { ...references.capture, file: references.capture.sourceFile ?? references.capture.file }, `${context}: capture`);
  const receiptFile = typeof row.receipt === "string" ? row.receipt : family === "cargo" ? `captures/${row.id}/receipt.json` : undefined;
  if (receiptFile !== undefined) demand((references.capture.sourceFile ?? references.capture.file) === receiptFile, "INDEX_RECEIPT_PATH_MISMATCH", `${context}: capture`);
  if (typeof receipt.receipt === "string") demand(receipt.receipt === (references.capture.sourceFile ?? references.capture.file), "RECEIPT_SELF_PATH_MISMATCH", `${context}: receipt`);
  for (const key of ["fixtureSources", "fixtureSourcesBefore", "fixtureSourcesAfter", "helpers", "versions", "sourceHead", "sourceInventorySHA256",
    "baseline", "baselineSourceSHA", "errors", "encodingError", "launchError", "killErrors", "cleanupErrors"]) {
    if (row[key] !== undefined) demand(isEqual(row[key], receipt[key]), "INDEX_CAPTURE_METADATA_MISMATCH", `${context}: ${key}`);
  }
  if (row.producer !== undefined) demand(isEqual(producer(row.producer, context, true), producer(receipt.producer, context, true)), "INDEX_CAPTURE_PRODUCER_MISMATCH", context);
}
function declaredProvenance(files, used, manifest) {
  const roots = new Map();
  for (const entry of list(manifest.provenance, `${manifest.family}: provenance`)) {
    const context = `${manifest.family}/${entry.id}`;
    keys(entry, ["id", "sourceHead", "producer", "index", "sourceInventory", "producerSources", "versionCaptures"], [], context);
    safe(entry.id, context);
    demand(!roots.has(entry.id), "DUPLICATE_PROVENANCE_ROOT", context);
    demand(sha(entry.sourceHead), "INVALID_PROVENANCE_ROOT", context);
    producer(entry.producer, context);
    const index = series(files, used, entry.index, `${context}: index`), sources = series(files, used, entry.sourceInventory, `${context}: sourceInventory`);
    const schemas = { go: ["hugr-lean/utility-native-prep/1"], node: ["hugr-lean/private-native-prep/1"],
      pytest: ["hugr-lean/utility-native-prep/1", "hugr-lean/utility-native-prep-extra/1"],
      cargo: ["hugr-lean/private-native-prep/1", "hugr-lean/private-native-continuation/1"] };
    demand(record(index) && schemas[manifest.family].includes(index.schema) && index.family === manifest.family, "INVALID_NATIVE_INDEX", context);
    demand(entry.sourceHead === (index.sourceHead ?? index.baseline ?? index.baselineSourceSHA), "INDEX_SOURCE_HEAD_MISMATCH", context);
    demand(isEqual(entry.producer, producer(index.producer, context, true)), "INDEX_PRODUCER_MISMATCH", context);
    list(sources, `${context}: sourceInventory`);
    const expectedSources = manifest.family === "go" ? index.sources : manifest.family === "cargo"
      ? index.schema === "hugr-lean/private-native-prep/1" ? index.projects?.[0]?.fixtureSources : index.captures?.[0]?.fixtureSourcesBefore : index.sourceInventory;
    demand(isEqual(sources, expectedSources), "INDEX_SOURCE_INVENTORY_MISMATCH", context);
    if (index.sourceInventorySHA256 !== undefined) demand(index.sourceInventorySHA256 === entry.sourceInventory.sha256, "INDEX_SOURCE_INVENTORY_DIGEST_MISMATCH", context);
    if (manifest.family === "go") demand(index.sourceInventory?.sha256 === entry.sourceInventory.sha256 && index.sourceInventory?.bytes === entry.sourceInventory.bytes, "INDEX_SOURCE_INVENTORY_DIGEST_MISMATCH", context);
    const refs = list(entry.producerSources, `${context}: producerSources`);
    for (const ref of refs) artifactBytes(files, used, ref, `${context}: producerSources`, true);
    const snapshot = sourceMatch(refs, { file: entry.producer.script, sha256: entry.producer.sourceSHA256, bytes: index.producer.bytes }, `${context}: producer`);
    demand(snapshot.bytes > 0, "EMPTY_PRODUCER_SNAPSHOT", context);
    demand(Array.isArray(entry.versionCaptures), "INVALID_VERSION_CAPTURES", context);
    const versions = new Map(), rows = indexRows(index, manifest.family);
    for (const version of entry.versionCaptures) {
      keys(version, ["id", "capture", "original", "stdout", "stderr"], [], context);
      demand(nonempty(version.id) && !versions.has(version.id), "DUPLICATE_VERSION_CAPTURE", context);
      const receipt = json(artifactBytes(files, used, version.capture, context), context), facts = receipt.facts ?? receipt;
      const texts = {};
      for (const key of ["original", "stdout", "stderr"]) texts[key] = artifact(files, used, version[key], context);
      demand(facts.nativeSpawned === true && facts.nativeExitObserved === true && facts.complete === true && facts.exitCode === 0
        && facts.signal === null && facts.timedOut === false && texts.original.length > 0, "INVALID_VERSION_CAPTURE_FACTS", context);
      demand([facts.launchError, facts.encodingError, receipt.errors?.launch, receipt.errors?.encoding, receipt.errors?.preparation].every((error) => error === undefined || error === null)
        && [facts.killErrors, facts.cleanupErrors, receipt.cleanupErrors, receipt.errors?.cleanup].every((errors) => errors === undefined || (Array.isArray(errors) && errors.length === 0)), "VERSION_CAPTURE_ERRORS", context);
      demand(version.original.bytes === version.stdout.bytes + version.stderr.bytes, "VERSION_STREAM_LENGTH_MISMATCH", context);
      bindIndexedCapture(rows.find((row) => row.id === version.id), receipt, version, `${context}: ${version.id}`, manifest.family);
      versions.set(version.id, { ...version, receipt, text: texts.original });
    }
    roots.set(entry.id, { entry, index, sources, refs, rows, versions, linked: 0 });
  }
  for (const root of roots.values()) {
    const prior = root.index.prior;
    if (prior) {
      const matches = [...roots.values()].filter((candidate) => candidate.entry.index.sha256 === prior.sha256);
      demand(matches.length === 1, "MISSING_PRIOR_ROOT", root.entry.id);
      if (prior.sourceHead !== undefined) demand(prior.sourceHead === matches[0].entry.sourceHead, "PRIOR_SOURCE_HEAD_MISMATCH", root.entry.id);
      if (prior.inventorySHA256 !== undefined) demand(prior.inventorySHA256 === matches[0].entry.sourceInventory.sha256, "PRIOR_SOURCE_INVENTORY_MISMATCH", root.entry.id);
    }
    for (const version of root.versions.values()) {
      const context = `${manifest.family}/${root.entry.id}/version/${version.id}`, facts = version.receipt.facts ?? version.receipt;
      const rawSources = version.receipt.fixtureSources ?? [];
      demand(Array.isArray(rawSources), "INVALID_VERSION_SOURCES", context);
      const candidates = [...root.refs, ...manifest.cases.filter((item) => item.provenanceRoot === root.entry.id).flatMap((item) => item.fixtureSources)];
      const unique = [...new Map(candidates.map((ref) => [`${ref.sourceFile ?? ref.file}:${ref.sha256}`, ref])).values()];
      const fixtureSources = rawSources.map((source) => sourceMatch(unique, source, context));
      receiptCheck(version.receipt, { ...version, producer: root.entry.producer, provenanceRoot: root.entry.id,
        command: facts.command, role: "exact", exitCode: 0, complete: true, signal: null, timedOut: false, fixtureSources }, manifest, context, roots, true);
    }
  }
  return roots;
}
function receiptCheck(receipt, item, manifest, context, roots = new Map(), versionCapture = false) {
  const root = item.provenanceRoot === undefined ? undefined : roots.get(item.provenanceRoot);
  demand(item.provenanceRoot === undefined || root !== undefined, "MISSING_PROVENANCE_ROOT", context);
  keys(receipt, [], [...FACT_FIELDS, ...RECEIPT_FIELDS, ...RECEIPT_VARIANTS[manifest.family]], `${context}: receipt`);
  const facts = receipt.facts ?? receipt;
  demand(record(facts), "INVALID_RECEIPT_FACTS", context);
  if (receipt.facts !== undefined) keys(facts, [], FACT_FIELDS, `${context}: receipt.facts`);
  if (receipt.id !== undefined) demand(receipt.id === item.id, "RECEIPT_ID_MISMATCH", context);
  for (const key of ["command", "exitCode", "complete", "signal", "timedOut"]) {
    demand(facts[key] === item[key], "RECEIPT_FACT_MISMATCH", `${context}: ${key}`);
    if (Object.hasOwn(receipt, key)) demand(receipt[key] === facts[key], "CONFLICTING_RECEIPT_FACTS", `${context}: ${key}`);
  }
  if (receipt.facts !== undefined) for (const key of Object.keys(facts)) {
    if (Object.hasOwn(receipt, key)) demand(isEqual(receipt[key], facts[key]), "CONFLICTING_RECEIPT_FACTS", `${context}: ${key}`);
  }
  demand(nonempty(facts.cwd) && path.isAbsolute(facts.cwd), "INVALID_CAPTURE_CWD", context);
  demand(facts.nativeSpawned === true && typeof facts.nativeExitObserved === "boolean", "INVALID_NATIVE_FACTS", context);
  const errors = [facts.launchError, facts.encodingError, receipt.launchError, receipt.encodingError, receipt.errors?.launch, receipt.errors?.encoding, receipt.errors?.preparation];
  if (receipt.errors !== undefined) keys(receipt.errors, [], ["launch", "encoding", "cleanup", "preparation"], `${context}: errors`);
  const cleanup = [facts.killErrors, facts.cleanupErrors, receipt.killErrors, receipt.cleanupErrors, receipt.errors?.cleanup];
  demand(errors.every((v) => v === undefined || v === null)
    && cleanup.every((v) => v === undefined || (Array.isArray(v) && v.length === 0)), "CAPTURE_ERRORS", context);
  const complete = !facts.timedOut && Number.isSafeInteger(facts.exitCode) && facts.signal === null;
  demand(facts.complete === complete && (!complete || facts.nativeExitObserved), "INCOHERENT_CAPTURE_FACTS", context);
  demand(!facts.timedOut || item.role === "exact", "TIMED_OUT_NOISE", context);
  demand(Number.isFinite(facts.durationMs) && facts.durationMs >= 0 && nonempty(facts.durationBoundary), "INVALID_DURATION_PROVENANCE", context);
  for (const key of ["guardianElapsedMs", "bookkeepingMs", "exitDurationMs"]) if (facts[key] !== undefined && facts[key] !== null) demand(Number.isFinite(facts[key]) && facts[key] >= 0, "INVALID_DURATION_PROVENANCE", `${context}: ${key}`);
  demand(facts.captureDefinition === "stdout/stderr arrival order; no text rewriting", "INVALID_CAPTURE_DEFINITION", context);
  demand(sha(receipt.baseline ?? receipt.baselineSourceSHA)
    && (receipt.sourceHead === undefined || sha(receipt.sourceHead)), "INVALID_SOURCE_PROVENANCE", context);
  demand(receipt.baseline === undefined || receipt.baselineSourceSHA === undefined
    || receipt.baseline === receipt.baselineSourceSHA, "CONFLICTING_SOURCE_PROVENANCE", context);
  demand(receipt.sourceInventorySHA256 === undefined || digest(receipt.sourceInventorySHA256), "INVALID_SOURCE_INVENTORY_DIGEST", context);
  demand(receipt.sourceInventorySHA256 === undefined || root?.entry.sourceInventory.sha256 === receipt.sourceInventorySHA256, "UNBOUND_SOURCE_INVENTORY", context);
  const priorSHA = receipt.priorIndexSHA256 ?? receipt.prior?.sha256;
  const prior = priorSHA === undefined ? undefined : [...roots.values()].find((candidate) => candidate.entry.index.sha256 === priorSHA);
  demand(priorSHA === undefined || prior !== undefined, "UNBOUND_PRIOR_INDEX", context);
  if (receipt.prior) {
    demand(receipt.prior.sourceHead === prior.entry.sourceHead && receipt.prior.inventorySHA256 === prior.entry.sourceInventory.sha256, "PRIOR_RECEIPT_MISMATCH", context);
  }
  if (receipt.versionProof !== undefined) {
    demand(receipt.versionProof.kind === "linked-prior-native-captures" && prior !== undefined, "UNBOUND_VERSION_CAPTURES", context);
    for (const capture of list(receipt.versionProof.captures, context)) {
      const version = prior.versions.get(capture.id);
      demand(version !== undefined && capture.receipt === (version.capture.sourceFile ?? version.capture.file), "UNBOUND_VERSION_CAPTURES", context);
      for (const key of ["original", "stdout", "stderr"]) sameDigest(capture.artifacts[key], { ...version[key], file: version[key].sourceFile ?? version[key].file }, context);
    }
  }
  demand(nonempty(receipt.environmentPolicy) || record(receipt.environmentPolicy) || record(receipt.environment), "MISSING_ENVIRONMENT_PROVENANCE", context);
  const declaredProducer = producer(item.producer ?? manifest.producer, context), observedProducer = producer(receipt.producer, context, true);
  demand(isEqual(declaredProducer, observedProducer), "PRODUCER_MISMATCH", context);
  const helpers = [...(receipt.producer.dependencies ?? []), ...(receipt.helpers ?? [])];
  demand(helpers.length === 0 || root !== undefined, "UNBOUND_PRODUCER_HELPERS", context);
  for (const helper of helpers) sourceMatch(root.refs, helper, context);
  if (root) {
    demand(isEqual(declaredProducer, root.entry.producer), "ROOT_CASE_PRODUCER_MISMATCH", context);
    demand(receipt.sourceHead === undefined || receipt.sourceHead === root.entry.sourceHead, "ROOT_RECEIPT_SOURCE_HEAD_MISMATCH", context);
    bindIndexedCapture(root.rows.find((row) => row.id === item.id), receipt, item, context, manifest.family);
    const snapshot = sourceMatch(root.refs, { file: declaredProducer.script, sha256: declaredProducer.sourceSHA256, bytes: receipt.producer.bytes }, context);
    if (receipt.producer.snapshot !== undefined) {
      descriptor(receipt.producer.snapshot, context);
      demand(receipt.producer.snapshot.sha256 === snapshot.sha256 && receipt.producer.snapshot.bytes === snapshot.bytes
        && (root.index.producer.snapshot === undefined || receipt.producer.snapshot.file === root.index.producer.snapshot.file), "PRODUCER_SNAPSHOT_MISMATCH", context);
    }
    if (receipt.amendedProducer) sourceMatch(root.refs, { file: receipt.amendedProducer.script, sha256: receipt.amendedProducer.sha256, bytes: receipt.amendedProducer.bytes }, context);
    if (!versionCapture) { root.linked++; root.caseRefs ??= []; root.caseRefs.push(...item.fixtureSources); }
    if (receipt.versions !== undefined && !(versionCapture && receipt.versions === null)) demand(isEqual(receipt.versions, root.index.versions), "INDEX_VERSIONS_MISMATCH", context);
    root.snapshot = snapshot;
  }
  const streamSets = [receipt.artifacts, receipt.streams, receipt.original === undefined ? undefined : receipt].filter((v) => v !== undefined);
  demand(streamSets.length > 0, "MISSING_RECEIPT_STREAMS", context);
  for (const streams of streamSets) {
    demand(record(streams), "INVALID_RECEIPT_STREAMS", context);
    if (streams !== receipt) keys(streams, ["original", "stdout", "stderr"], [], `${context}: streams`);
    for (const key of ["original", "stdout", "stderr"]) {
      descriptor(streams[key], `${context}: receipt.${key}`);
      sameDigest(streams[key], { ...item[key], file: item[key].sourceFile ?? item[key].file }, `${context}: ${key}`);
    }
  }
  const phased = receipt.fixtureSourcesBefore !== undefined || receipt.fixtureSourcesAfter !== undefined;
  demand(!phased || receipt.fixtureSources === undefined, "AMBIGUOUS_SOURCE_INVENTORY", context);
  demand(!phased || (manifest.family === "cargo" && ["before", "after"].includes(item.sourcePhase)), "SOURCE_PHASE_REQUIRED", context);
  demand(phased || item.sourcePhase === undefined, "UNEXPECTED_SOURCE_PHASE", context);
  const rawSources = phased ? receipt[item.sourcePhase === "before" ? "fixtureSourcesBefore" : "fixtureSourcesAfter"] : receipt.fixtureSources ?? (versionCapture ? [] : undefined);
  const sources = versionCapture && Array.isArray(rawSources) ? rawSources : list(rawSources, `${context}: receipt.fixtureSources`), mapped = new Set();
  demand(sources.length === item.fixtureSources.length, "SOURCE_INVENTORY_MISMATCH", context);
  for (const source of sources) {
    keys(source, ["file", "sha256", "bytes"], ["originalSource", "license", "origin"], `${context}: receipt source`);
    safe(source.file, context);
    demand(digest(source.sha256) && Number.isSafeInteger(source.bytes) && source.bytes >= 0, "INVALID_DIGEST_DESCRIPTOR", context);
  }
  for (const source of item.fixtureSources) {
    const name = source.sourceFile ?? source.file;
    demand(!mapped.has(name), "DUPLICATE_SOURCE_MAPPING", `${context}: ${name}`);
    mapped.add(name);
    const matches = sources.filter((entry) => entry.file === name);
    demand(matches.length === 1, "SOURCE_MAPPING_MISMATCH", `${context}: ${name}`);
    sameDigest(matches[0], { ...source, file: name }, `${context}: ${name}`);
    if (matches[0].originalSource !== undefined) {
      const originalSource = matches[0].originalSource;
      descriptor(originalSource, `${context}: originalSource`);
      sameDigest(originalSource, { ...source, file: originalSource.file }, `${context}: originalSource`);
    }
  }
  const receiptTools = versionCapture && Array.isArray(receipt.tools) ? receipt.tools : list(receipt.tools, `${context}: receipt.tools`);
  demand(receiptTools.every(record), "INVALID_RECEIPT_TOOL", context);
  for (const tool of receiptTools) {
    keys(tool, ["name", "executable"], ["version", "realpath", "launcherSHA256", "bytes", "sha256", "receipt", "lockedIntegrity", "installation"], `${context}: receipt.tools`);
    for (const key of ["version", "realpath", "lockedIntegrity", "installation"]) if (tool[key] !== undefined) demand(nonempty(tool[key]), "INVALID_RECEIPT_TOOL", `${context}: ${key}`);
    for (const key of ["sha256", "launcherSHA256"]) if (tool[key] !== undefined) demand(digest(tool[key]), "INVALID_RECEIPT_TOOL", `${context}: ${key}`);
    if (tool.bytes !== undefined) demand(Number.isSafeInteger(tool.bytes) && tool.bytes > 0, "INVALID_RECEIPT_TOOL", context);
    if (tool.receipt !== undefined) {
      const versions = [...roots.values()].flatMap((candidate) => [...candidate.versions.values()]);
      demand(versions.some((version) => (version.capture.sourceFile ?? version.capture.file) === tool.receipt.file
        && version.capture.sha256 === tool.receipt.sha256 && version.capture.bytes === tool.receipt.bytes), "UNBOUND_TOOL_VERSION_RECEIPT", context);
    }
  }
  for (const tool of manifest.tools.filter((tool) => !versionCapture || receiptTools.some((entry) => entry.name === tool.name))) {
    const direct = receiptTools.filter((entry) => entry.name === tool.name);
    const version = direct[0]?.version ?? receipt.versions?.[tool.name];
    const executable = direct[0]?.executable ?? receipt.versions?.[`${tool.name}Executable`] ?? receipt.versions?.[`${tool.name}Module`];
    demand(direct.length <= 1 && (version === tool.version || (versionCapture && version === undefined)) && executable === tool.executable, "TOOL_PROVENANCE_MISMATCH", `${context}: ${tool.name}`);
    for (const key of ["lockedIntegrity", "installation"]) if (tool[key] !== undefined) demand(direct[0]?.[key] === tool[key], "TOOL_DIAGNOSTIC_MISMATCH", `${context}: ${tool.name}/${key}`);
  }
  for (const tool of receiptTools) {
    demand(record(tool) && nonempty(tool.name) && nonempty(tool.executable), "INVALID_RECEIPT_TOOL", context);
    if (tool.version !== undefined) demand(manifest.tools.some((declared) => declared.name === tool.name
      && declared.version === tool.version && declared.executable === tool.executable), "UNMAPPED_RECEIPT_TOOL", `${context}: ${tool.name}`);
  }
  return facts;
}

/** Root is fixtures/utility, not a historical producer cwd. Reads only family-local plain artifacts. */
export async function readUtilityCorpus(root) {
  root = path.resolve(root);
  demand(!(await lstat(root)).isSymbolicLink(), "SYMLINK", root);
  root = await realpath(root);
  const children = await readdir(root);
  demand(children.length > 0, "EMPTY_CORPUS", root);
  demand(children.every((family) => Object.hasOwn(FAMILIES, family)), "UNKNOWN_FAMILY", root);
  const families = [], cases = [];
  for (const [family, profiles] of Object.entries(FAMILIES)) {
    demand(children.includes(family), "MISSING_FAMILY", family);
    const files = await readArtifactInventory(path.join(root, family)), used = new Set(["manifest.json", "SOURCES.md"]), sourcePaths = new Set(), snapshotPaths = new Set();
    demand(files.has("manifest.json"), "MISSING_MANIFEST", family);
    demand(files.has("SOURCES.md") && files.get("SOURCES.md").length > 0, "MISSING_SOURCES_NOTE", family);
    decode(files.get("SOURCES.md"), `${family}: SOURCES.md`);
    const manifest = json(files.get("manifest.json"), `${family}: manifest.json`);
    keys(manifest, ["schema", "family", "tools", "producer", "cases"], ["provenance"], family);
    demand(manifest.schema === SCHEMA && manifest.family === family, "INVALID_SCHEMA_OR_FAMILY", family);
    tools(manifest.tools, family);
    demand(manifest.tools.some((tool) => tool.name === family), "MISSING_FAMILY_TOOL", family);
    producer(manifest.producer, family);
    const roots = manifest.provenance === undefined ? new Map() : declaredProvenance(files, used, manifest);
    for (const candidate of roots.values()) for (const ref of candidate.refs) snapshotPaths.add(ref.file);
    const rows = [], ids = new Set();
    for (const item of list(manifest.cases, `${family}: cases`)) {
      keys(item, ["id", "profile", "command", "role", "expectedStatus", "exitCode", "complete", "signal", "timedOut",
        "capture", "fixtureSources", "original", "stdout", "stderr", "expected", "required", "material"], ["producer", "sourcePhase", "provenanceRoot"], family);
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
        demand(item[key].file.endsWith(key === "capture" ? ".json" : key === "expected" ? ".expected.log" : ".log"), "INVALID_ARTIFACT_EXTENSION", `${context}: ${key}`);
        demand(!local.has(item[key].file), "DUPLICATE_ARTIFACT_PATH", context);
        local.add(item[key].file);
      }
      const texts = {};
      for (const key of ["original", "stdout", "stderr", "expected"]) texts[key] = artifact(files, used, item[key], `${context}: ${key}`);
      demand(nonempty(texts.original) && nonempty(texts.expected), "EMPTY_CASE_OUTPUT", context);
      demand(item.original.bytes === item.stdout.bytes + item.stderr.bytes, "STREAM_LENGTH_MISMATCH", context);
      if (item.stderr.bytes === 0) demand(texts.original === texts.stdout, "STREAM_CONTENT_MISMATCH", context);
      if (item.stdout.bytes === 0) demand(texts.original === texts.stderr, "STREAM_CONTENT_MISMATCH", context);
      for (const source of list(item.fixtureSources, `${context}: fixtureSources`)) {
        demand(!local.has(source.file) && (!used.has(source.file) || sourcePaths.has(source.file)), "DUPLICATE_ARTIFACT_PATH", context);
        local.add(source.file);
        artifact(files, used, source, `${context}: fixtureSources`, true);
        sourcePaths.add(source.file);
      }
      const receipt = json(Buffer.from(artifact(files, used, item.capture, `${context}: capture`)), `${context}: receipt`);
      const facts = receiptCheck(receipt, item, manifest, context, roots), boundRoot = roots.get(item.provenanceRoot);
      if (receipt.producer.snapshot && !boundRoot) {
        const snapshot = receipt.producer.snapshot;
        demand(!used.has(snapshot.file) || snapshotPaths.has(snapshot.file), "DUPLICATE_ARTIFACT_PATH", `${context}: producer snapshot`);
        sameDigest(snapshot, { ...snapshot, sha256: (item.producer ?? manifest.producer).sourceSHA256 }, `${context}: producer snapshot`);
        artifact(files, used, snapshot, `${context}: producer snapshot`, true);
        snapshotPaths.add(snapshot.file);
      }
      if (files.has("producer-source.mjs") && !boundRoot) {
        demand(!used.has("producer-source.mjs") || snapshotPaths.has("producer-source.mjs"), "DUPLICATE_ARTIFACT_PATH", `${family}: producer-source.mjs`);
        demand(hash(files.get("producer-source.mjs")) === (item.producer ?? manifest.producer).sourceSHA256, "PRODUCER_SNAPSHOT_MISMATCH", context);
        decode(files.get("producer-source.mjs"), `${family}: producer-source.mjs`);
        used.add("producer-source.mjs");
        snapshotPaths.add("producer-source.mjs");
      }
      demand(boundRoot || receipt.producer.snapshot !== undefined || files.has("producer-source.mjs"), "MISSING_PRODUCER_SNAPSHOT", context);
      const producerBytes = files.get(boundRoot?.snapshot.file ?? receipt.producer.snapshot?.file ?? "producer-source.mjs");
      demand(receipt.producer.bytes === undefined || receipt.producer.bytes === producerBytes.length, "PRODUCER_BYTES_MISMATCH", context);
      const saved = item.original.bytes - item.expected.bytes;
      demand(item.material === (saved >= 1024 && saved >= item.original.bytes * 0.1), "MATERIAL_FLAG_MISMATCH", context);
      demand(item.role === "exact" ? texts.expected === texts.original : saved > 0
        && item.exitCode === 0 && item.complete && !item.timedOut && item.signal === null, "ROLE_OUTPUT_MISMATCH", context);
      const required = anchors(texts.original, texts.expected, item.required, context);
      const observation = { source: "shell", command: item.command, output: texts.original, presentation: "unknown",
        completeness: facts.complete ? "complete" : "unknown",
        termination: facts.timedOut ? { kind: "timed_out" } : Number.isSafeInteger(facts.exitCode) && facts.signal === null
          ? { kind: "exited", code: facts.exitCode } : { kind: "unknown" } };
      const row = { ...item, family, qualifiedID: context, captureReceipt: receipt, originalText: texts.original, expectedText: texts.expected, required, observation };
      rows.push(row); cases.push(row);
    }
    demand(rows.some((row) => row.role === "noise") && rows.some((row) => row.role === "exact"), "MISSING_NOISE_OR_EXACT", family);
    demand(rows.some((row) => row.material), "MISSING_MATERIAL_CASE", family);
    demand(rows.some((row) => row.profile === profiles[0]), "MISSING_FAMILY_PROFILE", family);
    for (const candidate of roots.values()) {
      demand(candidate.linked > 0, "UNUSED_PROVENANCE_ROOT", `${family}/${candidate.entry.id}`);
      const refs = [...candidate.refs, ...(candidate.caseRefs ?? [])], unique = [...new Map(refs.map((ref) => [`${ref.sourceFile ?? ref.file}:${ref.sha256}`, ref])).values()];
      for (const source of candidate.sources) sourceMatch(unique, source, `${family}/${candidate.entry.id}: sourceInventory`);
    }
    if (roots.size) {
      const versions = [...roots.values()].flatMap((candidate) => [...candidate.versions.values()]);
      for (const tool of manifest.tools.filter((tool) => family !== "go" || tool.name === "go")) {
        const witnessed = versions.some((version) => family === "pytest" ? (() => {
          try { const facts = JSON.parse(version.text); return facts[tool.name] === tool.version; } catch { return false; }
        })() : version.text.trim() === tool.version || (family === "node" && version.text.split("\n").includes(`${tool.name} v${tool.version.replace(/^v/, "")}`)));
        demand(witnessed, "MISSING_NATIVE_TOOL_VERSION_PROOF", `${family}: ${tool.name}`);
      }
    }
    for (const file of files.keys()) demand(used.has(file), "UNMAPPED_ARTIFACT", `${family}: ${file}`);
    families.push({ family, tools: manifest.tools, producer: manifest.producer, cases: rows,
      provenance: [...roots.values()].map(({ entry, index }) => ({ ...entry, collectorState: index.state ?? index.stage,
        collectorFailures: index.errors ?? index.failedCaptures ?? index.failures ?? index.failure ?? [],
        sourceHeadBinding: "recorded sourceHead or baseline declaration; publisher source bytes are separately hash-bound" })) });
  }
  return { schema: SCHEMA, root, families, cases };
}
