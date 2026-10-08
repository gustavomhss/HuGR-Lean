# L03 Ruff capture packet

State: IMPLEMENTED_CHECKPOINT, externalization blocked as noted below.
Capture baseline `07ffe15e2263c2925778022194c5385807216603`.
Native producer: Ruff **0.14.0**, direct binary, complete combined pipe boundary.
Original `native-cases1` record is preserved unchanged as `capture-receipt.json`;
merge its `receiptDefaults` with each case receipt and resolve embedded source/output references.
`cases.json` is now `hugr-lean/native-cases/1`, flat per-case metadata and original argv.
Source names are executed names,
not aliases. Every `argv` is the actual executable and unchanged arguments passed to `Popen`.
All but successful check JSON retain full exact goldens. The approved case uses an independent
790-byte compact literal in `tests/profile-ruff.test.ts`. No registry change or default routing claim.
Lead provider `eea12ae` supplies frozen `jsonLayout`; helper and shared tests remain untouched.

| Stable case ID | Variant / combination | Exit | Required source evidence / disposition |
| --- | --- | --- | --- |
| L03-check-clean | Native default, clean | 0 | Success line; no removable material |
| L03-check-failed | Default F401 + F821, Unicode context | 1 | Entire 327-byte output exact by core failure policy |
| L03-check-exit-zero | Explicit exit-zero, same violations | 0 | Both messages/codes/positions, snippets/carets/help, 2 errors, 1 fixable |
| L03-check-full | Explicit full + exit-zero | 0 | Same native evidence; exact comparison anchor |
| L03-check-json-failed | Explicit JSON, violations | 1 | Entire 1163-byte JSON exact, all fields/fix edits retained |
| L03-check-json-exit-zero | Explicit JSON + exit-zero | 0 | Same JSON evidence; whitespace-only reduction below |
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

All original capture bytes remain intact. Nonzero cases must stay whole exact.
`--exit-zero` is explicit original argv only; never inject it during filtering.
Native snippets, carets, context, repeated Unicode lines, help and counts are required evidence;
this packet proposes no removal from those outputs.

Only approved reduction: JSON grammar's insignificant whitespace outside strings for
`L03-check-json-exit-zero`: **1163 -> 790 UTF-8 bytes**, **373 removed bytes** in selected-profile filter.
Retain every original token and all fields, positions, messages, paths, edits and URLs.
Full finite diagnostic/fix/edit/position schema validates first; shared helper supplies ordered
UTF-16 token spans as both pieces and required evidence. Unknown/missing fields, invalid/reversed
positions, overlapping or unordered edits, empty arrays, duplicate keys, alternate spellings and tails
decline. Values/rule IDs/paths vary generically. Failed JSON remains exact regardless of redundancy.

## Frozen identity

Direct `ruff` or absolute Unix literal executable ending `/ruff`; no wrappers or relative executables.
`check`, explicit `--exit-zero`, explicit `--output-format=json` or `--output-format json` required.
Optional `--isolated`, `--no-cache` once each. Options precede paths; optional `--` terminates options.
Paths may vary; no path required (Ruff's default current directory). All other flags/formats exact.
Original command tokenization is core-owned. Structural absolute identity is lead-approved new matrix,
not a claim that every absolute executable was natively captured.

## Checks / scope

`npm ci --ignore-scripts`; `npm run typecheck` exited 0.
Compiler positive control: disposable external `.ts` assigning string to number failed with
TS2322 through `npm run typecheck -- --skipLibCheck <control.ts>`; control deleted afterward.
Disposable capture validator checked all declared IDs, source/output UTF-8 byte lengths,
SHA-256 digests, argv/source-name correspondence and native JSON codes/fix positions.
In-memory missing-caret mutation was rejected by byte/digest checks; original files untouched,
then original validation completed. This probes capture integrity, not runtime preservation.
Native positive failed against empty baseline profile (`passthrough` instead of `reduced`), then passed
independent compact golden. `tests/profile-ruff.test.ts` covers the case IDs above via selected-profile
public filter; schema, identity, metadata, Unicode/body whitespace/UTF-16, duplicates and tails covered.
Preservation mutations in owned `ruff.ts`: drop `fix`, `message`, then `code` token spans from both
pieces and required evidence. Each native-positive probe failed independent golden equality.
All three mutations restored to provider call; full owned test file and typecheck rerun afterward.
No full tests/build/smoke/benchmark or CI dispatch.

Externalization blocker: this session's `apply_patch` appends final LF even with the standard
no-newline marker. Ten LF-terminated/empty native outputs externalized unchanged to `.txt` and verified.
Three no-final-LF JSON blobs (`lint-json`, `format-json`, `empty-json`) stay exact in original receipt,
with `outputFile: null` and named blockers. A narrowly approved byte-write exception is needed to finish
those `.txt` files without recapture, normalization or envelope bytes. Implementation itself is verified.
