# Raw maintenance

Run from the repository root after `npm ci`:
```sh
npx --no-install tsx --test tests/raw.test.ts tests/plugin.test.ts
npm run typecheck && npm run build
```
1. Reproduce with a disposable dedicated directory, exact text/options, filesystem state, and actual owner/PID evidence; preserve existing records when diagnosing corruption.
2. Add success/refusal controls for serialized bytes, TTL boundary, identifier/link checks, unknown files, and exact Unicode/lone-surrogate recovery as relevant.
3. Use the real-process crash/reclaimer tests for publication or lock changes. Live, `EPERM`, malformed, or missing owners are ambiguous; age never proves death.
4. Mutation-probe full-store eviction or treating `EPERM` as a dead PID; retention/ambiguous-owner regressions must fail. Restore, rerun focused tests and typecheck/build, and inspect the diff.

Windows permission tests do not establish ACL isolation; inspect CI skips and keep POSIX ownership/mode assertions distinct from caller-managed ACLs on all OSes.
File budget: target 400 LOC, allow 600, tolerate 750; above 750 split record handling from locking within this package.
Update [manual](MANUAL.md) and [blast radius](BLAST_RADIUS.md) for format, defaults, retention, or error changes.
