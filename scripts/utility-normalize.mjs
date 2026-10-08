// Offline metadata normalizer: copies published bytes into a fresh own .normalized-corpus directory.
// Exposure is captured fixture evidence only; stream chunk arrival is declared, not independently authenticated.
import { createHash } from "node:crypto";
import { lstat, readFile, mkdir, mkdtemp, writeFile, realpath } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";
import { readUtilityCorpus } from "./utility-corpus.mjs";

const own = fileURLToPath(new URL("../", import.meta.url)), worktrees = path.dirname(path.resolve(own));
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const format = (value) => `${JSON.stringify(value, null, 2)}\n`;
const producer = (value) => ({ script: value.script ?? value.file, sourceSHA256: value.sourceSHA256 ?? value.sha256 });
let activeDirectory;
function ensure(ok, message) { if (!ok) throw new Error(message); }
const configurations = {
  go: [{ id: "go-zHh7jh", directory: ".native-captures/go-zHh7jh", index: "capture-index.json", source: ["sources"], versions: ["go-version"] }],
  node: [{ id: "node-m78clV", directory: ".native-captures/node-m78clV", index: "capture-index.json", source: ["sourceInventory"], versions: ["node-version", "tsx-version"] }],
  pytest: [
    { id: "prep-fHWQpI", directory: ".native-captures/pytest/prep-fHWQpI", index: "capture-index.json", source: ["sourceInventory"], versions: ["versions", "pytest-version"] },
    { id: "extra-r2b4ph", directory: ".native-captures/pytest/extra-r2b4ph", index: "capture-index.json", source: ["sourceInventory"], versions: [] },
  ],
  cargo: [
    { id: "cargo-AAzRUV", directory: "private.native-captures/cargo-AAzRUV", index: "capture-index.json", source: ["projects", 0, "fixtureSources"], versions: ["version-cargo", "version-rustc", "version-rustdoc"] },
    { id: "remaining-Ak3JfQ", directory: "private.native-captures/cargo-AAzRUV/remaining-Ak3JfQ", index: "completion-index.json", source: ["captures", 0, "fixtureSourcesBefore"], versions: [] },
  ],
};
function arraySlices(bytes, route, canonical) {
  const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes), ast = ts.parseJsonText("index.json", text);
  ensure(ast.parseDiagnostics.length === 0, "INVALID_IMMUTABLE_JSON");
  let node = ast.statements[0]?.expression;
  for (const part of route) node = typeof part === "number" ? node.elements?.[part]
    : node.properties?.find((property) => property.name.text === part)?.initializer;
  ensure(node && ts.isArrayLiteralExpression(node), `MISSING_SOURCE_ARRAY: ${route.join("/")}`);
  const start = node.getStart(ast), end = node.end, slices = [];
  if (!canonical) return [bytes.subarray(Buffer.byteLength(text.slice(0, start)), Buffer.byteLength(text.slice(0, end)))];
  // Recover the collector's hash-declared serialization using only exact byte slices of its index.
  // No objects/arrays are reconstructed or stringified. Each copied slice retains its original bytes.
  const closing = text.lastIndexOf("\n", end - 1) + 1, indent = end - 1 - closing;
  let cursor = start;
  while (cursor < end) {
    const next = text.indexOf("\n", cursor), stop = next < 0 || next >= end ? end : next + 1;
    const from = cursor === start ? cursor : cursor + indent;
    ensure(from <= stop && (cursor === start || text.slice(cursor, from) === " ".repeat(indent)), "NONCANONICAL_SOURCE_ARRAY_INDENT");
    slices.push(bytes.subarray(Buffer.byteLength(text.slice(0, from)), Buffer.byteLength(text.slice(0, stop)))); cursor = stop;
  }
  const newline = text.indexOf("\n", end);
  ensure(newline >= 0, "MISSING_SOURCE_ARRAY_TERMINATOR");
  slices.push(bytes.subarray(Buffer.byteLength(text.slice(0, newline)), Buffer.byteLength(text.slice(0, newline + 1))));
  return slices;
}
async function checkedRead(file, reference) {
  const stat = await lstat(file);
  ensure(stat.isFile() && !stat.isSymbolicLink(), `SOURCE_NOT_PLAIN_FILE: ${file}`);
  const bytes = await readFile(file);
  ensure(hash(bytes) === reference.sha256 && (reference.bytes === undefined || bytes.length === reference.bytes), `SOURCE_DIGEST_MISMATCH: ${file}`);
  return bytes;
}
async function sourceBytes(root, ref, source, origin) {
  const candidates = [path.join(root.directory, ref.file)];
  if (source?.absolutePath) candidates.push(await realpath(source.absolutePath));
  if (ref.file.startsWith("scripts/")) candidates.push(path.join(root.repository, ref.file));
  for (const file of candidates) {
    try { const bytes = await checkedRead(file, ref); origin.push({ file, sha256: ref.sha256, bytes: bytes.length }); return bytes; }
    catch (error) { if (!/ENOENT|SOURCE_DIGEST_MISMATCH/.test(error.message)) throw error; }
  }
  if (ref.file.startsWith("scripts/")) {
    const commits = execFileSync("git", ["log", "--all", "--format=%H", "--", ref.file], { cwd: root.repository, encoding: "utf8" }).trim().split("\n");
    for (const commit of commits.filter(Boolean)) {
      const bytes = execFileSync("git", ["show", `${commit}:${ref.file}`], { cwd: root.repository, maxBuffer: 8 * 1024 * 1024 });
      if (hash(bytes) === ref.sha256 && (ref.bytes === undefined || bytes.length === ref.bytes)) {
        origin.push({ file: ref.file, commit, sha256: ref.sha256, bytes: bytes.length, license: "MIT", modification: "none; exact source blob" }); return bytes;
      }
    }
  }
  throw new Error(`PINNED_SOURCE_UNAVAILABLE: ${root.id}/${ref.file}`);
}
function rows(index, family) { return family === "go" ? index.receipts : family === "node" ? [...index.cases, ...index.toolReceipts] : index.captures; }

