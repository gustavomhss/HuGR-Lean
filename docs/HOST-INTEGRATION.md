# Host integration

`hugr-lean/core` is a pure, synchronous post-execution API in one TypeScript package.
A host such as Orchestra supplies actual tool identity, arguments, execution status and
completeness. Core never executes, rewrites commands, persists output or assigns host fields.
Unknown output, failures and invalid processing retain the original; no evidence is invented.

## Classification and per-item toggles

Public exports: `automaticReducers`, `automaticFamilyIds`, `classifyAutomatic`,
`filterAutomatic`, `filterAutomaticMcp` and their types. The default registry contains the
eleven frozen leaf entries below, with stable IDs and a `lossy` flag. Previous broad result
IDs (`auto-files`, `auto-cli`, `auto-snapshot`, `auto-cdp`, `auto-json`) are replaced by leaf IDs.
Hosts should persist toggles by the new IDs, rather than registry position or reducer filename.

```ts
import { automaticReducers, classifyAutomatic, filterAutomatic,
  type AutomaticFamilyId, type AutomaticObservation } from "hugr-lean/core";

function modelView(observation: AutomaticObservation, enabledFamilies: readonly AutomaticFamilyId[]) {
  const family = classifyAutomatic(observation); // Recognition precedes settings.
  if (!family || !enabledFamilies.includes(family)) return observation.output;
  const reducers = automaticReducers.filter(entry => enabledFamilies.includes(entry.id));
  const result = filterAutomatic(observation, { reducers, enabledFamilies });
  return "replacement" in result ? result.replacement : observation.output;
}
```

`classifyAutomatic(observation)` returns a family ID or `undefined`; it is deterministic and
has no settings argument. Recognition is separate from reduction eligibility. For example,
`ps aux` identifies `cli-ps` but its output grammar is unsupported; a snapshot tool with
unsupported args remains a snapshot family. A file-content `read` has no directory family.
Generic MCP JSON requires a complete JSON/NDJSON grammar; unknown prose has no family.
CDP identity recognizes a `nodes` array in `{nodes}`, `{id,result:{nodes}}`, or
`{accessibility:{nodes}}`, including empty arrays, escaped keys and nodes refused by the table
reducer. Settings cannot change this into generic JSON.

`filterAutomatic` repeats classification on its frozen observation before selecting entries.
`reducers` selects public automatic leaves; `enabledFamilies` is an optional allowlist covering
both automatic leaves and legacy shell profiles. Omit it to enable all families, or pass `[]`
to disable recognized families. A disabled family returns passthrough without replacement,
even if another reducer could handle the text. Selecting only `mcp-json` cannot compact a
CDP packet. Public leaf reducers also refuse carriers classified as another family.
Custom entries with arbitrary IDs remain supported for existing callers; hosts using them
must define their own preservation contracts and use `enabledFamilies` for toggle isolation.

For native `bash`, legacy dispatch remains first. A command matching a built-in shell profile
classifies as `legacy:<profile-id>` (for example `legacy:pytest` or `legacy:git-status`). A
legacy reduction, refusal, processing failure or disabled family is terminal: it never reaches
the automatic CLI/JSON reducers. `legacyFilter` remains injectable, with the same refusal
semantics. Unknown literal commands may reach custom reducers; shell expansions and operators
are never reinterpreted. No command is rewritten.

## Execution and preservation contract

Every reduction requires successful, complete host facts. `metadata.truncated`, when supplied,
must be `false`; `metadata.exit`, when supplied, must be `0`. Native bash needs both explicitly,
plus string `args.command`. Native file tools need explicit `truncated: false` and the validated
counts/wrappers below. Source spans are half-open UTF-16 string indices without split surrogate
pairs; input/output sizes and limits are UTF-8 bytes. Core validates each declared evidence span
and accepts only a nonempty, strictly smaller view. A classification is not a promise of reduction.

