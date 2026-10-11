# OpenCode manual

Use a built plugin file URL in the host's schema-bearing configuration, then quit/restart OpenCode:
```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [["file:///absolute/path/to/hugr-lean/dist/index.js", {
    "enabled": true, "excludeCommands": ["git"], "raw": false
  }]]
}
```
- Build locally with `npm ci && npm run build`; [package.json](../../package.json) requires Node >=22. The root exports only the default plugin; libraries use `hugr-lean/core` and `hugr-lean/raw`.
- `default plugin(context, options?)` resolves to hook records; valid defaults register `tool.execute.after`, invalid options/setup failures resolve to `{}`.
- Internal `createAfterHook(options = {}, dependencies = {})` returns `(input, output) => Promise<void>`; dependency injection is for tests, not a root named export.
- `enabled` defaults true. `excludeCommands` defaults empty; leading whitespace is ignored for matching, then an exact literal or prefix followed by ASCII space/tab excludes the call. Matching does not change the executed command; it is not a glob, regex, or path resolver.
- `maxInputBytes` defaults 4 MiB and accepts safe integers from 1–16 MiB inclusive; invalid option keys/types disable plugin hook creation.
- `raw` defaults off; use `false` or `{ directory?, maxBytes?, ttlMs? }`, not `true`. Defaults/caller-restricted ACL guarantees are in [raw manual](../raw/MANUAL.md).
- A raw save occurs before replacement only when both saved UTF-8 bytes `>= 1024` and saved fraction `>= 0.10`; smaller changes can reduce without saving. IDs are never appended to tool text.
- Command is `input.args.command` for `input.tool === "bash"`; safe-integer nonnegative `metadata.exit` is an exit fact, and only `metadata.truncated === false` means complete.
- Presentation stays `unknown`; invalid/missing facts and nonzero exits preserve text through core. Do not use `metadata.output` preview or saved truncation paths to infer completeness.
- Replacement must be nonempty, strictly smaller, and have matching UTF-8 metrics; reduced results need a profile ID. Exceptions, including required raw-save failure, retain original text; concurrent text changes are not overwritten.
- `automatic` defaults true; non-boolean values disable hook creation. With no options, only native `glob`/`grep`/`read` (other native tools are not routed) need `metadata.truncated === false`; a `structuredTools` binding for the same tool takes precedence. `bash` tries automatic views only after the legacy result is `no_profile`/`unsupported_command` passthrough with `exit === 0` and `truncated === false`; `excludeCommands` still applies.
- Hook inputs (`output.output`, `tool`, `args`, `metadata`) are read once into frozen copies before any decision. Native replacement is written only if `output.output` is still the original string.
- MCP: when `output.output` is not a string, `content[]` is validated whole before parsing: `isError` absent or `false`, metadata/`_meta` without truncation or nonzero exit, 1–64 well-formed blocks, no `resource.blob`, total text plus `resource.text` (joined with two LF) at most `maxInputBytes`; error/clipping text refuses the packet. Each text block is filtered independently; the raw save captures the host-joined text. After the save the live packet is revalidated (same array, block identities, texts, tool and arguments) and `output.content` is replaced in one assignment; `structuredContent`, non-text blocks and annotations stay.
- Disable with `enabled: false` or remove the plugin entry, then restart. Upgrade by replacing the compiled build and restarting; remove the entry before removing installed files.
- Host compatibility evidence is [OpenCode 1.18.17 legacy CLI/macOS x86_64](../../docs/OPENCODE.md); the separate V2 route and broad package-install compatibility are not established by these module docs.
