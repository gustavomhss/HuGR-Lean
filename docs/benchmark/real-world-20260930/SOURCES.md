# Sources and retained artifacts: 2026-09-30

This report summarizes native executions and mechanically checked evidence. It copies no upstream implementation or raw output body into the repository. Full captured outputs retain their source provenance and licenses in the external archive. Full commit pins below, not floating branches or local checkout names, identify the workloads.

## Authoritative project pins

| ID | Repository / exact commit | License | Inspected source paths |
| --- | --- | --- | --- |
| itoa | [dtolnay/itoa](https://github.com/dtolnay/itoa/tree/1577ed901354d0d7448ac162328f9dbf5183124c), `1577ed901354d0d7448ac162328f9dbf5183124c` | MIT OR Apache-2.0 | `Cargo.toml`, `src/lib.rs`, `tests/test.rs` |
| gjson | [tidwall/gjson](https://github.com/tidwall/gjson/tree/8d89927eff414537088a6092d53fecf6711c1e75), `8d89927eff414537088a6092d53fecf6711c1e75` | MIT | `go.mod`, `gjson.go`, `gjson_test.go` |
| boltons | [mahmoud/boltons](https://github.com/mahmoud/boltons/tree/4e5faa3d7e4008d89e0d8bf1ea87b6d9a061a16d), `4e5faa3d7e4008d89e0d8bf1ea87b6d9a061a16d` | BSD-3-Clause | `pyproject.toml`, `tox.ini`, `tests/test_iterutils.py` |
| ms | [vercel/ms](https://github.com/vercel/ms/tree/4ff48cec099f0514c3e9bbca18706c9c21122bfb), `4ff48cec099f0514c3e9bbca18706c9c21122bfb` | MIT | `package.json`, `pnpm-lock.yaml`, `jest.config.ts`, `src/index.test.ts` |
| ufo | [unjs/ufo](https://github.com/unjs/ufo/tree/f06c800d0c59f2a4a1b9ba65eb6cb61a84419be6), `f06c800d0c59f2a4a1b9ba65eb6cb61a84419be6` | MIT | `package.json`, `pnpm-lock.yaml`, `test/parse.test.ts` |
| hugr | [gmhelmold/HuGR-Lean](https://github.com/gmhelmold/HuGR-Lean/tree/69607794cbb2a3ce6707a509777ac648aa859bdd), `69607794cbb2a3ce6707a509777ac648aa859bdd` | MIT | `package.json`, `package-lock.json`, `src/core/types.ts`, `tests/core.test.ts`, `tests/runners.test.ts` |

`analysis.json.projects` records clone source, verified HEAD, clean-before-setup fact, license files and modifications. HuGR's clone source was the local repository; its authoritative source is the public commit above. License hashes below cover complete bytes at each pinned repository-relative path.

| Project | License path | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| itoa | `LICENSE-MIT` | 1,023 | `23f18e03dc49df91622fe2a76176497404e46ced8a715d9d2b67a7446571cca3` |
| itoa | `LICENSE-APACHE` | 9,723 | `62c7a1e35f56406896d7aa7ca52d0cc0d272ac022b5d2796e7d6905db8a3636a` |
| gjson | `LICENSE` | 1,077 | `be83ad53208d03a9fe08c7fac231cabf79422989ef5706bff217bd35104ebf07` |
| boltons | `LICENSE` | 1,497 | `c301912653a8d8c99eab6212aa3aea8d164ea249d8ad53c941e0558a0a5ac1e3` |
| ms | `LICENSE` | 1,079 | `ee765244e2d59f5234d474f62e0766fa0c8b99af967fdd4c0cb8dcb0c76ea224` |
| ufo | `LICENSE` | 1,078 | `46231df5a7733c3f52f11b71f3df61813007745b62b09031acfb45fb42d75082` |
| hugr | `LICENSE` | 1,066 | `f90e197430bd7cadc103298057009987a6806575c012f0c1729e3600b7642092` |

## Modification record

- itoa: setup resolves its untracked library `Cargo.lock`, SHA-256 `113f7068559ec3c1b07d52c5cdbb482c56d179c5c030c343b2019e2caca9b865`; cold preparation runs `cargo clean`. The compile-failure control appends marked code to `src/lib.rs` and restores original bytes.
- gjson: cold preparation runs `go clean -cache -testcache`. The failure control adds `bench_expected_failure_test.go`, then removes it.
- boltons: the failure control adds `tests/bench_expected_failure_test.py`, then removes it. The doctest command follows `tox.ini`, substituting the source-checkout package path for the installed path.
- ms/ufo: frozen-lock dependency installation modifies `node_modules`; lifecycle policy and full setup logs are retained. ms's upstream prepare runs Husky and modifies `.git/config`/`.husky/_`; no hook-disabling flag/environment is used. ms declares pnpm 10.33.0, actual pnpm is 10.33.2; ms/ufo lock SHA-256 values are `1bb5dc693d48bf1e067950d6048ae154503b42ecb2d82920f563cc1c255c411f` / `330cbc5239289059a81a6e514c847207450c590e7f3e9ac29847657f5dd7f9b6`. ufo's blocked dependency-build warnings remain visible.
- ms/ufo failures add `src/bench-expected-failure.test.ts` / `test/bench-expected-failure.test.ts`, then remove them. All five failure controls use `BENCH_EXPECTED_FAILURE`; they are controlled changes, not upstream failures.
- hugr: mixed-status control appends to `README.md` (staged) and `PLAN.md` (unstaged), creates `bench-untracked.txt`, then restores files/index. Build/test-generated files are setup/execution products, not new source pins.
- Host: archive the pinned HuGR tree `f4c116334c111a20f5686372e96db51a066fcb33`, verify identical snapshot tree, append README diff evidence, stage `host-staged-café.txt`, create `host-untracked-🔥.txt`. Snapshot commit `97f18862cb5e4aea034620ca91893d6e66056cc2` is a local reconstruction, not an upstream pin. Cargo projects unchanged `fixtures/runners/native/{Cargo.toml,main.rs}` into the native command cwd (MIT, pinned HuGR commit above); stress creates 1,800 untracked Git entries. Both are controls.

## Published bundle and retained inventory

Download the [evidence archive](https://github.com/gmhelmold/HuGR-Lean/releases/download/v0.2.0/hugr-lean-real-world-20260930.tar.gz) and [checksum](https://github.com/gmhelmold/HuGR-Lean/releases/download/v0.2.0/hugr-lean-real-world-20260930.tar.gz.sha256). Archive SHA-256: `ce98ba7e6f0a6f26d67c861184e93f3ed53a22072f4b0419697a0d7d0c5017b7`; size: 2,242,474 bytes. The top-level `manifest.json` inventories 638 files; `verify.mjs` validates retained observations against harness commit `29d2b562ac23bf51a3e83c7afa4c4ac1bd4154ed`. A fresh public download passed checksum and read-only verification. Complete project licenses, HuGR donor notices, setup logs and generated lockfiles are included. Checkouts and dependency caches are replaced by fresh provisioning for native reproduction.

The root below is the historical producer's machine-local storage, **not a public URL**. The bundle retains the inventory's root-relative layout and original absolute paths as metadata:
`/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode/`.

| Root-relative file | Role | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| `lean-native-results-20260930/report.json` | Original failed capture/timing report, retained | 103,606 | `178addef6929ab3b89f1112ab65986499565b9c51a86214d028402a5b8678e7b` |
| `lean-native-results-20260930/analysis.json` | Same captures, calibrated oracle; later inspection at 23:18:47.518Z | 106,959 | `27de9b5deaebe31fc1e318b39de01841020ca32fe39841a47499914df9ab0afb` |
| `lean-native-results-20260930/replay.json` | Corrected actual core/raw-off adapter timing | 76,414 | `3b30b232d1cd63755215659aa8bbbd0abf7d2010f6aa20c03305347fcffa2ad7` |
| `lean-host-native-final-all-20260930/report.json` | Seven native OpenCode scenarios | 213,804 | `e29dd054523825e680f274aa1f5018f75b6734927dfc1347c656d330e4eb6fb8` |
| `lean-host-review-controls-20260930/report.json` | Two native strict-oracle control rechecks | 13,084 | `7ddf98fee7f0c67c5b9f46fe5f38afaacecb8ab9200119215f39a04fdb9f9d9c` |
| `lean-workloads-prepared-20260930-final/catalog.json` | Prepared source/license/tool/setup catalog | — | `7fa1044f48ac83dc1536d92d75ee830852e942870a9bbf88d8bea0f4dcb22151` |

Native case directories are `lean-native-results-20260930/cases/{id}/`: `capture.json`, `result.json`, `original.txt.gz`, `filtered.txt.gz`, `stdout.txt.gz`, `stderr.txt.gz`. SHA-256/byte counts describe **decompressed bytes**; all four gzip files per case were decoded and rehashed. `summary.json` references original/filtered digests; the full analysis also records separate stream digests. Original failures and the outer-timeout resumption remain in the capture report.

The initial analysis digest was `e86787ff20f75c80098a24ed8e66a38b88bf54b564b5f1e487a855e45535acd1` at `2026-09-30T21:43:32.587Z`. Publication verification proves that only `inspectedAt` changed: a separate timestamp-restored copy matches that complete-file digest exactly. The bundle adds `lean-native-results-20260930/analysis-20260930T214332587Z.json` (106,959 bytes, initial digest above) as an explicitly reconstructed historical metadata snapshot; the later machine-local `analysis.json` is not overwritten.

Host case directories contain `observer.jsonl`, `host-result.json`, `original.txt`, `model.txt`, host stdout/stderr and `record.json`; stress also retains `native-full.txt`. The observer records before/after facts and the second model request is checked independently. SDK bootstrap uses pinned `@opencode-ai/plugin@1.18.17`; installed lock SHA-256 is `d1429c36cfa92a03e035cf1dfdb8cca64330fc78558cec9a446bf0246d66c5dc`. Setup logs live under the prepared catalog's `setup-logs/`. Large output bodies are published in the external archive and excluded from this small package.

## Producer and instrument lineage

Report branch base: HuGR-Lean `72071a05a6a066d5c8ebf286f3f001da4e8e9d9e`; workload application pin: `69607794cbb2a3ce6707a509777ac648aa859bdd`, version 0.2.0. Capture/reanalysis/replay integration is lead-owned. Inspected local corrected-source fingerprints below identify verifier/method source, not a claim that these uncommitted files were already published or that current recorder fixes recover past load metadata:

- `lean-real-bench/scripts/real-world/evidence.mjs`: SHA-256 `108a8734f0a300a737c00af00d7635d1c1272d4c2b28634fb18a0d794fa132a3`.
- `lean-real-bench/scripts/real-world/measure.mjs`: SHA-256 `5ee5d6125a5c43552de2adc75d466610a8c382e6fe7c786ac77e3849ab5ff881`.
- `lean-real-bench/scripts/real-world/replay.mjs`: SHA-256 `46c7ded19f65d0726effa87a0e71b1a0660ed29aa3e003ead2bad9c990da9c5f`.

The Jest correction admits the native slow-suite `(9.068 s)` annotation while still requiring failed identity, assertion diagnostics and native failed totals. The timing correction removes large metadata cloning from the timer, with unchanged captures/outputs. Published replay load values remain copied original-capture values, not measured replay-time load. Raw bodies, production filters and original failed verdicts are retained; only reporting/oracle/method interpretation is corrected.
