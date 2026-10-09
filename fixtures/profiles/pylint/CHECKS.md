# L06 implementation checks

Frozen capture checkpoint: `15e25d7aa91bb382772a5c6b90d288592d8a3b1a`, parent
`71bcaea2d5f0bf72e9128ebf80517ad1099f6cdd`. This receipt covers only owned profile/test/fixture work.

## Native baseline red -> selected-profile green

Acceptance: `L06 native canonical candidates match independent captured goldens`.
Before implementation, the native acceptance ran with no selected profile: exit 1,
`json-exit-zero: no_profile`, expected `reduced`, actual `passthrough`.
After implementation, the same named acceptance passed with `profiles: [pylintProfile]`.
Also replayed the actual unchanged default registry (temporarily removing only test helper's explicit
profile list): same native acceptance failed with `json-exit-zero: no_profile`. Restored selected profile,
reran that same test, passed. Default registry was never edited; production routing remains lead-owned.
Four original native inputs exactly match independent preimplementation lexical-scanner goldens,
including diagnostic/metric token order, spelling and terminal LF: 361 + 241 + 746 + 546 = **1,894 bytes**.
The fifth clean JSON2 candidate remains exact because native `10.0` is noncanonical under frozen helper.

Command for each baseline/red/green replay:

```sh
npx --no-install tsx --test --test-name-pattern='^L06 native canonical candidates match independent captured goldens$' tests/profile-pylint.test.ts
```

## Focused iteration

Ran only new/changed names, using this initial batch (10 passed, zero skipped):

```sh
npx --no-install tsx --test --test-name-pattern='^L06 (native canonical|witnessed finite|closed distinct|diagnostic categories|ranges require|JSON2 counts|duplicate keys|metadata and|UTF16 token|terminal whitespace)' tests/profile-pylint.test.ts
```

After four safe manifest promotions, ran only
`^L06 manifest binds immutable native sources hashes metadata and dispositions$`: passed.
After adding same-path absolute-source consistency, ran only
`^L06 diagnostic categories codes strings and source associations stay coherent$`: passed.

## Destructive mutations: each red, restored same name green

All mutations affected only owned `src/profiles/pylint.ts`, were individually restored, and reran only
the corresponding protecting acceptance. No shared helper mutation or whole-suite replay per probe.

| Mutation | Exact protecting name | Broken result | Restored result |
| --- | --- | --- | --- |
| Remove equality between category counts and observed diagnostics | L06 JSON2 counts modules and feasible default score corroborate diagnostics | exit 1, unexpected `reduced` versus `passthrough` | exit 0, one passed |
| Remove end-position ordering, keeping integer checks | L06 ranges require safe native start and paired ordered end positions | exit 1, invalid range unexpectedly `reduced` | exit 0, one passed |
| Remove exact object key-count check | L06 closed distinct keys and types refuse unknown missing nested fields | exit 1, unknown diagnostic field unexpectedly `reduced` | exit 0, one passed |
| Remove terminal-whitespace span from both pieces and required | L06 terminal whitespace source span prevents EOF deletion and fake savings | exit 1, replacement missing final LF | exit 0, one passed |
| Drop first data-token span from both pieces and required | L06 UTF16 token spans retain all diagnostics paths escapes metrics and exact EOF | exit 1, independent token comparison detected missing `[` | exit 0, one passed |
| Replace schema-key identity with property-order-dependent JSON.stringify(item) | L06 diagnostic categories codes strings and source associations stay coherent | exit 1, reordered duplicate warning unexpectedly `reduced` | exit 0, one passed |

Each invocation used:

```sh
npx --no-install tsx --test --test-name-pattern='^<exact protecting name>$' tests/profile-pylint.test.ts
```

## Once-only closure

```sh
npx --no-install tsx --test tests/profile-pylint.test.ts
```

Owned file ran once: **11 passed, zero failed, zero skipped**. Covers native goldens and all 41
receipt-bound source/hash/EOF/disposition records; distinct keys/types; argv refusals and witnessed
launchers; duplicate fields/diagnostics; severity/code coherence; ranges; count/module/score feasibility;
noncanonical escapes/numbers; mixed plugin/config prefixes/suffixes; unknown/nonzero/truncated metadata;
UTF-16 ordered spans, astral boundaries, UTF-8 bytes, every token class and complete terminal whitespace.
Closure was not repeated. Later default-registry baseline replay changed no final source/test bytes;
only that named acceptance was rerun after restoration. Final diff review found property-order-dependent
diagnostic identity could miss a duplicate with reordered keys. Added the concrete contiguous-warning
counterexample, which failed under the old identity; corrected to ordered schema-field identity and reran
only its protecting association test. This final new source/test change is why scoped typing was repeated.

## Scoped typing

Requested worktree command failed before invoking a compiler:

```sh
npx --no-install tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --strict --noUncheckedIndexedAccess --exactOptionalPropertyTypes --skipLibCheck --types node src/profiles/pylint.ts tests/profile-pylint.test.ts
```

Exact error: `npm error npx canceled due to missing packages and no YES option: ["tsc@2.0.4"]`.
No package was installed or shared file changed. Used the already-installed workspace TypeScript
binary read-only, from `/Users/gustavoschneiter/Documents/HuGR/HuGR-Lean`, with the same frozen options
and explicit owned source/test absolute paths. Initial scoped compiler invocation:

```sh
node node_modules/typescript/bin/tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --strict --noUncheckedIndexedAccess --exactOptionalPropertyTypes --skipLibCheck --types node /var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode/lean-native-v2-L06/src/profiles/pylint.ts /var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode/lean-native-v2-L06/tests/profile-pylint.test.ts
```

Exit 0, no diagnostics. Explicit root files suppress workspace tsconfig inclusion; imports are the
scoped source/test dependency closure, not a full-package typecheck.
Repeated this same scoped compiler command once only after the concrete reordered-duplicate source/test
fix changed typing; exit 0, no diagnostics. Total: two actual scoped compiler invocations, no full-package
typing. No repeats justified solely by review phase or unchanged source.

## Provenance and unresolved boundaries

Original raw cases, inputs, capture recipe, install report, copied license and failure archive remain
unchanged. Original receipt SHA-256:
`34586425c508f615e7594e177c4872b5ba42f3dbf02a0e0934e05a3bad9ebf7e`.
Four supplemental launcher captures are native tiny analysis only, with original argv/exits/merged EOF
and hashes in `launcher-receipt.json`; their `.txt` files are archive strings, not extra corpus inputs.
Four expected files are byte copies of old independently captured candidates; native manifests retain
only file inputs, never both file and inline output. Source/runtime donor code was not copied.

Pending: independent lead review, registry/corpus wiring, exact producer/version authentication (JSON
contains no version), wheel-to-source build attestation, and fifth-case noncanonical-number policy conflict.
JSON2 does not export statements or the identities of clean modules: validation enforces feasible score
and count/module lower bounds, never invents missing metrics. No full grammar/all-version/OS claim.
No whole-package check, build, smoke, benchmark, CI dispatch, shared helper/registry edit or merge.
