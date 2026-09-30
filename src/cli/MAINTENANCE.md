# CLI maintenance

Run from the integrated rebuild (`795df94` or later) repository root after `npm ci`; `tests/cli.test.ts` builds and spawns the compiled entry:
```sh
npx --no-install tsx --test tests/cli.test.ts tests/core.test.ts tests/raw.test.ts
npm run typecheck && npm run build
```
1. Reproduce through the actual built executable with exact arguments, supplied bytes, native exit/completeness facts, stdout/stderr, and process status.
2. Add admitted reduction and byte-exact failure/unknown/malformed-UTF-8 controls; verify raw recovery/purge, doctor JSON, version, and statuses 0/1/2. Test clean-installed bin discovery separately from the compiled entry.
3. Mutation-probe falsely defaulting exit/completeness to success or adding a newline to passthrough/recovered output; the CLI preservation tests must fail. Restore and rerun focused tests/typecheck/build.
4. Keep command execution out of CLI; map supplied facts into core without rewriting and report raw errors without claiming records are missing.
File budget: target 400 LOC, allow 600, tolerate 750; above 750 split argument parsing from user I/O within this package. Reconcile [manual](MANUAL.md) with the actual implementation.
