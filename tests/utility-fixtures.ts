import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
// @ts-expect-error Developer-only authenticated reader has no published declarations.
import { readUtilityCorpus } from "../scripts/utility-corpus.mjs";
import type { Observation, Span } from "../src/types.js";

export type Family = "go" | "pytest" | "cargo" | "node";
export type Artifact = { file: string; bytes: number; sha256: string; sourceFile?: string };
export type Anchor = { text: string; occurrence: number };
export type NativeCase = {
  id: string; profile: string; command: string; role: "noise" | "exact";
  expectedStatus: "reduced" | "passthrough"; exitCode: number; complete: boolean;
  signal: null; timedOut: boolean; material: boolean; provenanceRoot: string;
  producer?: { script: string; sourceSHA256: string }; sourcePhase?: "before" | "after";
  capture: Artifact; original: Artifact; stdout: Artifact; stderr: Artifact; expected: Artifact;
  fixtureSources: Artifact[]; required: Anchor[];
};
type Series = { bytes: number; sha256: string; parts: Artifact[] };
type Provenance = {
  id: string; sourceHead: string; producer: { script: string; sourceSHA256: string };
  index: Series; sourceInventory: Series; producerSources: Artifact[];
  versionCaptures: { id: string; capture: Artifact; original: Artifact; stdout: Artifact; stderr: Artifact }[];
};
export type Manifest = {
  schema: string; family: Family; cases: NativeCase[];
  tools: { name: string; version: string; executable: string; lockedIntegrity?: string; installation?: string }[];
  producer: { script: string; sourceSHA256: string }; provenance: Provenance[];
};
type VerifiedCase = Omit<NativeCase, "required"> & {
  family: Family; qualifiedID: string; originalText: string; expectedText: string;
  observation: Observation; captureReceipt: Record<string, any>;
  required: (Anchor & { sourceSpan: Span; expectedSpan: Span })[];
};
type Corpus = { cases: VerifiedCase[]; families: { family: Family }[] };
const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

