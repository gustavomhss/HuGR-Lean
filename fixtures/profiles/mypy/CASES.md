# L07 mypy: capture-only receipt

State: CAPTURED, pending lead approval. Baseline `78195e9`; branch
`campaign/native-v2/L07`; PR base `campaign/native-integration`.
All cases in `cases.json` use `hugr-lean/native-cases/1`, inline `output` only,
and `status: passthrough`. Exact expected evidence is the entire captured output,
including EOF; no reduced golden or implementation claim. Test name: N/A for
every row (CAPTUREONLY). Native invocations alone were run; no fixture-only
tests, typecheck, full checks or CI.

Reason vocabulary: **no-noise** = no removable material identified under required
evidence policy; **unsafe** = producer ambiguity; **unimplemented** = capture exists
but reducer/routing/grammar admission remains lead work. All decisions await review.
Each row binds to identically named manifest case and original argv. Sources and
independent source-level expectations are retained in `capture-receipt.json`.

| Stable case ID | Variant / independently required evidence | Exit | Reason | Approved removable bytes |
| --- | --- | ---: | --- | ---: |
| L07-version | Pinned compiled version, exact version line | 0 | no-noise | 0 |
| L07-summary-success | `double(int) -> int`, one checked file, success summary | 0 | no-noise | 0 |
| L07-silent-success | Explicit `--no-error-summary`, genuinely empty EOF | 0 | no-noise | 0 |
| L07-errors-notes | Assignment + overload error, both overload notes, reveal note, codes; 2 errors / 1 file | 1 | no-noise | 0 |
| L07-columns-context | Requested pretty wrapping, columns, source snippets/carets, overload notes and summary | 1 | no-noise | 0 |
| L07-function-context | Requested function context `broken_return`, return-value code, snippet/caret, 1 error | 1 | no-noise | 0 |
| L07-multi-file-imports | Valid local import plus absent module, linked note, no-redef, assignment/arg-type; 4 errors / 2 files / 3 checked | 1 | no-noise | 0 |
| L07-unicode-space | Unicode/astral text before error, Unicode path with space, start/end columns, reveal note | 1 | no-noise | 0 |
| L07-config-warning | Unknown option warning survives alongside successful check | 0 | no-noise | 0 |
| L07-config-failure | Historical case name: invalid python_version warning, **exit 0**, success summary | 0 | no-noise | 0 |
| L07-config-strict | Valid strict config requests codes and columns; same errors/notes preserved | 1 | no-noise | 0 |
| L07-config-missing | Missing config: usage lines and exact error, no invented check summary | 2 | no-noise | 0 |
| L07-syntax-failure | Syntax code and checking-aborted summary | 2 | no-noise | 0 |
| L07-requested-json | Requested JSON Lines, 3 objects; overload variants embedded in hint, codes/severity, zero-based columns | 1 | unimplemented | 0 |
| L07-requested-json-success | Machine-format success is exactly LF, not `[]` or empty bytes | 0 | no-noise | 0 |
| L07-requested-json-unicode | Original Python module argv; escaped Unicode filename + space, assignment/note objects | 1 | unimplemented | 0 |
| L07-module-launcher | Original `python -m mypy` invocation; diagnostic columns/notes/totals | 1 | no-noise | 0 |
| L07-plugin-collision | Executed configured plugin writes native success/diagnostic/LOG shapes; duplicate success retained | 0 | unsafe | 0 |
| L07-plugin-verbose-collision | Same plugin with requested verbose; all plugin bytes and native metrics retained | 0 | unsafe | 0 |
| L07-requested-verbose | Requested paths/config/cache/parsing/scheduling logs and build-finished timing/module/error metrics | 0 | no-noise | 0 |

## Savings and blockers

Approved savings: 0 bytes throughout. No deletion candidate proposed. Default output
is diagnostic/summary evidence; requested verbose is requested evidence, not free noise.
Plugin's `LOG:  Building graph` is actual plugin stderr, not proof of native progress.
Dropping LOG-shaped rows would delete plugin output. Duplicate summary deletion would
also delete plugin output. Merged EOF capture authenticates process bytes, not producer
identity within process. Collision witnesses are real configured-plugin runs.

Machine format is supported by pinned version, but JSON Lines parser/routing is
unimplemented in this packet; no machine-format reduction is approved. Nonzero checks
must stay exact. Lead approval and any future bounded implementation/preservation
work remain blockers to reduction admission, not blockers to this capture delivery.

Framing correction: “capture complete” means named native variants captured, not
L07 reduction support complete. `config-failure` was prior recipe's label: observation
is warning with exit 0. Separate `config-missing` demonstrates true failure. Unicode
native diagnostic columns are preserved as emitted, not reinterpreted as UTF-16
source spans. Size fields count UTF-8 bytes. Silent/LF cases prove boundaries, not savings.
