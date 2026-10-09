# L02 sources and replay

Native captures generated locally on 2026-10-08 from original tiny sources in
`capture.mjs`; no donor parser, fixture, or implementation copied. Modifications
to producer output: none. Sources/configurations are generated inputs, saved
before and after each command. Output retained as complete binary pipe bytes,
including ANSI, line endings, non-ASCII, experimental warnings, and failures.

Producer: public npm `@biomejs/biome@2.2.6`, MIT OR Apache-2.0.
Pinned path: package `bin/biome` launcher and optional
`@biomejs/cli-darwin-x64@2.2.6/biome` binary. Package tarball:
`https://registry.npmjs.org/@biomejs/biome/-/biome-2.2.6.tgz`.
Integrity: `sha512-yKTCNGhek0rL5OEW1jbLeZX8LHaM8yk7+3JRGv08my+gkpmtb5dDE+54r2ZjZx0ediFEn1pYBOJSmOdDP9xtFw==`.
Native x64 binary tarball:
`https://registry.npmjs.org/@biomejs/cli-darwin-x64/-/cli-darwin-x64-2.2.6.tgz`.
Integrity: `sha512-HOUIquhHVgh/jvxyClpwlpl/oeMqntlteL89YqjuFDiZ091P0vhHccwz+8muu3nTyHWM5FQslt+4Jdcd67+xWQ==`.
No upstream commit claimed: these are immutable npm artifact pins, not copied
upstream source. Capture version verified by original `biome --version`.

Replay in a disposable directory containing this package.json:

```json
{"private":true,"dependencies":{"@biomejs/biome":"2.2.6"}}
```

```sh
npm install --registry=https://registry.npmjs.org --no-audit --no-fund
node /absolute/worktree/fixtures/profiles/biome/capture.mjs \
  /absolute/disposable /absolute/disposable/project /absolute/replay-output
```

No global install. `capture.mjs` prepends isolated `node_modules/.bin` to PATH;
Python's subprocess executes original `biome` argv directly and merges stderr
onto stdout pipe before reading. Node drives captures only; observations record
Biome command identity. No shell chains, node-command relabeling, daemon, or npx
download fallback. Actual platform/release/Node version and original cwd appear
per case. Duration and diagnostic ordering may vary on replay; captures stay raw.

Hash recipe: SHA-256 over raw file bytes using `createHash("sha256").update(bytes)`.
Check `outputSha256`, UTF-8/raw `outputBytes`, every before/after `sourceSha256`,
and `configSha256` from capture-receipt.json. Validation must fail after changing
one output byte; restore afterward. Initial capture-only verification did not
claim production mutation coverage.

Verification receipt: repo `npm ci --ignore-scripts --no-audit --no-fund` and
`npm run typecheck` completed. Same compiler rejected an external intentional
number/string mismatch with TS2322. Disposable verifier checks every capture,
source/config hash, JSON line plus prefix/failure suffix, ANSI presence, and all
three fix-source transitions. Appending bytes to one warning capture must fail;
the verifier restores original bytes in finally and reruns validation.
`git diff --cached --check` reports native whitespace padding and final blank
lines in output.txt; these bytes are intentional producer evidence, retained.

Implementation extension: original receipt and all capture output/source bytes are
unchanged. Normalized cases.json carries flat observation metadata, actual argv,
existing fixture paths and dispositions; provenance links each full receipt row.
The original native-cases1 receipt is linked through metadata `captureReceipt`,
not the shared reader's common-schema `receipt`. Each case carries `record` pointing
to this file and `sha256` copied verbatim from its original `outputSha256` descriptor.
Replay writes a fresh capture-receipt.json only; it does not author goldens or
overwrite normalized cases. Independently authored expected.txt files remove only
the two approved terminal header bars. No shared JSON helper is used.

Implementation verification: `tsx --test tests/profile-biome.test.ts` and repo
`npm run typecheck`; only this owned test file is run. Initial empty-profile
scaffold failed both independent native golden assertions (`passthrough` vs
`reduced`); complete implementation passes them. Focused probes mutate only
owned `src/profiles/biome.ts`, then restore through explicit patches:

| Probe | Named test | Observed failure |
| --- | --- | --- |
| Drop info/warning message rows from kept spans | native oracle | primary body row not required |
| Drop source caret rows from kept spans | native oracle | `│ \t^^^` row not required |
| Drop safe/unsafe fix/help rows from kept spans | native oracle | Safe fix row not required |
| Remove numeric primary-warning/footer equality | primary warning counts | inconsistent `Found 2 warning.` reduced instead of passthrough |

Each probe exited 1; each mutation restored. Final focused suite and typecheck
rerun after restoration. Generic synthetic coverage additionally varies paths,
rules/messages, multiple warnings/files, wrapped paragraphs, and gutter widths.
All strict prefixes and every line boundary reject incomplete or unknown output.
Tests assert every original prefix/body/blank/footer row is a required source span;
independent goldens assert the exact only-two-bar complement.
