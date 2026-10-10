# Structured tool output

## Availability and boundaries

This manual describes the frozen structured-tools integration contract. The WP12
branch has the public API but an intentionally empty default reducer registry;
reductions require lead integration. CLI flags and tool bindings require WP11.
See [STRUCTURED-WAVE.md](STRUCTURED-WAVE.md) for the authoritative schemas.

HuGR-Lean filters output **after execution**. It does not execute commands, read
system state, query CDP/AT-SPI/macOS accessibility, or add GUI action tools.
Formats below are custom HuGR-Lean interchange contracts, not existing native
tool protocols. Producers must explicitly implement the selected schema.
The only planned native addition is the exact documented process-table format
from `ps -axo pid,ppid,stat,comm`; native compatibility evidence belongs to WP04.
WP12 examples/tests are synthetic and do not establish native ps support.

Reduction requires authentic complete output and exit 0, a fully supported
schema, preserved evidence, and strictly fewer UTF-8 bytes. Unknown fields,
duplicate keys, invalid refs, partial captures and failures preserve original
output. JSON whitespace compaction accepts arbitrary valid JSON keys; the
unknown-field restriction applies to semantic projection schemas.

## SDK

Use Node >=22 and the exported package subpath:

```ts
import { filterStructured } from "hugr-lean/core";

const output = ' { "name": "Café🦀", "ready": false } \n';
const result = filterStructured({
  format: "json",
  output,
  termination: { kind: "exited", code: 0 },
  completeness: "complete",
});
const modelText = result.status === "reduced" ? result.replacement : output;
```

Supply observed facts, not assumed success. Termination can be `unknown` or
`timed_out`; completeness can be `unknown` or `truncated`. Those inputs pass
through. Passthrough/failed-open results contain no replacement: retain original
text yourself. Metrics are UTF-8 bytes; internal source spans use UTF-16 indices.
`maxInputBytes` defaults to 4 MiB; SDK accepts integer limits from 1–16 MiB.
For `accessibility-scope`, add `scopeRef: "selected-ref"`; other formats reject
scope. The SDK performs no raw storage or automatic tool detection.

## Formats and output meaning

| Format | Input | Model-visible output |
| --- | --- | --- |
| `json` | Valid JSON | Lossless lexical whitespace compaction; numbers, escapes and key order retained |
| `table` | `{columns: string[], rows: scalar[][]}` | JSON-lexeme TSV header/cells; all rows retained |
| `progress` | `hugr-lean/progress-v1` envelope | JSON containing last completed progress and every result/warning/diagnostic in source order |
| `processes` | Process record array; documented native ps shape | All process rows |
| `files` | File record array | All paths, metadata and symlink targets |
| `windows` | Window record array | All IDs, titles, focus/state and geometry |
| `events` | Ordered event record array | All events; `=` means one exact repetition of previous complete row |
| `accessibility` | Flat `hugr-lean/a11y-v1` tree | Compact node rows, all refs/parents and semantic values |
| `accessibility-properties` | Same tree | JSON; omits only empty optional states/actions/description |
| `accessibility-scope` | Same tree plus explicit `scopeRef` | JSON subtree, full ancestors, all focused/modal nodes and their ancestors; adds `scope` |

TSV-style views are for model reading, **not transparent JSON replacements** for
downstream programs. JSON cells retain escaped lexemes; `-` denotes missing
optional fields, distinct from JSON `null`. Property compaction never drops
`value: ""`, `false` or zero. Scoped output is a deliberate selection: unrelated
nodes may disappear, but retained relationships stay valid. Stale refs refuse.

## CLI after WP11 integration

```sh
hugr-lean filter --format json --exit-code 0 --complete < capture.json
hugr-lean filter --format table --exit-code 0 --complete < table.json
hugr-lean filter --format accessibility-scope --scope-ref selected-ref --exit-code 0 --complete < tree.json
```

Files here contain captures already produced by your tool. Flags assert observed
metadata; omitting success/completeness preserves input. Structured mode rejects
`--command` and `--terminal-rendered`. `--scope-ref` is valid only for scoped
accessibility. Existing shell mode still requires `--command`. stdout contains
replacement or original bytes, not an SDK result envelope; no newline is added.
Invalid UTF-8 and over-limit input retain original bytes. See the
[CLI manual](../src/cli/MANUAL.md) for streaming and exit-status behavior.

## OpenCode opt-in after WP11 integration

Add options to the existing plugin configuration, then restart OpenCode:

```json
{
  "plugin": [["file:///absolute/path/to/hugr-lean/dist/index.js", {
    "structuredTools": [
      { "tool": "my_table_capture", "format": "table" },
      { "tool": "my_tree_capture", "format": "accessibility-scope" }
    ]
  }]]
}
```

Names are examples of caller-owned producers, not built-in tools. No default
bindings exist. Names must be unique, nonempty and never `bash`; formats must be
declared above. Invalid configuration disables hook creation. A bound producer
must return string `output.output`, `output.metadata.exit === 0` and
`output.metadata.truncated === false`. No inferred completion or preview text.
Scoped producers receive `input.args.scopeRef`; only that argument supplies scope.
Metadata, title and args stay intact; failures retain output. Existing optional
[raw persistence](../src/opencode/MANUAL.md) behavior also applies.
