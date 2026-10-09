# P06 native uv capture sources

Capture-only packet at scaffold `07ffe15e2263c2925778022194c5385807216603`.
Native executable pin: `uv 0.11.18 (e32666915 2026-06-01 x86_64-apple-darwin)`.
`SOURCES.json` records executable hash, Python version/path, isolated temporary root,
original source material, setup commands and raw capture hashes. This is a local source
record, not a reserved campaign receipt or producer-authentication claim.

`cases.json` uses `hugr-lean/native-cases/1`. Every case repeats common boundary facts,
actual argv, command, environment, cwd, version, completeness and termination. Output is
inline JSON: exact UTF-8 decoded bytes, including EOF with or without LF. Hashes cover
output bytes, not JSON serialization. stdout and stderr share one pre-opened file; no
post-capture concatenation, normalization, ANSI stripping, truncation or command rewriting.

Synthetic local `p06-tiny` wheels (versions 1.0.0 and 2.0.0), virtual pyproject and backend
are original P06 material, MIT under repository license; wheel member contents and source
snapshots are recorded. No pip corpus or donor fixture was copied. Public `colorama==0.4.6`
comes from `https://pypi.org/simple`; no public package source is vendored. Version 0.4.5
occurs only in resolver/offline-error requests. Native lock snapshots record registry
artifact URLs, hashes and package versions. uv upstream is MIT/Apache-2.0, colorama BSD-3-Clause.

Isolation: dedicated environments/cache/HOME/TMPDIR; Python downloads disabled. Project
sync uses `package = false`; no project package build is implicit. `--no-build`, `--offline`,
`--locked`, `--frozen` appear only when actually supplied in recorded original argv.
Backend collision uses an original build-enabled command and intentionally fails after
printing native-looking progress plus diagnostic. Those lines are backend evidence, never
trusted progress. No reducer, profile, repo check/build/test/smoke/benchmark or CI is invoked.

`INTEGRITY.json` records one raw-hash negative control: appended in-memory corruption must
be rejected, original capture must still match. Scope is native byte integrity only.