// Frozen from integration 6a10e6e's original manifests, before metadata normalization.
// Neither parser output nor candidate metadata may change these native raw/golden pins.
const originalPins: readonly (readonly [string, number, string, number, string])[] = [
  ["go/cold", 3228, "187733d835e0cb98c79621629e6f6ce4dc9da222951cf1af48deecccac10227f", 632, "e163bee7e5496762206c08cff46df15e5ac85470620acefb572fa12da569b8a3"],
  ["go/cached", 3231, "63a5e9863360b852859f53b146697ed4077be32c3bd8bc543d285a598d0d9c76", 635, "ab7d1936b0a53497750694c6577542955ee4c82fd67a7bcd2140a9ac20158e8e"],
  ["go/failure", 270, "3dfec663bb89598afb9a270557f2e80c46f53bc251cef940a83fc3f67a172e2c", 270, "3dfec663bb89598afb9a270557f2e80c46f53bc251cef940a83fc3f67a172e2c"],
  ["go/diagnostic", 232, "8a1edcaebcd23b6f98f14e03d0910f9128ca7066471daf2188eb5ca6f948fff7", 232, "8a1edcaebcd23b6f98f14e03d0910f9128ca7066471daf2188eb5ca6f948fff7"],
  ["go/opaque", 228, "55ddb13f7cb23b17397957938990c52e9702cc5ba39ade80feeac2d7e55518ae", 228, "55ddb13f7cb23b17397957938990c52e9702cc5ba39ade80feeac2d7e55518ae"],
  ["pytest/default", 2422, "19a7b3fab0019f50d88ac9a4da0ca0fc3b9ccf01c3bbcbb5fc2e31a3c979e870", 1118, "0e1d8c62373a96e76ffef4058a8c12c4eaa0c11090cef4293394663a63892df9"],
  ["pytest/quiet", 2181, "ee3768cf4adad099dc83e1877bc831ceb2e8b34a56aa85d167ec03ebb61b3270", 901, "601a0189693d0e6f50e7a99dba525fa6481a7898da3c7a83140bd400863227ab"],
  ["pytest/assertion-failure", 1202, "5d5bb83b6c3015faa7af02f6bc0f8ee0f609482cede4483259c2aafbddb133fd", 1202, "5d5bb83b6c3015faa7af02f6bc0f8ee0f609482cede4483259c2aafbddb133fd"],
  ["pytest/opaque-summary", 539, "f7eca5e15b29198860311cecbd8a3168df3f23443d5334bd10a1953b7d45da19", 539, "f7eca5e15b29198860311cecbd8a3168df3f23443d5334bd10a1953b7d45da19"],
  ["pytest/literal-path", 2424, "31c0ef22e3224135dac4b5e01e93ea8ef6158a81826c0b5a7e364e42281924ca", 1120, "4bf3d24f02fc64b43ff52dc87bc85ed3f2e13f87fc62ab9e517237b4c8b89333"],
  ["pytest/doctest-path", 2424, "22cd15117ffb1bf73340c0977010845bd3b4a8a53d26f1d75b70a3e41e21da94", 1120, "43285a8fece407ddf4df9a5b16f326dc7dc3657d043f204cb0d1fba4990ab55b"],
  ["cargo/full", 2931, "de588a236150859c4fa563f6a735fc350a451f3ad04f94d397c966387c452762", 914, "89901d0d96daaba3fb28a2dff07ce6939dc8a9a7572ea4cc831e12c972ffae73"],
  ["cargo/lib", 1375, "23bc946303cdfbadf1f8aeaeb3f85e809a7dcf2e5fe7d7ec548e0c3870e67f18", 478, "e410624f62c738f76ac96252a37fb6b88fb9b07e608f13c201aa23814bd71fa4"],
  ["cargo/failure", 642, "d58e0b3e09316da82c38cb4a26e50234aaea8a7bd386f7bb87f303c040d1f685", 642, "d58e0b3e09316da82c38cb4a26e50234aaea8a7bd386f7bb87f303c040d1f685"],
  ["cargo/warning", 1226, "5b6c11654de17ab77137edfe98f5d41abb410170711d9a3964c974f3192a0f0c", 1226, "5b6c11654de17ab77137edfe98f5d41abb410170711d9a3964c974f3192a0f0c"],
  ["node/node-flat-default", 5132, "d3366f5dc12861d5130a600efb07f5ce953ddde804f7697e5b4f71620738965f", 123, "b880a886b86c44b53e057e961be73993086e700e1fa352d602c74c299d6215c8"],
  ["node/tsx-flat-default", 5133, "f4e9c75fade116ed3bd334d1277ffb5929f6290cd790d7babd84f35ce871863b", 123, "8afa21d7918d1402390bb85e58d77aaf1844ef26532fd3c78216394b6a877426"],
  ["node/node-nested-default", 6197, "fba98ce35f044dfce86d057023ae2dbcb62f27165f697a2cda8a9d83e4fe7453", 792, "9131f552afbe60fef5553d421d0ddd20a2cb9832ec5281253edb093a388f4492"],
  ["node/tsx-nested-default", 6198, "8960a731db04b76cd358b82b96d559cef02982d2ec6d6899b35fd2801b5a8bf6", 792, "5122bc1babf616f26cf642328cb364c647a59c1e61daeaa73abba3eee146f1b0"],
  ["node/node-failure-default", 1114, "efe8690a6975a5ea78d32541d7e602698389bdb7ae6c2917bc6bfabebaa429fa", 1114, "efe8690a6975a5ea78d32541d7e602698389bdb7ae6c2917bc6bfabebaa429fa"],
  ["node/tsx-failure-default", 1114, "1f2c64f66fc85d7467a067b80db555eb8c24b5a4981ba8c8a2174054a47d820d", 1114, "1f2c64f66fc85d7467a067b80db555eb8c24b5a4981ba8c8a2174054a47d820d"],
  ["node/node-opaque-default", 349, "063f2fc7525f742b39b317372d3462d3e24aacd2be6efd7114d443194ab5f870", 349, "063f2fc7525f742b39b317372d3462d3e24aacd2be6efd7114d443194ab5f870"],
  ["node/tsx-opaque-default", 348, "c0edc04bdec1823bcb63ab78fe8d5ab74ebaff7865399a694433324840d16e99", 348, "c0edc04bdec1823bcb63ab78fe8d5ab74ebaff7865399a694433324840d16e99"],
  ["node/node-diagnostic-default", 296, "e8829fa9be4afe615fda7f1a65d139e367995b355998f11d8c49cc3851d049ac", 296, "e8829fa9be4afe615fda7f1a65d139e367995b355998f11d8c49cc3851d049ac"],
  ["node/tsx-diagnostic-default", 296, "db778cd75272ca2764522805021b4d829b18f043c99273652bc79cd661607f34", 296, "db778cd75272ca2764522805021b4d829b18f043c99273652bc79cd661607f34"],
].map(pin => Object.freeze(pin as [string, number, string, number, string]));
Object.freeze(originalPins);

