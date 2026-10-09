# B05 webpack: capture-only packet

Base `71bcaea`; branch `campaign/native-v2/B05`. All native observations are file-only
`hugr-lean/native-cases/1` passthrough entries. No runtime reduction, public-filter test,
typecheck, smoke, benchmark, or CI claim. Captures were real isolated tiny builds.

## Coverage ledger

`F` means each of `default`, `normal`, `errors-warnings`, `json`; each is an actual
separate invocation, not a reformatted copy. Filenames are `<case ID>.txt`.
`cases.json` and `capture-receipt.json` bind original argv, cwd, version, platform,
exit, merged stream, exact EOF length/hash/tail, and per-command artifact snapshots.

| Stable IDs | Required combination / source | Exit | Disposition / removable bytes |
| --- | --- | --- | --- |
| `B05-version` | local pinned CLI version; Node/npm captured separately | 0 | exact tooling evidence |
| `B05-clean-F` | `webpack.config.cjs`; three entries, shared split chunk, lazy chunk, resource asset; UTF-8 source and paths | 0 | native text exact; JSON layout 0 |
| `B05-warnings-F` | `warnings.config.cjs`; dynamic-expression import plus real lazy chunk, warning location/message/advice | 0 | exact diagnostics; JSON layout 0 |
| `B05-sourcefail-F` | `sourcefail.config.cjs`; broken + valid entry; source error, snippet, loader advice, partial artifact output | 1 | failed output exact; no reduction |
| `B05-configfail-F` | `configfail.config.cjs`; thrown `B05 config failure café α exact` | 2 | failed output exact, including requested JSON returning text |
| `B05-multi-output-F` | `multi.config.cjs`; named `web café` / `node β` compilers, different targets and output directories; multiple entries/chunks/assets each | 0 | compiler associations exact; JSON layout 0 |
| `B05-clean-detailed` | explicit `--stats detailed`; chunk IDs, parents, module/asset/runtime byte sizes and native infrastructure logs | 0 | exact requested metrics/logs |
| `B05-plugin-success-F` | corrected `plugin.config.cjs`; same valid build with forged native asset and summary rows plus arbitrary stdout | 0 | ambiguous producer collision exact; JSON invocation emits mixed text |
| `B05-plugin-F` | initial recipe generated invalid JS string escaping; `plugin-initial-invalid.config.cjs` | 2 | extra recipe-failure witnesses retained; **not** plugin coverage |

All build projects live in `tiny café space`; entries include `entrée α.js` and
`lazy β.js`; emitted `main café.js` and compiler names retain Unicode and spaces.
Default is independently captured; explicit `normal` has native compared-for-emit
differences caused by previous builds. `cache: false` does not remove filesystem
artifact reuse. Artifacts are post-command snapshots, not proof every file was
emitted by that command. Original recipe snapshots include prior `dist-*` outputs.
Supplement snapshots contain that command's single `dist` directory.

## JSON layout proposal and exact EOF

`measure.py` considers only whitespace outside JSON strings, keeps original token
spellings/order/numbers/escapes and exact trailing whitespace. Positive layout
control removes 6 bytes while retaining space inside its string and terminal LF.
Four valid JSON observations (clean, warnings, source failure, multi-output) already
have compact native layout and no terminal LF. Their `.layout-candidate.json`
artifacts are byte-identical to raw captures: **0 candidate removable bytes**.
Source failure is ineligible regardless of layout. Config/initial-plugin failures
and corrected plugin mixed stdout are not JSON candidates. Text outputs retain LF.
No JSON parse/reserialize substitution or synthetic pretty-print is presented as
native savings. No independent smaller golden exists; exact passthrough uses raw
file bytes implicitly. Requested chunks/assets/sizes/warnings remain untouched.

## Scope decision and blockers

Campaign human decision (campaign document lines 211–217 at base) permits exact
preservation of documented ambiguous plugin/reporter progress. It applies here to
`B05-plugin-success-*`, not missing variants, a safe-format waiver, or runtime
producer authentication. Default/normal/errors-warnings/explicit JSON, clean,
warnings, multi-file, multi-output, config failure, source failure, Unicode/space
paths and arbitrary native-shaped plugin output all have named witnesses.

Capture task is ready for independent lead review and corpus promotion. Lead owns
index wiring and any public-filter closure. Full B05 family/runtime completion is
not established: normal/detailed text has meaningful evidence and producer
ambiguity; deletion of its progress/module/log rows is not licensed. This packet
offers no profitable safe JSON layout change. Other webpack/CLI versions, watch,
production/minifier/loader plugins and unbounded stats option combinations are not
claimed. Registry `gitHead` is provenance, not source-build attestation.

**Wrong framing:** “webpack reducer complete”, “JSON compaction saves bytes”,
“all webpack output authenticated”, “all plugin configurations covered”, or
“exact-only permission waives missing safe variants”. Correct framing: bounded,
pinned native capture-only evidence with zero proposed savings.

## Recipe and evidence

1. Run `python3 fixtures/profiles/webpack/capture.py` in this worktree.
2. Run `python3 fixtures/profiles/webpack/capture-plugin.py` once after initial capture.
3. Run `python3 fixtures/profiles/webpack/measure.py` for capture measurements/SRI.

First recipe intentionally remains the original recorded recipe, including its
discovered escaping defect; second preserves those failures and captures the fix.
Initial plugin source is archived separately. Recipe hashes are receipt-bound.
Setup uses public npm registry, exact root pins and `--ignore-scripts`; lockfile
pins transitive versions/SRIs. No global installation. Builds have 90-second
bounds; setup 180 seconds. Captures drain one OS-merged pipe through EOF and wait.
Setup output is archived, not treated as webpack build observations. All noninput
`.txt` source/license/artifact/setup files have string archive declarations.
