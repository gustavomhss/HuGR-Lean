# G02 native capture boundary

Historical capture-stage receipt. Native `.txt` files are generated process output, not synthesized fixtures.
Expected files were authored independently before implementation; current custom-profile results are in CASES.md.
Original local project lives at `/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode/G02-project`.
Sources are authored for this capture; no donor material copied.

## Receipt

- Baseline `07ffe15e2263c2925778022194c5385807216603`, branch `campaign/native-v2/G02`.
- Captured 2026-10-08, Go `go1.27.1`, executable `/usr/local/bin/go`, darwin/amd64.
- Native processes launched directly with argv matching `cases.json`; no shell, test2json conversion,
  output rewriting, terminal rendering, truncation or timeout. Capture timeout bound: 120 seconds.
- `subprocess.run(argv, stdout=PIPE, stderr=STDOUT, timeout=120)` in disposable project cwd.
  Raw returned bytes written unchanged to native `.txt`; JSON lines retain native stream order.
  Stderr merged at process pipe boundary; no post-hoc concatenation.
- `multi` then `cached` ran sequentially against identical sources and ambient Go cache.
  Real alpha/beta summary Output says `(cached)` in second capture; forged cache text is separate.
- Benchmark uses one native iteration solely to capture format; not a performance claim.
- Project source snapshot under `project/` matches disposable source byte-for-byte.
- Complete exit receipts: multi=0, cached=0, bench=0, build-failure=1, test-failure=1.
- Original UTF-8 bytes: multi=6433, cached=6438, bench=1690, build-failure=710, test-failure=1337.
- SHA-256 hashes in `cases.json` bind original bytes, including final newline.
- Expected files authored independently from reviewed native line evidence using apply_patch;
  no parser/filter output used. Manifest dispositions are now verified with the custom family profile;
  default registry integration remains lead-owned.

Reproduce from a disposable copy of `project/`, running manifest commands in case order.
Timestamps, interleaving and metrics vary; existing files are the exact completed captures.
