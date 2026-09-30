# OpenCode adapter

The package root `hugr-lean` exposes only the default plugin; [index.ts](index.ts) maps the legacy post-execution hook into the pure core.

## Scope
- `tool.execute.after` receives actual `bash` command/output/metadata and may change only model-visible `output.output`; it returns `void` asynchronously.
- Native command, title, attachments, exit/truncation metadata, and raw preview remain host-owned; execution is never rerouted.
- Presentation is always `unknown`: the observed host retains raw ANSI/CR. Missing/failed/timed-out/truncated facts preserve original output.
- [config.ts](config.ts) validates short options; filtering defaults on, raw defaults off, invalid plugin options yield no hooks.
- Opt-in raw saves require at least 1,024 bytes and 10% saved; a required save failure leaves original output.

Evidence: [plugin tests](../../tests/plugin.test.ts), [boundary teeth tests](../../tests/opencode-boundary.test.ts), and [OpenCode boundary proof](../../docs/OPENCODE.md), scoped to the recorded legacy CLI host.
Read [ownership](OWNERSHIP.md), [maintenance](MAINTENANCE.md), [manual](MANUAL.md), and [blast radius](BLAST_RADIUS.md).
