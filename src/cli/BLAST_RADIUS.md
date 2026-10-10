# CLI blast radius

## Dependency edges
- Inbound: package `bin` points to `dist/cli/index.js`; `tests/cli.test.ts` spawns the compiled entry. Clean-installed bin discovery remains a separate proof.
- Outbound: [core filter](../core/index.ts), [profile registry](../profiles/index.ts) for doctor, [raw store/default directory](../raw/index.ts), Node filesystem reads of the package manifest, and stdin/stdout/stderr streams/arguments.

## Change impact
- Flags/defaults/result rendering affect supplied-output identity, completeness, presentation, exact bytes/newlines, stdout/stderr, and exit statuses 0/1/2; run `tests/cli.test.ts` and [core tests](../../tests/core.test.ts).
- Command mode depends on the [automatic core](../core/automatic.ts) and its registry; automatic reducer changes alter CLI stdout for complete exit-0 input. Run `tests/cli.test.ts` with `tests/automatic-core.test.ts`.
- Raw commands affect local `hugr-lean/raw/2` records, persisted writer expiry and purge; run [raw tests](../../tests/raw.test.ts), [expiry tests](../../tests/raw-ttl.test.ts) and CLI list/get/purge controls. Registry/manifest changes affect doctor JSON/profile IDs and version output.
- Bin/build/export changes affect installation and plugin loading; keep the root plugin-only default and `hugr-lean/core`/`hugr-lean/raw` library subpaths intact. Compiled-entry evidence does not establish clean-installed package behavior; align [manual](MANUAL.md).
