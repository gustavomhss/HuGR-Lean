# Native Cargo utility acceptance corpus

Original local HuGR-Lean fixture programs, MIT; no donor material. Native baseline:
`882585e5f916821a482d14bc7bfe7d6a102b772a`; parser scaffold:
`d5ec6daa5728d49df3e6f76a75ae0b7c1ede3c9f`. Cargo implementation checkpoint: `84921de`.

Immutable native root: `/Users/gustavoschneiter/Documents/HuGR/_worktrees/hugr-lean-utility-cargo-native/private.native-captures/cargo-AAzRUV`.
Full originated at `captures/full/`; lib/failure/warning at `remaining-Ak3JfQ/captures/<id>/`.
Stored original/stdout/stderr/receipt bytes match native files exactly, including native blank EOF rows.
Historical absolute cwd/executable/header strings are provenance, never reader filesystem dependencies.
`manifest.json` binds receipt hashes, direct receipt facts, tool versions, relocated sources and independent expected logs.
`sourceFile` preserves each original receipt-relative source name; `file` is safe family-local storage.
Unchanged library sources share `sources/full/`; lib uses its distinct generated-comment lock in `sources/lib/`.
Control before/after locks occupy distinct `sources/<id>/` and `sources/<id>-after/` paths.

Full producer: `scripts/utility-native-cargo.mjs` at `582784f752f1d827a460dbab063c0423628d7c09`,
SHA-256 `a2996b182210fee3a591edb7e60b15f9979402b48021a3e687ca53cf0bca27da` (13,502 bytes).
Continuation producer: `scripts/utility-native-cargo-remaining.mjs`, SHA-256
`d44dab595c62ec26d8184f8a3df48f499004ae391d845f70db9272cbb5eedf2f` (13,924 bytes).
Corrected collector SHA-256 `eac558ce29c3bf8e028d9a40bb25e095426bfb1c5a6d7af40453923149dfb218` (13,509 bytes).
Receipts preserve helper hashes, runtime Node v22.17.1, isolated environment and spawn/exit/cleanup facts.
Cargo 1.98.0, rustc/rustdoc 1.98.0; exact versions/executables remain in manifest and receipts.

Original blocked `capture-index.json` stays privately byte-exact at native root, SHA-256
`9f16140d5d3aa8f9f5169e1c3322d3ac236232554424caf5318aaeb46c5b378c`.
Completion index stays privately at `remaining-Ak3JfQ/completion-index.json`, SHA-256
`402082179ceb609008ee111606daad26a356b2b668a34c5e2cbcb5144c4bdf0e`; it binds unchanged prior captures.
Copied `full/inspection-receipt.json` preserves collector exit 1 / `NATIVE_MINUTE_DURATION_MISSING`.
Native full exited 0, complete, with genuine `2m 01s`; collector wrongly demanded literal `1m`.
Continuation did not recapture full or rerun the 61-second cold build.rs sleep. Delay is not filter latency or representative build performance.

Full lock before: `source-snapshots/Cargo.lock`, reconstructed by producer inspection from pinned literal;
this is reconstructed source evidence, NOT a file snapshot recorded before native full execution.
SHA-256 `c979d625775116140efcb86e25b0785f3959ce3cc8660f5a969b7d0d5d38c0cb` matches original receipt.
After full / before and after lib: `37c075e3a501a668c75cbbf0831ab4a084f28ab26f763bd2b9b605262da58908`.
Stored after-full bytes are the actual later sources-before/lib file; inspection binds its hash to post-full state.
Cargo added two generated-file comments. Failure/warning locks changed likewise; both snapshots copied, never substituted for receipt-bound before versions.

Independent full keep: 1-based lines 2,3,6,15,17,28,30,35; lib keep: 1,2,5,14.
Finished, executable/doc suite context, ignored identity/reason and every summary remain exact source-backed evidence.
Full expected: 914 UTF-8 bytes from 2,931; saved 2,017 (68.82%), material true.
Lib expected: 478 from 1,375; saved 897 (65.24%), material false. Family threshold: at least one native case saves >=1,024 bytes and >=10%.
Compiler-warning output and native failure (exit 101, including deliberately incorrect exit 0 observation) remain whole-output exact.
Mutation/CRLF/Unicode/malformed cases are in-memory supplemental controls, not rewritten native captures.

## Source provenance artifact schema
`provenance/original-producer.mjs` preserves all 13,502 original pinned bytes, MIT, no modifications.
It is inert evidence, never imported/executed. Tests parse its `sources["Cargo.lock"]` string with TypeScript AST.
Producer `writeProject` writes each source literal and immediately reads/hashes its file (lines 52–61);
full capture receives that recorded inventory (lines 169–174). No pre-full byte-copy operation exists there.
Private `source-snapshots/Cargo.lock` explicitly documents later reconstruction, not an original before-file copy.
Only lock metadata is reconstructed; runtime Rust fixture files are actual files matching recorded native source hashes.
`provenance/lineage.json` has typed sourceRecord origin/producer/originalExpectedHash labels.
Source-name/label tests forbid extending reconstruction to Rust or calling the full lock `recorded-before`.
Original failed collector index is preserved as three byte-exact consecutive line fragments (250/250/257 rows);
ordered concatenation is the original 41,526-byte JSON, bound to the independently hashed inspection receipt.
Tests bind index full record to untouched raw receipt, then to raw streams/source inventory, and preserve collector failure facts.
Per-case optional producer identifies actual full versus continuation actor; corrected collector identity remains untouched receipt metadata.
Recovered producer-literal source conformance is explicitly accepted for Cargo.lock metadata only;
`recordedBeforeSatisfied:false` remains factual. Recovery is not a reconstructed native capture.
Hash equality does not turn recovered bytes into a recorded-before file snapshot.

`provenance/lineage.json` uses `hugr-lean/cargo-lineage-proof/1`. Stored artifact paths are Cargo-family-relative.
Artifact descriptors contain `file`, `sha256`, `bytes`; producer adds pinned `sourceFile`, `commit`, `license`, `modifications`.
`inspection` binds the exact native `full/inspection-receipt.json` artifact.
`index` has `sha256`, `bytes`, ordered `parts: Artifact[]`; concatenation must match the inspection receipt's index digest.
Each `sourceRecords` entry has `case`, `sourceFile`, `origin`, `originalExpectedHash`, `recordedBeforeSatisfied`;
`reconstructed-producer-literal` additionally requires a producer artifact descriptor and is limited to full Cargo.lock.
Other locks use `recorded-before`; runtime Rust files stay actual hash-matched source evidence.
`fullAfterStorage` maps `file`, `sourceFile`, `origin`, `receipt`, `inventory` to an actual receipt source descriptor.
`sourceRecovery` records the accepted lock-only recovery semantics; `runtimeRustSources` describes source inventory origins.
Formal EVAL optional manifest `provenance` and typed SourceIndex mapping await the lead's frozen source contract.
Integration must bind lineage and inspection roots as file/hash/byte descriptors, not hash-only claims.