export async function normalizeUtilityCorpus() {
  const parent = path.join(own, ".normalized-corpus");
  await mkdir(parent, { recursive: true });
  ensure(!(await lstat(parent)).isSymbolicLink(), "NORMALIZED_PARENT_SYMLINK");
  const directory = await mkdtemp(path.join(parent, "candidate-")), corpusRoot = path.join(directory, "corpus");
  activeDirectory = directory;
  await mkdir(corpusRoot);
  const plan = [], origins = [], normalizations = [], seriesOrigins = [];
  for (const [family, specs] of Object.entries(configurations)) {
    const destination = path.join(corpusRoot, family), actor = path.join(worktrees, `hugr-lean-utility-${family}-parser/fixtures/utility/${family}`);
    await mkdir(destination);
    const manifest = JSON.parse(await readFile(path.join(actor, "manifest.json"), "utf8"));
    const written = new Map();
    async function put(file, bytes, sourceFile = file) {
      ensure(file.split("/").every((part) => part && part !== "." && part !== "..") && !path.isAbsolute(file), `UNSAFE_DESTINATION: ${file}`);
      const digest = hash(bytes), prior = written.get(file);
      ensure(!prior || prior === digest, `NORMALIZATION_PATH_COLLISION: ${file}`);
      if (!prior) {
        await mkdir(path.dirname(path.join(destination, file)), { recursive: true }); await writeFile(path.join(destination, file), bytes, { flag: "wx" });
        written.set(file, digest); plan.push({ family, file, bytes: bytes.length, sha256: digest });
      }
      return { file, bytes: bytes.length, sha256: digest, ...(sourceFile === file ? {} : { sourceFile }) };
    }
    async function putSeries(id, kind, chunks) {
      const bytes = Buffer.concat(chunks), parts = []; let number = 0;
      for (const chunk of chunks) {
        // Review slices are at most 160 physical lines; every part is an unchanged byte range.
        let start = 0, lines = 0;
        for (let offset = 0; offset < chunk.length; offset++) if (chunk[offset] === 10 && ++lines === 160) {
          parts.push(await put(`provenance/${id}/${kind}.${number++}.json`, chunk.subarray(start, offset + 1))); start = offset + 1; lines = 0;
        }
        if (start < chunk.length) parts.push(await put(`provenance/${id}/${kind}.${number++}.json`, chunk.subarray(start)));
      }
      return { bytes: bytes.length, sha256: hash(bytes), parts };
    }
    const roots = [];
    for (const spec of specs) {
      const repository = path.join(worktrees, `hugr-lean-utility-${family}-native`), native = path.join(repository, spec.directory);
      const indexBytes = await readFile(path.join(native, spec.index)), index = JSON.parse(indexBytes.toString("utf8"));
      const sourceChunks = family === "go" ? [await checkedRead(path.join(native, index.sourceInventory.file), index.sourceInventory)]
        : arraySlices(indexBytes, spec.source, family === "pytest");
      const sourceInventory = await putSeries(spec.id, "sources", sourceChunks);
      seriesOrigins.push({ family, id: spec.id, indexFile: path.join(native, spec.index), indexSHA256: hash(indexBytes),
        sourceInventorySHA256: sourceInventory.sha256, route: spec.source, canonicalCollectorWhitespace: family === "pytest",
        ranges: sourceChunks.map((chunk) => ({ start: chunk.byteOffset - indexBytes.byteOffset, bytes: chunk.length, sha256: hash(chunk) })),
        ...(family === "go" ? { sourceInventoryFile: path.join(native, index.sourceInventory.file), ranges: null } : {}) });
      ensure(index.sourceInventorySHA256 === undefined || index.sourceInventorySHA256 === sourceInventory.sha256, `SOURCE_SERIALIZATION_DIGEST_MISMATCH: ${spec.id}`);
      const entry = { id: spec.id, sourceHead: index.sourceHead ?? index.baseline ?? index.baselineSourceSHA, producer: producer(index.producer),
        index: await putSeries(spec.id, "index", [indexBytes]), sourceInventory, producerSources: [], versionCaptures: [] };
      roots.push({ ...spec, repository, directory: native, index, entry, sources: JSON.parse(Buffer.concat(sourceChunks).toString("utf8")), receipts: [] });
    }
    for (const item of manifest.cases) {
      const raw = await checkedRead(path.join(actor, item.capture.file), item.capture), receipt = JSON.parse(raw.toString("utf8"));
      const root = roots.find((candidate) => producer(receipt.producer).sourceSHA256 === candidate.entry.producer.sourceSHA256);
      ensure(root, `CASE_ROOT_MISSING: ${family}/${item.id}`);
      root.receipts.push(receipt); item.provenanceRoot = root.id; item.producer = producer(receipt.producer);
      const indexed = rows(root.index, family).find((row) => row.id === item.id);
      const receiptSourceFile = typeof indexed?.receipt === "string" ? indexed.receipt : indexed?.capture?.file ?? indexed?.receipt?.file
        ?? (family === "cargo" ? `captures/${item.id}/receipt.json` : receipt.receipt ?? item.capture.sourceFile ?? item.capture.file);
      item.capture = await put(item.capture.file, raw, receiptSourceFile);
      for (const key of ["original", "stdout", "stderr", "expected"]) {
        const bytes = await checkedRead(path.join(actor, item[key].file), item[key]);
        const original = (receipt.artifacts ?? receipt.streams ?? receipt)[key];
        item[key] = await put(item[key].file, bytes, key === "expected" ? item[key].sourceFile ?? item[key].file : original.file);
      }
      for (const ref of item.fixtureSources) await put(ref.file, await checkedRead(path.join(actor, ref.file), ref));
      if (receipt.fixtureSourcesBefore) {
        item.sourcePhase = ["before", "after"].find((phase) => receipt[phase === "before" ? "fixtureSourcesBefore" : "fixtureSourcesAfter"].every((source) =>
          item.fixtureSources.some((ref) => (ref.sourceFile ?? ref.file) === source.file && ref.sha256 === source.sha256 && ref.bytes === source.bytes)));
        ensure(item.sourcePhase, `SOURCE_PHASE_UNMAPPED: ${family}/${item.id}`);
      }
      const exactAnchorCompletion = item.required.length === 0 && item.role === "exact";
      const anchorOccurrenceRepairs = [];
      if (exactAnchorCompletion) {
        const bytes = await readFile(path.join(destination, item.original.file));
        ensure(hash(bytes) === item.expected.sha256 && bytes.length === item.expected.bytes, `EXACT_GOLDEN_MISMATCH: ${family}/${item.id}`);
        item.required = [{ text: new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes), occurrence: 0 }];
      }
      if (item.role === "exact") {
        const original = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(await readFile(path.join(destination, item.original.file)));
        let end = 0;
        for (const [index, anchor] of item.required.entries()) {
          ensure(typeof anchor.text === "string" && anchor.text.length > 0 && Number.isSafeInteger(anchor.occurrence) && anchor.occurrence >= 0, `INVALID_EXACT_ANCHOR: ${family}/${item.id}/${index}`);
          let cursor = 0, occurrence = 0, start;
          while ((start = original.indexOf(anchor.text, cursor)) >= 0 && (occurrence < anchor.occurrence || start < end)) {
            cursor = start + anchor.text.length; occurrence++;
          }
          ensure(start >= end && anchor.text.length > 0, `EXACT_ANCHOR_NOT_MAPPABLE: ${family}/${item.id}/${index}`);
          if (occurrence !== anchor.occurrence) {
            anchorOccurrenceRepairs.push({ index, text: anchor.text, from: anchor.occurrence, to: occurrence, startUTF16: start }); anchor.occurrence = occurrence;
          }
          end = start + anchor.text.length;
        }
      }
      ensure(item.required.length > 0, `EMPTY_ACTOR_ANCHORS: ${family}/${item.id}`);
      normalizations.push({ family, id: item.id, producer: item.producer, sourcePhase: item.sourcePhase ?? null, provenanceRoot: root.id, exactAnchorCompletion, anchorOccurrenceRepairs });
    }
    for (const root of roots) {
      const refs = new Map();
      async function retain(ref, source = ref) {
        const key = `${ref.file}:${ref.sha256}`;
        if (!refs.has(key)) {
          const bytes = await sourceBytes(root, ref, source, origins);
          refs.set(key, await put(`provenance/${root.id}/source/${ref.sha256}/${path.basename(ref.file)}`, bytes, ref.file));
        }
      }
      await retain({ file: root.entry.producer.script, sha256: root.entry.producer.sourceSHA256, bytes: root.index.producer.bytes });
      for (const receipt of root.receipts) {
        for (const ref of [...(receipt.helpers ?? []), ...(receipt.producer.dependencies ?? [])]) await retain(ref);
        if (receipt.amendedProducer) await retain({ file: receipt.amendedProducer.script, sha256: receipt.amendedProducer.sha256, bytes: receipt.amendedProducer.bytes });
      }
      for (const source of root.sources) {
        if (family === "node" && source.file === "native-node-executable") {
          const tool = root.index.tools.find((entry) => entry.name === "node");
          ensure(tool?.version === "v22.17.1" && tool.executable === source.absolutePath, "EXTERNAL_RUNTIME_NOT_ALLOWED");
          root.entry.externalRuntimes = [{ file: source.file, sha256: source.sha256, bytes: source.bytes,
            kind: "tool-executable", tool: "node", version: tool.version, executable: tool.executable }];
          normalizations.push({ family, externalRuntime: root.entry.externalRuntimes[0],
            scope: "original collector fingerprint; runtime binary is neither read nor copied nor reverified" });
          continue;
        }
        const covered = manifest.cases.filter((item) => item.provenanceRoot === root.id).some((item) => item.fixtureSources.some((ref) =>
          (ref.sourceFile ?? ref.file) === source.file && ref.sha256 === source.sha256 && ref.bytes === source.bytes));
        if (!covered) await retain(source, source);
      }
      for (const id of root.versions) {
        const row = rows(root.index, family).find((row) => row.id === id);
        ensure(row, `VERSION_NOT_INDEXED: ${family}/${id}`);
        const captureFile = row.capture?.file ?? row.receipt?.file ?? row.receipt ?? `captures/${id}/receipt.json`;
        const raw = await readFile(path.join(root.directory, captureFile)), receipt = JSON.parse(raw.toString("utf8"));
        const version = { id, capture: await put(`provenance/${root.id}/versions/${id}/receipt.json`, raw, captureFile) };
        for (const key of ["original", "stdout", "stderr"]) {
          const ref = (receipt.artifacts ?? receipt.streams ?? receipt)[key];
          version[key] = await put(`provenance/${root.id}/versions/${id}/${key}.log`, await checkedRead(path.join(root.directory, ref.file), ref), ref.file);
        }
        root.entry.versionCaptures.push(version);
      }
      root.entry.producerSources = [...refs.values()];
    }
    manifest.provenance = roots.map((root) => root.entry);
    if (family === "cargo") {
      const file = "provenance/lineage.json", bytes = await readFile(path.join(actor, file)), lineage = JSON.parse(bytes.toString("utf8"));
      const lineageRef = await put(file, bytes);
      for (const ref of [lineage.producer, ...lineage.index.parts]) await put(ref.file, await checkedRead(path.join(actor, ref.file), ref));
      const inspection = await put(lineage.inspection.file, await checkedRead(path.join(actor, lineage.inspection.file), lineage.inspection), "inspection-receipt.json");
      const afterSources = [];
      for (const id of ["failure", "warning"]) {
        const row = manifest.cases.find((item) => item.id === id), receipt = JSON.parse((await readFile(path.join(destination, row.capture.file))).toString("utf8"));
        const ref = receipt.fixtureSourcesAfter.find((item) => item.file === "Cargo.lock"), storage = `sources/${id}-after/Cargo.lock`;
        const artifact = await put(storage, await checkedRead(path.join(actor, storage), ref), ref.file);
        afterSources.push({ case: id, phase: "after", artifact });
      }
      manifest.cargoEvidence = { lineage: lineageRef, inspection, afterSources };
      normalizations.push({ family, evidence: manifest.cargoEvidence, sourceRecovery: lineage.sourceRecovery,
        recordedBeforeSatisfied: lineage.sourceRecords.find((record) => record.case === "full").recordedBeforeSatisfied });
    }
    await put("SOURCES.md", await readFile(path.join(actor, "SOURCES.md")));
    await put("manifest.json", Buffer.from(format(manifest)));
  }
  await writeFile(path.join(directory, "normalization-plan.json"), format({ schema: "hugr-lean/utility-normalization/1", corpusRoot, plan, origins, normalizations, seriesOrigins }), { flag: "wx" });
  const reviewScopes = [];
  for (const item of plan) {
    const bytes = await readFile(path.join(corpusRoot, item.family, item.file));
    ensure(bytes.length === item.bytes && hash(bytes) === item.sha256, `REVIEW_INVENTORY_CHANGED: ${item.family}/${item.file}`);
    let decodedLines = null, ranges = [];
    try {
      const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
      decodedLines = text.length === 0 ? 0 : text.split("\n").length - (text.endsWith("\n") ? 1 : 0);
      for (let start = 1; start <= decodedLines; start += 400) ranges.push([start, Math.min(start + 399, decodedLines)]);
    } catch { /* Binary source evidence is byte/hash-reviewed, never counted as zero lines. */ }
    reviewScopes.push({ ...item, decodedLines, ranges, review: decodedLines === null ? "binary source byte/hash evidence" : "decoded physical lines" });
  }
  await writeFile(path.join(directory, "review-scopes.json"), format(reviewScopes), { flag: "wx" });
  const corpus = await readUtilityCorpus(corpusRoot);
  const inventoryBytes = plan.reduce((sum, entry) => sum + entry.bytes, 0);
  ensure(inventoryBytes < 10 * 1024 * 1024, "NORMALIZED_CORPUS_EXCEEDS_10MB");
  const result = { directory, corpusRoot, cases: corpus.cases.length, families: corpus.families.map(({ family, cases, provenance }) => ({ family, cases: cases.length, provenance })),
    inventorySHA256: hash(Buffer.from(format(plan))), inventoryFiles: plan.length, inventoryBytes,
    largestFiles: [...plan].sort((a, b) => b.bytes - a.bytes).slice(0, 5),
    sourceScope: "stored publisher byte/hash snapshots; sourceHead binds recorded index declaration; external runtimes are original collector fingerprints, not locally reverified integrity" };
  await writeFile(path.join(directory, "reader-result.json"), format(result), { flag: "wx" });
  return result;
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    const result = await normalizeUtilityCorpus();
    process.stdout.write(format({ directory: result.directory, corpusRoot: result.corpusRoot, cases: result.cases,
      families: result.families.map(({ family, cases }) => ({ family, cases })), inventorySHA256: result.inventorySHA256,
      inventoryFiles: result.inventoryFiles, inventoryBytes: result.inventoryBytes, largestFiles: result.largestFiles }));
  }
  catch (error) {
    if (activeDirectory) await writeFile(path.join(activeDirectory, "failure.json"), format({ directory: activeDirectory, error: error.stack }), { flag: "wx" });
    process.stderr.write(`${activeDirectory ?? "normalizer"}: ${error.stack}\n`); process.exitCode = 1;
  }
}
