# Vitest preservation witness

Verbatim copy from `HuGR-Lean@efad2b6658c3d8355edd78408fb59e9aadf038ae`,
`fixtures/profiles/vitest/R03-direct-reporter-config.txt` (MIT, root `LICENSE`).
Git blob SHA-1: `5cf7147e37377e3e6e4bd5a1e613cc53f3749b81`; UTF-8 size: 136 bytes.
Modification record: filename extension changed to `.raw`; content unchanged.
Source worktree: `/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode/lean-native-v2-R03`.

Native Vitest 3.2.4 configured reporter emits the whole successful stream as user
evidence. Source commit's `fixtures/profiles/vitest/{SOURCES.md,capture-receipt.json,capture-direct.py,inputs/}`
bind execution and reproduction. Published package/SRI pins do not attest upstream build-to-commit identity.
The old filter deleted ` 123ms`, yielding 130 bytes. Whole-stream retention is
intentional: grammar recognition cannot authenticate reporter provenance.