| Family ID | Declared evidence kept | Presentation that may change |
| --- | --- | --- |
| `native-glob` | Every absolute path and row order; host count must agree | Common directory prefix emitted once, followed by exact suffixes |
| `native-grep` | Match count; all reconstructed paths, line numbers, match text, group order and complete tails | Common path prefix emitted once; ambiguous path suffixes refuse |
| `native-read-directory` | Path/type header, every entry, order and count footer; optional display metadata must agree | Redundant `<entries>` wrapper tags removed; file reads refuse |
| `cli-ps` | PID, PPID, STAT and full command tail of every row, including Unicode and trailing spaces | Validated Darwin/procps fixed-width cell padding becomes tabs |
| `cli-ls` | Total, permissions, link count, owner/group, size, date/time and entire filename/symlink tail of every row | English C locale long-listing cell padding becomes tabs |
| `cli-json-producers` | Every JSON key/scalar lexeme, record order, empty-container distinction and native wrapper; CDP tables reconstruct fields and order | Outside-token JSON whitespace removed; admitted CDP nodes may become a reversible table |
| `cli-ffmpeg` | Entire final `progress=end` block after validating all complete, consistent, monotonic blocks | **Lossy**: intermediate progress blocks are dropped; `lossy: true` advertises this explicitly |
| `mcp-browser-snapshot` | Every control ref, row payload, role/name/value/state, hierarchy, non-ref row, preamble and suffix | Playwright refs move to row front; `- ` and ref wrappers removed; fence `yaml` becomes `text` |
| `mcp-devtools-snapshot` | Every UID, row payload, hierarchy, header and trailing newline | Chrome DevTools `uid=` removed |
| `mcp-cdp-accessibility` | All nodes and fields, key/value lexemes, original field and row order, absent versus null/empty cells, envelope and wrapper fields | Nodes become columns/optional-cell rows; if table grammar refuses valid JSON, the same enabled family retains the existing lexical whitespace-only fallback |
| `mcp-json` | Every key and scalar lexeme, empty container, record order and supported native wrapper | Whitespace outside JSON tokens removed; blocks are never joined for parsing |
| `legacy:<profile-id>` | Evidence declared by the original shell profile's complete grammar (identities, diagnostics, summaries as documented) | Only that profile's validated formatting/reduction; see [coverage](COVERAGE.md) |

The CDP lexical fallback is owned by the CDP leaf and is unavailable when that leaf is disabled.
The generic JSON leaf cannot claim a CDP carrier. All leaves except ffmpeg retain the declared
evidence; this is a per-family contract, not a claim that every presentation byte is retained.
Unsupported variants, inconsistent facts, unknown lines, invalid spans and parser exceptions
never produce a partial view. Full grammar bounds and producer pins remain in [coverage](COVERAGE.md).

## Pure decoded-MCP packets

```ts
import { filterAutomaticMcp, type AutomaticFamilyId } from "hugr-lean/core";

function prepareMcp(tool: string, args: Record<string, unknown>, decoded: unknown,
  enabledFamilies: readonly AutomaticFamilyId[]) {
  return filterAutomaticMcp({ tool, args }, decoded, { enabledFamilies });
}
```

The helper validates the whole decoded result before parsing or processing text:

- `content` is an array of 1–64 supported blocks; `isError` is absent/undefined or exactly `false`.
- `metadata` and `_meta` are absent/undefined or objects with absent/undefined/false `truncated`
  and absent/undefined/zero `exit`; contradictory or malformed flags refuse the packet.
- Supported types are text, text resource, image, audio and resource link. A resource with
  `blob` supplied refuses the whole packet. Required carrier fields must have their native types.
- Aggregate text includes text resources and two-LF separators between retained text segments.
  Its budget defaults to 4 MiB; safe integer limits from 1–16 MiB are accepted. It is enforced
  before any reducer runs. Empty text resources do not contribute a segment.
- Text clipping notices, protocol error envelopes and Playwright `### Error` outside fences
  refuse the whole packet. Resource text is budgeted and retained, never transformed.

Each text block is classified independently before settings. All text blocks must have the same
recognized family, or the entire packet passes through. CDP plus generic JSON, or valid JSON plus
unknown prose, remains exact even when only one family is enabled. A packet of fragments that
would become valid JSON after joining remains exact. Non-text blocks do not participate in the
family vote.

The return value has `result` (aggregate `FilterResult`), `blocks` (text-block `index`, optional
`family`, `inputBytes`, `outputBytes`), and `originalText` for a validated packet. `content` exists
only on aggregate reduction and contains rebuilt changed text blocks, retaining their other
fields such as annotations; unchanged blocks retain their identities. A compact same-family block
can stay unchanged while another shrinks. `structuredContent`, metadata, resources and other
result fields are never modified. Invalid packet validation returns zero aggregate metrics and
no block attribution, because no complete validated aggregate exists. Refused valid packets report
original sizes. Any failed-open block, invalid candidate or exception discards all candidates;
per-block output sizes reset to input sizes, and `content`/replacement remain absent.

The helper does not mutate its inputs or perform persistence. It is synchronous; apply the returned
`content` in one host assignment only after checking the aggregate result. When persistence introduces
an await, the host must revalidate live failure/truncation flags, tool/args, content identity, block
identities and original text before assignment. Rebuild changed blocks from live copies so host-added
annotations survive. OpenCode's [adapter](../src/opencode/automatic-mcp.ts) retains this responsibility,
optional raw storage and material-change thresholds (at least 1 KiB and 10% saved). Hosts own opt-outs,
raw recovery and lifecycle policy.

Tests: [selection](../tests/automatic-selection.test.ts), [pure packets](../tests/automatic-mcp-core.test.ts),
and [adapter compatibility](../tests/automatic-plugin.test.ts).
