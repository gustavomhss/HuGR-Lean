# L03 Ruff capture packet

State: CAPTURED, capture-only. Baseline `07ffe15e2263c2925778022194c5385807216603`.
Native producer: Ruff **0.14.0**, direct binary, complete combined pipe boundary.
`cases.json` uses `native-cases1`: merge `receiptDefaults` with each case receipt;
resolve source/output references through embedded dictionaries. Source names are executed names,
not aliases. Every `argv` is the actual executable and unchanged arguments passed to `Popen`.
`expectedDefaults` defines full exact golden and required evidence for every case.
No parser, routing, public-filter admission or runtime savings claim.

| Stable case ID | Variant / combination | Exit | Required source evidence / disposition |
| --- | --- | --- | --- |
| L03-check-clean | Native default, clean | 0 | Success line; no removable material |
| L03-check-failed | Default F401 + F821, Unicode context | 1 | Entire 327-byte output exact by core failure policy |
| L03-check-exit-zero | Explicit exit-zero, same violations | 0 | Both messages/codes/positions, snippets/carets/help, 2 errors, 1 fixable |
| L03-check-full | Explicit full + exit-zero | 0 | Same native evidence; exact comparison anchor |
| L03-check-json-failed | Explicit JSON, violations | 1 | Entire 1163-byte JSON exact, all fields/fix edits retained |
| L03-check-json-exit-zero | Explicit JSON + exit-zero | 0 | Same JSON evidence; whitespace-only proposal below |
| L03-check-fix | Safe fix, before/after tiny source | 0 | 1 error, 1 fixed, 0 remaining; import deletion source evidence |
| L03-check-syntax | Syntax diagnostics + exit-zero | 0 | Two invalid-syntax messages, positions, snippets/carets, count |
| L03-format-check | Unformatted + clean file | 1 | File path, 1 would reformat, 1 formatted; whole exact |
| L03-format-diff | Diff with Unicode | 1 | Headers/hunk/both source versions/count; whole exact |
| L03-format-json-preview-check | Explicit preview + JSON + check, mixed files | 1 | Unformatted message/code/positions/safe replacement edit; whole exact |
| L03-format-write | Native default, mixed files, before/after | 0 | 1 reformatted, 1 unchanged; external fix context |
| L03-format-json-warning | JSON requested without preview | 0 | Exact unstable-format warning plus unchanged count; native text, not JSON |
| L03-format-json-preview-clean | Explicit preview + JSON + check, clean | 0 | Exact `[]`; no removable material |
| L03-format-clean | Native check, two clean files | 0 | Exact two-file formatted count; no removable material |
| L03-format-silent | Explicit quiet, clean | 0 | Empty exact witness; zero saving |

## Material policy

All capture goldens remain exact, removable bytes **0**. Nonzero cases must stay whole exact.
`--exit-zero` is explicit original argv only; never inject it during filtering.
Native snippets, carets, context, repeated Unicode lines, help and counts are required evidence;
this packet proposes no removal from those outputs.

Only proposal: JSON grammar's insignificant whitespace outside strings for
`L03-check-json-exit-zero`: **1163 -> 790 UTF-8 bytes**, **373 candidate bytes**.
Retain every original token and all fields, positions, messages, paths, edits and URLs.
Measurement deleted only whitespace outside strings and compared parsed JSON equality;
this is not an implemented golden or observed runtime saving. Parser acceptance and UTF-16
source-span preservation need separate work. Failed JSON remains exact regardless of redundancy.

## Checks / scope

`npm ci --ignore-scripts`; `npm run typecheck` exited 0.
Compiler positive control: disposable external `.ts` assigning string to number failed with
TS2322 through `npm run typecheck -- --skipLibCheck <control.ts>`; control deleted afterward.
Disposable capture validator checked all declared IDs, source/output UTF-8 byte lengths,
SHA-256 digests, argv/source-name correspondence and native JSON codes/fix positions.
In-memory missing-caret mutation was rejected by byte/digest checks; original files untouched,
then original validation completed. This probes capture integrity, not runtime preservation.
No full tests/build/smoke/benchmark or CI dispatch. Public-filter test names are deferred.

Blockers for implementation: public-filter admission and grammar tests not implemented;
native-text material has no proposed removable evidence. No version/install/capture blocker.
No claim that exact-only corpus finishes campaign reduction requirements.