type Mutation = {
  manifest: Manifest; item: NativeCase; receipt: Record<string, any>;
  read: (file: string) => Promise<Buffer>;
  write: (ref: Artifact, value: string | Buffer) => Promise<void>;
};
function freeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
async function createUtility(root: string) {
  const corpus = await readUtilityCorpus(root) as Corpus;
  assert.deepEqual(corpus.families.map(row => row.family).sort(), ["cargo", "go", "node", "pytest"]);
  assert.deepEqual(corpus.cases.map(row => row.qualifiedID).sort(), originalPins.map(pin => pin[0]).sort(), "frozen native case inventory");
  const cases = new Map(corpus.cases.map(row => [row.qualifiedID, freeze(row)]));
  const manifests = new Map<Family, Manifest>();
  for (const { family } of corpus.families) manifests.set(family,
    freeze(JSON.parse(readFileSync(path.join(root, family, "manifest.json"), "utf8")) as Manifest));
  for (const [id, rawBytes, rawHash, goldenBytes, goldenHash] of originalPins) {
    const row = cases.get(id)!;
    assert.deepEqual([row.original.bytes, row.original.sha256, row.expected.bytes, row.expected.sha256],
      [rawBytes, rawHash, goldenBytes, goldenHash], `immutable native raw/golden pins: ${id}`);
  }
  const utility = {
    root,
    manifest(family: Family): Manifest { return manifests.get(family)!; },
    case(family: Family, id: string): VerifiedCase {
      const row = cases.get(`${family}/${id}`); assert.ok(row, `missing native case ${family}/${id}`); return row;
    },
    read(family: Family, file: string): Buffer {
      return readFileSync(path.join(root, family, file));
    },
    series(family: Family, ref: Series): Buffer {
      const data = Buffer.concat(ref.parts.map(part => readFileSync(path.join(root, family, part.file))));
      assert.equal(data.length, ref.bytes, "series byte pin"); assert.equal(hash(data), ref.sha256, "series hash pin"); return data;
    },
    async probe(family: Family, id: string, mutate: (copy: Mutation) => void | Promise<void>): Promise<void> {
      const temp = await mkdtemp(path.join(os.tmpdir(), "hugr-utility-teeth-"));
      try {
        await cp(root, temp, { recursive: true });
        const directory = path.join(temp, family), manifest = structuredClone(manifests.get(family)!);
        const item = manifest.cases.find(row => row.id === id)!;
        const read = (file: string) => readFile(path.join(directory, file));
        const receipt = JSON.parse((await read(item.capture.file)).toString("utf8"));
        const originalReceipt = JSON.stringify(receipt);
        const write = async (ref: Artifact, value: string | Buffer) => {
          const data = Buffer.from(value); await writeFile(path.join(directory, ref.file), data);
          ref.bytes = data.length; ref.sha256 = hash(data);
        };
        await mutate({ manifest, item, receipt, read, write });
        const changedReceipt = JSON.stringify(receipt);
        if (changedReceipt !== originalReceipt) await write(item.capture, changedReceipt);
        await writeFile(path.join(directory, "manifest.json"), JSON.stringify(manifest));
        // Always the real root reader, with all four families; never a weaker private schema checker.
        await createUtility(temp);
      } finally { await rm(temp, { recursive: true, force: true }); }
    },
    async descriptorTeeth(family: Family, id: string): Promise<void> {
      // Normal authenticated metadata is the positive control, not a smaller mock schema.
      assert.ok(cases.has(`${family}/${id}`));
      assert.equal(await loadUtility(root), utility, "same-root reader preload must be cached");
      await utility.probe(family, id, () => {}); // Copied all-family root also accepts before each mutant matrix.
      await assert.rejects(utility.probe(family, id, async ({ item, read, write }) => {
        const golden = await read(item.expected.file);
        await write(item.expected, Buffer.concat([golden, Buffer.from("\n")]));
      }), /immutable native raw\/golden pins/, "valid-SHA golden rewrite must fail independent frozen pins");
      await assert.rejects(utility.probe(family, id, ({ item }) => {
        Object.assign(item, { unsupportedMetadata: true });
      }), /UNKNOWN_FIELD/);
      await assert.rejects(utility.probe(family, id, ({ item }) => {
        item.producer = { ...manifests.get(family)!.producer, sourceSHA256: "0".repeat(64) };
      }), /PRODUCER_MISMATCH/);
      await assert.rejects(utility.probe(family, id, ({ manifest }) => {
        manifest.provenance = [];
      }), /EMPTY_OR_INVALID_LIST/);
      const refs = (item: NativeCase) => [item.capture, item.original, item.stdout, item.stderr, item.expected, item.fixtureSources[0]!];
      for (let index = 0; index < refs(cases.get(`${family}/${id}`)!).length; index++) {
        for (const [delta, error] of [
          [{ bytes: -1 }, /INVALID_DIGEST_DESCRIPTOR/],
          [{ sha256: "0".repeat(64) }, /ARTIFACT_DIGEST_MISMATCH/],
          [{ file: "../escape.log" }, /UNSAFE_PATH/],
        ] as const) await assert.rejects(utility.probe(family, id, ({ item }) => {
          Object.assign(refs(item)[index]!, delta);
        }), error);
      }
      await assert.rejects(utility.probe(family, id, ({ item }) => {
        item.original.sourceFile = "wrong/original.log";
      }), /RECEIPT_ARTIFACT_MISMATCH/);
      await assert.rejects(utility.probe(family, id, ({ item }) => {
        item.fixtureSources[0]!.sourceFile = "wrong/source.mjs";
      }), /SOURCE_MAPPING_MISMATCH/);
      await assert.rejects(utility.probe(family, id, ({ item }) => {
        item.provenanceRoot = "missing-root";
      }), /MISSING_PROVENANCE_ROOT/);
      await assert.rejects(utility.probe(family, id, ({ item }) => {
        item.required[0]!.occurrence = 999999;
      }), /MISSING_SOURCE_ANCHOR/);
      for (const field of ["producerSources", "versionCaptures"] as const)
        await assert.rejects(utility.probe(family, id, ({ manifest }) => {
          const root = manifest.provenance.find(root => root.id === cases.get(`${family}/${id}`)!.provenanceRoot)!;
          const ref = field === "producerSources" ? root.producerSources[0]! : manifest.provenance.flatMap(root => root.versionCaptures)[0]!.capture;
          ref.sha256 = "0".repeat(64);
        }), /ARTIFACT_DIGEST_MISMATCH/);
    },
  };
  return Object.freeze(utility);
}
const cache = new Map<string, ReturnType<typeof createUtility>>();
export function loadUtility(root = process.env.HUGR_UTILITY_ROOT ?? fileURLToPath(new URL("../fixtures/utility/", import.meta.url))) {
  root = path.resolve(root);
  let loaded = cache.get(root);
  if (!loaded) { loaded = createUtility(root); cache.set(root, loaded); }
  return loaded;
}
