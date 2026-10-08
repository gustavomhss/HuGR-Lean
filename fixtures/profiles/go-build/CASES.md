# G04 cases — CAPTURED, awaiting lead review

Every ID below has prefix `G04/`; input is `captures/<id>.output`, independent
expectation is byte-exact input, manifest status `passthrough`, removable bytes 0.
Actual command, exit facts and SHA reside in flat `cases.json` plus native receipt.

| ID | Native variant / result | Exact-only reason |
| --- | --- | --- |
| build-verbose | `go build -v ./...`; 108 bytes, exit 0 | Requested three-package list, all preserved |
| build-all | `go build ./...`; empty, exit 0 | NO_NOISE |
| build-packages | `go build ./lib ./cmd/quiet`; empty, exit 0 | NO_NOISE |
| build-tag-verbose | `go build -v -tags=capturetag ./...`; 108 bytes, exit 0 | Requested three-package list, all preserved |
| build-tag | `go build -tags=capturetag ./...`; empty, exit 0 | NO_NOISE |
| build-target-output | `go build -o quiet-native ./cmd/quiet`; empty, exit 0 | NO_NOISE; native darwin/amd64 target |
| vet-all | `go vet ./...`; empty, exit 0 | NO_NOISE |
| vet-packages | `go vet ./lib ./cmd/quiet`; empty, exit 0 | NO_NOISE |
| vet-tag | `go vet -tags=capturetag ./...`; empty, exit 0 | NO_NOISE |
| build-error | `go build -tags=buildbad ./...`; 85 bytes, exit 1 | Diagnostic/nonzero |
| vet-error | `go vet -tags=vetbad ./...`; 94 bytes, exit 1 | Diagnostic/nonzero |
| explicit-goos-unsupported | `go build -GOOS=linux ./...`; 123 bytes, exit 2 | UNSUPPORTED_NATIVE_GRAMMAR; flag rejected |
| run-quiet | `go run ./cmd/quiet`; empty, exit 0 | NO_NOISE |
| run-arbitrary | `go run ./cmd/noisy`; 2,731 bytes, exit 0 | Arbitrary stdout/stderr, Unicode, native-shaped collisions, no-LF tails |
| run-arbitrary-nonzero | `go run ./cmd/noisy fail`; 2,746 bytes, Go exit 1 | Same application bytes plus native `exit status 23`, all exact |

Baseline grammar: `src/profiles/go.ts` only admits bounded `go test -v` argv.
Build/vet/run remain unsupported command grammar at this baseline. Silent cases
are no-noise evidence, not reduction support. No all-undefined profile was added.
`-GOOS=linux` is a real rejected command, not successful cross-compilation. Explicit
cross-GOOS success remains outside this no-environment-assignment packet; lead scope
decision required before claiming target coverage beyond darwin/amd64.

Checks: `npm ci`, `npm run typecheck`; receipt/source SHA verification and in-memory
corruption probes. No profile test, baseline red/green or material savings claim:
capture-only packet. Lead owns corpus registration/public-filter checks and review.
