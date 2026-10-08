# Go utility acceptance evidence

Original MIT fixture programs, no donor code. Native producer commit:
`739849a945d5173b00ce50c347bb568b0335b35f`, path `scripts/utility-native-go.mjs`,
SHA-256 `6baace859cc099780cce0b561f96c6f7af310f9e739378813846894fca53ecfc`.
Producer baseline: `882585e5f916821a482d14bc7bfe7d6a102b772a`.

Immutable native root: `hugr-lean-utility-go-native/.native-captures/go-zHh7jh`.
All original/stdout/stderr/receipt/source files copied byte-exact; no relocation,
recapture or rewriting. Producer snapshot is inert evidence, never executed or
imported. Receipt facts are direct. `producer-source.mjs` maps the exact receipt
snapshot name; `source-inventory.json` binds copied and executed `programs/`
snapshots. `captures/go-version/` holds the exact tool receipt and streams.
Manifest retains source receipt-relative names and actual captured tool versions:
Go `go version go1.27.1 darwin/amd64`; Node `v22.17.1`.
Each receipt binds source hashes, command/cwd, isolated environment, native spawn,
termination, arrival-order capture, duration boundary, producer and errors.
Private producer failed-capture inventory and originals remain at native root.

Every case command: `go test -v ./...`. Cold/cached independently retain original
one-based lines 1–3, 14–18, 31–33, including LF. Every retained line has zero-based
occurrence anchor; second `PASS` means occurrence 1. No filter used for goldens.
Failure, diagnostic-only and opaque expected logs equal original byte-for-byte.
Material means >=1,024 UTF-8 bytes saved and >=10% input. Both noisy cases qualify.

Modification record: copied native artifacts unchanged; authored manifest,
independent expected logs, occurrence anchors, acceptance tests and this note.
Native duration is provenance, not filtering latency or build-performance claim.
