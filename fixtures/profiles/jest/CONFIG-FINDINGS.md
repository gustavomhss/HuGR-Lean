# Config-only reporter preservation finding

Capture checkpoint: `56cc2f308deb63d4a39bd4d66a590150338fa208`.
Frozen lead replay: `f157b388f9ffa4a46d6c19bef980f1725045cc5c`, before runtime fix.
Exclusive capture branch: `campaign/jest-config-captures`; supersedes initial R02 PR #114.

| Native original argv | Native bytes | Raw SHA-256 | Frozen lead actual | Desired |
| --- | ---: | --- | --- | --- |
| `jest --config=config-collision.cjs` | 160 | `13a7870d2dcbce5b414f875b59d4c8de5cdee05736a92143790c1e3373e921c9` | reduced, 157 bytes; PASS replaced | passthrough, all 160 bytes |
| `jest --config=config-full-collision.cjs` | 196 | `53abbe288a50b6a582e0ee89a5fa9b0cd78a33e77c4cf2ea725278e65a376fb1` | reduced, 191 bytes; PASS and ✓ replaced | passthrough, all 196 bytes |

Both real Jest processes exit 0; package 30.2.0 / native CLI 30.1.3. Reporter sources are
committed; first reuses unchanged existing reporter, second emits complete success grammar
including `  ✓ custom reporter output (1 ms)`. Reporter owns all text. Config chooses reporter;
actual argv has no explicit reporter flag. Native stdout/stderr merged before exec, read to EOF,
waited for exit. Byte/hash/tail-LF receipts preserve original output without rewriting.

Existing explicit `--reporters` observations remain safeexact. They do not cover config-only
reporter injection. Initial synthetic command counterfactual remains historical proof only;
these two native observations now prove actual argv reach independently.

`config-lead-replay.json` records exact frozen source commit/tree/archive hash and full actual
public-filter results, including unsafe replacements. Those strings are bug proof, never
approved goldens. Manifest declares desired passthrough with `baseline-bug` finding reason.
Original snapshot-passed reduction proof/golden remain archives, while current desired status
becomes passthrough because text grammar cannot authenticate the same reporter-owned markers.

Scoped audit reads all 14 Jest cases through frozen lead corpus reader with normalized fact
receipts. Corrupting only full-collision receipt SHA causes `receipt hash mismatch`; receipt
is restored and scoped read succeeds. This probes receipt binding, not a full runtime suite.
No suite/typecheck/build/smoke/benchmark/CI executed; no runtime/tests/shared docs changed.
Runtime fix is separate work; these captures do not claim fix completion or policy approval.

## Replay harness failure preserved

First replay attempted Git archive from fixture-directory cwd and failed before importing code:

```
fatal: pathspec 'src' did not match any files
```

Git pathspecs were relative to nested cwd. Harness now resolves repository root explicitly.
No native bytes, historical receipts or reporter sources were modified to repair replay.
