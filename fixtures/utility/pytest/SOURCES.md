# Frozen native pytest acceptance corpus

Acceptance stage only. Parser scaffold: `d5ec6daa5728d49df3e6f76a75ae0b7c1ede3c9f`.
Authority: private `UTILITY-AUTHOR-CONTRACTS-2026-10-07.md`, common/pytest clauses;
`UTILITY-WAVE-PLAN-2026-10-07.md`, frozen schema and acceptance spine.
Lead clarification additionally retains original filename progress line 7 in default-shaped cases.

## Provenance and exact copies

Original local MIT fixture programs; no copied donor material. Exact LICENSE snapshots included.
Main immutable root: producer worktree `.native-captures/pytest/prep-fHWQpI`.
Producer HEAD: `8eb1600703096cf2c23348e159ad1daa82f8b580`.
Producer: `scripts/utility-native-pytest.mjs`, SHA-256
`56e4f3dc2296ca12bb4db36446de605d38f97fb91ddc6132f4f89418fb03bf1e`.
Private index reference SHA-256: `fd62178eaa08e6d711c16bd8ac768b9ad6b220fb4c38e1099857315da0250f49`.
Supplement: same parent, `extra-r2b4ph`; HEAD `a8068deb32e8ce9b88dd28a6b2a753765eabfdcf`.
Producer: `scripts/utility-native-pytest-extra.mjs`, SHA-256
`d2e3353714322b548096a1159d5bc523983de946eae1b7ba96d907be339ca473`.
Private index reference SHA-256: `8accd91cab35e4cdd46a5d6ea1e5210e5d0534a607fe9b1645688b6470aa3d1c`.
Every indexed source snapshot was checked against its bytes/hash, including uncopied producer helpers.
Inventory hashes use producer's pretty JSON plus newline, not compact JSON.
These private index/inventory references are contextual pins, not mapped artifact proofs.
Manifest drops unmapped top-level provenance hashes. Final metadata/EVAL review must define
actual index artifact descriptors and mapping before claiming index/source-inventory binding.
Top-level producer applies to main cases; only literal-path/doctest-path override case producer,
matching their unmodified receipts. Executed source snapshots remain descriptor/hash-guarded.

Each case copies original/stdout/stderr and its complete receipt byte-for-byte.
Receipt facts remain nested under `facts`; receipts retain all capture/version/environment data.
Source relocation: original `projects/...` becomes `<root-name>/projects/...` to preserve both
versions of `test_native.py`. Manifest `sourceFile` retains receipt-relative original name.
No receipt, original stream, source or license rewriting. All payload hashes in manifest.
Producer scripts and full private indexes remain private, pinned above; no historical/native rerun.
Preexisting failed preparation evidence remains in private producer roots.
Supplement modification is producer-owned: prepend 57-byte passing-doctest docstring, shift
warning/skip source lines by five, preserve suffix bytes. Both executed snapshots copied exactly.

## Independent KEEP and bytes

Python 3.14.5, pytest 9.0.3, pluggy 1.6.0; built-in subtests, plugin autoload disabled.
Original commands, cwd, executable/module hashes and versions remain in full receipts.
Expected files derive from inspected raw lines and frozen KEEP, never production reduce/filter.
Line numbers below are one-based; manifest anchor occurrence numbers are zero-based in original.

| Case | Native command | KEEP | Input / expected / saved UTF-8 bytes | Material |
| --- | --- | --- | --- | --- |
| default | `pytest` | 2–4,7,23,25–33 | 2422 / 1118 / 1304 | yes |
| quiet | `pytest -q` | 17–27 | 2181 / 901 / 1280 | yes |
| literal-path | `pytest test_native.py --color=no` | 2–4,7,23,25–33 | 2424 / 1120 / 1304 | yes |
| doctest-path | `pytest --doctest-modules test_native.py --color=no` | 2–4,7,23,25–33 | 2424 / 1120 / 1304 | yes |
| assertion-failure | `pytest` | whole original, exit 1 | 1202 / 1202 / 0 | no |
| opaque-summary | `pytest` | whole original, exit 0 | 539 / 539 / 0 | no |

Material means saved >=1024 bytes AND >=10% input, computed from independent expected files.
Every nonempty retained noise line is anchored: default/literal/doctest 13 each; quiet 10.
Warning section's internal blank remains in expected bytes. Quiet ordinary skip really has
`SUBSKIPPED(case='skip')` label; preserved verbatim. Filename row anchors wrapped skip association.
Native Unicode survives exactly; offsets are UTF-16, all size metrics UTF-8.

## Review and remaining proofs

`tests/utility-pytest.test.ts` checks default registry plus private `pytestProfile.reduce`;
independent oracle requires both declared and emitted source coverage, not replacement equality alone.
Oracle controls reject declaration-only deletion, emit-only deletion, forged text and wrong occurrence.
Native declaration/emission mutants activate after grammar admits captures; baseline declines them.
Current-format/negative tests require accepted native positive in the same test before mutations.
Independent native-exact facts, corpus/digest and oracle controls may already pass baseline;
not red-to-green claims. Acceptance counts/checkpoint records belong in private acceptance proof,
not closed native inventory. Earlier proof contents remain preserved in Git checkpoint `3e24392`.
Native assertion output's trailing spaces are intentional.
Synthetic early quiet subtests distinguish parent-based percentages from counting `u`/`-`.
No parser, core, dependency or legacy-golden edit in this checkpoint.
Independent suite review precedes implementation; count-guard mutation and restored production green,
compiled/installed/host proof, combined inventory, PR/Actions and integration remain lead-stage work.
