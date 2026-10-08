# G03 native capture provenance

Original project-authored MIT material; no donor code. Capture baseline:
`07ffe15e2263c2925778022194c5385807216603`; branch `campaign/native-v2/G03`.
Capture date: 2026-10-08. Tool: `go version go1.27.1 darwin/amd64`.
Platform: darwin/amd64; native CPU appears verbatim in every measured run.

Native cwd was
`/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode/lean-native-v2-G03/fixtures/profiles/go-bench/source`.
Environment inherited from this host, including its warm Go build cache; no overrides.
Source was executed in place. Each `cases.json` argv is the original `spawnSync("go", argv.slice(1))`
argv, not a rewritten recognition command. Shell quoting in the nested selector's command
string represents its one original argv element. No shell executed these captures.

Capture boundary: Node synchronous child pipes, UTF-8 stdout and stderr buffered separately,
45-second timeout per invocation, 1 MiB buffer limit. Every invocation exited 0; stderr was empty.
Thus recorded output equals complete stdout, without a stream-order reconstruction claim.
No terminal renderer, ANSI normalization, output edits, or filter-generated goldens.
Raw SHA-256 values in cases.json were computed directly from captured output, then compared
with `shasum -a 256` on the committed LF-terminated files. Expected outputs are separately
hand-transcribed literal goldens, including spaces, tabs, metrics and final LF.

Executed source SHA-256 (relative to source/):

| Path | SHA-256 |
| --- | --- |
| go.mod | 1222fe1fae5f49f40f06af3c9751391650004dfa0071056b176e8a8d69a3aa5b |
| tiny.go | c07ff91f9724f900f4df124b843e78b6918505863ce395592a2c35ff5859f259 |
| tiny_test.go | fdb003380b5f291a877dee54a9e64b36fea3a8eaf30791c8537c40054c38be61 |
| second/second.go | c40c19c77ca9e647e12c6cc1cc3237557e94d290e27aa368ef4a00dd680a3dc8 |
| second/second_test.go | f45baca59cc01312c8d526460cc7eacee251619c2cfcd17e80ce8985a386d289 |
| notests/notests.go | d65d102fff9b6a96ce2123688e02e78187f73e210475836947f05c83f96003d4 |

Original inventory command: `go list ./...`, exit 0, empty stderr. Exact stdout:
`"example.com/hugr-g03\nexample.com/hugr-g03/notests\nexample.com/hugr-g03/second\n"`.
SHA-256: `b77d57bb012d8f60bb8019b93c1c87ecc4309d950acdc996351e1cee49454249`.
This is inventory evidence, not an additional Go-test profile case.

Modification record: authored tiny sources, transcribed untouched native stdout,
authored flat case metadata, independent literal goldens and source/recipe notes.
Capture timings are evidence, not performance measurements of HuGR-Lean.
