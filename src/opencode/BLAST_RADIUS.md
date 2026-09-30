# OpenCode blast radius

## Dependency edges
- Inbound: [root default export](../index.ts), legacy OpenCode plugin loader, [plugin tests](../../tests/plugin.test.ts), and [package smoke](../../scripts/opencode-smoke.mjs).
- Outbound: [core engine/types](../core/README.md), [RawStore](../raw/index.ts), local [option parser](config.ts), and host-supplied `input`/mutable `output`; no command execution is introduced here.

## Change impact
- Hook keys/default export affect host discovery; metadata mapping affects success/completeness admission; presentation changes can expose unsafe ANSI/CR normalization.
- Mutated data is only `output.output`; command/title/attachments/metadata/raw preview must remain exact. Run plugin tests and [boundary teeth](../../tests/opencode-boundary.test.ts).
- Options are user configuration data; raw option/threshold changes affect local serialized records, save frequency, and replacement suppression on storage errors; run [raw tests](../../tests/raw.test.ts).
- Host-route claims require [real boundary/smoke proof](../../docs/OPENCODE.md); CI mocks cannot prove model-visible behavior on an installed host. CLI doctor reports package facts only, not host compatibility.
- No host execution/schema migration is owned here; synchronize [manual](MANUAL.md), [maintenance](MAINTENANCE.md), and [coverage](../../docs/COVERAGE.md).
