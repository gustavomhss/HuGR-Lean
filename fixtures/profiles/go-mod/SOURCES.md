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

Original 16 captures remain conservative passthrough. The three default-get
captures added after lead approval use source baseline
`bc5e12fc78aa190a9ec9863ca41cd96e4e3a0ea0`, native Go 1.27.1 and disposable
`G05-default-native`; direct Python subprocess with the same regular-file boundary.
Original manifest output, hashes, and before/after source snapshots remain intact.

Default-get additions use a bounded `file://` Go module proxy with fresh per-case
caches, GOSUMDB=off and no network. Public module archive/mod/info bytes are copied
from the previously authenticated v0.29.0 cache without modification; proxy list
contains only v0.29.0. Locally authored MIT dep/other proxy modules expose only
v1.0.0 and v1.1.0. Both versions contain `package dep\n` in dep.go and go.mod
`module <module-path>\n\ngo 1.24.0\n`; native proxy info uses timestamp
`2026-01-01T00:00:00Z`. Archive members are `<module>@<version>/go.mod` and dep.go.
These are native proxy downloads, not progress lines from a replacement or fake Go.
`proxy-sources.json` retains per-version SHA-256 of original mod/info/zip bytes
and verbatim archive-member source for locally authored modules. Public archive,
mod and info copies were compared byte-for-byte with the authenticated cache.
No source/application execution is needed for module commands. This bounded proxy
does not claim live latest-version registry resolution coverage.

Independent expected files transcribe only original added/upgraded rows, preserving
order and final LF. Focused tests inject the exported `go-mod` family into public
filter and verify reductions, exact refusals and source evidence. Default registry
registration is lead-owned and is not claimed by this branch.

## Path validation reference (cold-review correction)

Authoritative local source read: Go 1.27.1 at
`/usr/local/Cellar/go/1.27.1/libexec/src/cmd/vendor/golang.org/x/mod/module/module.go`,
lines 234–259, 297–342, 385–481, 503–558. Its vendored module pin in
`src/cmd/vendor/modules.txt` is `golang.org/x/mod v0.36.1-0.20260813213634-8569e2639ca1`.
Upstream repository: `https://github.com/golang/mod`; immutable commit:
`8569e2639ca10cf2c77d73ec4eb87a6b8e15ed69`; upstream path: `module/module.go`.
License: BSD-3-Clause, upstream `LICENSE` at that commit (local vendored LICENSE read).

No source code or comments copied. Independently authored TypeScript checks express
the domain-dot requirement and finite Windows-reserved component rule, matching
the case-insensitive component prefix before its first dot. Reserved names are
CON, PRN, AUX, NUL, COM1–COM9 and LPT1–LPT9, on every platform. Existing narrower
ASCII grammar remains closed. Path-only canonical major suffix checks and refusal
of unsupported gopkg.in conventions now apply to command operands as well as rows.
Tests are authored synthetic refusals and positive controls, not native captures.
