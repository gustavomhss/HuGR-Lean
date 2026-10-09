# G04 native build, vet and run captures

Original MIT programs and producer; no donor material. Baseline commit:
`07ffe15e2263c2925778022194c5385807216603`. Producer path: `capture.mjs`;
SHA-256: `5b2c402ec0d3be5b8323c14d632a619965076d23b04a3db83509f0c454841b9a`.
Every project source SHA is recorded in `native-receipt.json.sources`.

Native capture on 2026-10-08: Go `go version go1.27.1 darwin/amd64`;
`captures/go-version.stdout` retains the exact native version output.
`captures/go-target.stdout` retains native `go env GOOS GOARCH`: darwin/amd64.
Project copied to disposable local cwd
`/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode/g04-native-vJb2ZJ`.
No external modules, environment assignments, shell chains or rewritten commands.
Inherited host environment/cache: these captures are local, not hermetic portability proof.

Producer spawns actual argv with native child pipes. It records stdout and stderr
separately and concatenates chunks in callback arrival order for the observation.
Combined output is this boundary, not a claim of kernel ordering across pipes.
Close observed without signal; all observations exited and complete, presentation unknown.
`native-receipt.json` binds argv, command SHA (UTF-8, no appended LF), cwd, start,
exit, version/platform and exact stream byte lengths/SHA-256. Stream hashes include
actual trailing LF where present; no LF is appended to unterminated application tails.

Modification record: producer-emitted `cases.json` renamed byte-exact to
`native-receipt.json`; independently authored flat campaign `cases.json`, CASES.md
and this note. Raw stream files and source snapshots unchanged. Producer is an inert
snapshot; running it again would overwrite evidence and is not verification.

All dispositions are exact. Silent success has no removable bytes; requested package
lists are evidence; diagnostics/nonzero and application-owned output must survive.
No material positive golden exists. Existing Go serial-test corpus is reused, not recaptured.
No parser, registry or core support is claimed by this capture-only packet.

## Successful cross-target supplement — 2026-10-09

Original MIT `supplement-project/{go.mod,main.go}` and `capture-supplements.mjs`;
no donor material. Base `22ddaa6`, recipe SHA/source bytes and SHA-256 recorded in
`supplement-receipt.json`. Old receipt, rejected `-GOOS` case and streams preserved.
Native command is actual argv `go build -o <absolute private artifact> ./...`.
Separate environment overrides select GOOS=linux, GOARCH=amd64, CGO_ENABLED=0,
private GOCACHE/GOMODCACHE/GOTMPDIR, local toolchain, disabled proxy/sumdb/GOENV,
empty GOFLAGS. Remaining host environment inherited; not hermetic portability proof.
Source copied verbatim; before/after source byte/hash/LF/tail facts equal.

Go compiler reports `go version go1.27.1 darwin/amd64`. Normal native exit 0;
stdout/stderr and callback-order combined output each zero bytes, both pipe EOF
events observed before close. No rewriting, env-prefix identity or invented LF.
Artifact inspected by reading bytes, not executing: ELF magic `7f454c46`, ELF64,
little-endian, machine 62 (x86-64), 1,899,924 bytes, SHA-256
`9765ad253caf81664a52b92b89bff71c537425a31fb1f0d25d984d55895302fe`.
Full 64-byte header and actual private path in receipt. Executable stays private;
committed evidence is metadata, not an archived executable. No foreign runtime proof.

Modification record: appended one stable passthrough record/inline empty expectation
and string archive declaration to cases.json; original case objects unchanged.
Supplement streams are native files; producer snapshots inert.
Receipt JSON layout compacted by `compact-supplement-receipts.mjs`; parsed metadata
deep-equal before/after, native streams and bound hashes unchanged.
Narrow verification: `node --import tsx fixtures/profiles/go-build/verify-supplements.mjs`.
Both families' 27 cases pass reader and public filter exactness checks; eight measured
controls reject and copied files restore. Original 15-case receipt checker retains
four existing controls. ELF corruption probe is memory-only; source/output/receipt
probes use disposable copies. Source/artifact checks belong to local supplement
verifier, not shared reader; shared reader checks declared receipt boundary facts.

Initial narrow runner failed `ERR_MODULE_NOT_FOUND` for absent tsx; `npm ci
--ignore-scripts` supplied locked dev dependencies. Next run exposed incorrect
assertion against nonexistent FilterResult.output (`undefined !== ''`); verifier
corrected to effective `replacement ?? observation.output`, then controls passed.
No full suite, typecheck, CI, runtime or shared corpus changes made.
