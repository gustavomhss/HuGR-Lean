# G05 native Go module captures

Capture date: 2026-10-08. Baseline: `07ffe15` on `campaign/native-v2/G05`.
Producer: `go version go1.27.1 darwin/amd64`. Original, locally authored MIT
projects; no donor parser, fixtures, or dependency source copied.

`cases.json` uses `hugr-lean/native-cases/1`: flat cases, exact argv, exit code,
complete EOF, unknown presentation, version/platform, raw SHA-256, effective
environment, absolute original cwd, and original before/after file contents.
`null` means file absent, not empty. Source hashes cover each original source
and nested replacement module before and after. Root go.mod/go.sum may change;
application source and replacement modules must remain byte-identical.
The inline output equals the corresponding `.txt` byte-for-byte, including EOF.

Boundary: Go launched directly with Node spawnSync, stdin ignored, stdout and
stderr sharing one regular-file descriptor. No shell, terminal rendering,
normalization, filtering, output cap, or synthesized output. Each command had
a 90-second bound; every recorded command exited normally within that bound.
Projects and caches live under disposable `G05-native-final` in the approved
temporary directory. Fresh root required; cases execute in manifest order.
Cached cases reuse the immediately preceding project state/cache. Each named
cold cache starts absent. Independent offline caches also start absent even
though the same project previously completed an online download.

Isolation: fresh HOME/GOPATH/GOCACHE/GOMODCACHE; GOENV=off, GOWORK=off,
GOTOOLCHAIN=local, empty GOFLAGS/private-module settings, GOVCS=*:off.
Public network only: proxy.golang.org and sum.golang.org. Offline cases use
GOPROXY=off and GOSUMDB=off. Local example.com modules use relative replacements;
missing-module lookup is offline, not evidence of an HTTP registry 404.

Only public module: `golang.org/x/text@v0.29.0`; original `-json` output records
upstream commit `e69f31bf9cf2f46bd3325bc9bad37fe9001731c2`, module/cache paths,
and Go checksum identities. Dependency license: BSD-3-Clause, upstream
`https://go.googlesource.com/text/+/e69f31bf9cf2f46bd3325bc9bad37fe9001731c2/LICENSE`.
Dependency source was neither modified nor included here. Local tiny source
is retained verbatim inside snapshots; snapshots are sufficient to recreate it.

Some source contains an init function printing a native-looking downloading
line. Module commands do not execute application init functions. This is a
source/no-execution witness, not a captured application-log collision and not
permission to classify arbitrary `go run`/test stdout as module progress.
`download-json-cached` retains native stdout JSON as evidence, not executable code.

Capture-only: `status: passthrough` declares conservative corpus disposition;
public filter was not run and parser admission is not claimed. Independent
goldens, full-grammar admission, and preservation tests remain prospective lead
work. No reduction expected files are derived from current filter behavior.
