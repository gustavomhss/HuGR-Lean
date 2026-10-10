# OpenCode maintenance

Run from the repository root after `npm ci`:
```sh
npx --no-install tsx --test tests/plugin.test.ts tests/opencode-boundary.test.ts tests/automatic-plugin.test.ts
npm run typecheck && npm run build
```
1. Record the actual host version/route, command, completion metadata, original output, and next model request; use [boundary instructions](../../docs/OPENCODE.md) for real-host replay.
2. Add an admitted reduction control and exact preservation regressions; verify title/metadata/attachments, failure facts, raw preview, and unchanged command.
3. For host-boundary changes, run `OPENCODE_BIN=/absolute/path/to/opencode node scripts/opencode-boundary.mjs --native` and `HUGR_PLUGIN="$PWD/dist/index.js" OPENCODE_BIN=/absolute/path/to/opencode node scripts/opencode-smoke.mjs` after build.
4. Mutation-probe mapping a native nonzero exit to zero or ignoring required raw-save failure; plugin preservation tests must fail. For automatic views, skip the MCP post-save revalidation or the `isError`/`resource.blob` refusal; `tests/automatic-plugin.test.ts` must fail. For harness changes, remove summary/metadata checks and require their teeth tests to fail. Restore and rerun focused tests/typecheck/build.

CI runs mocked harness teeth, not installed OpenCode; host/V2 compatibility must stay within [recorded proof](../../docs/OPENCODE.md).
File budget: target 400 LOC, allow 600, tolerate 750; above 750 split option parsing from host mapping inside this package.
Review [manual](MANUAL.md) and [blast radius](BLAST_RADIUS.md) when changing options, fields, or raw thresholds.
