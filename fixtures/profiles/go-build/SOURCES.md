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
