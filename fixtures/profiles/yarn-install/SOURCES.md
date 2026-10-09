# P03 sources

- Original authored capture recipe and tiny projects: this directory, MIT repository license.
  No donor parser/code/fixture copied; source transformations: none. Generated Yarn locks and
  npm tooling locks retained; downloaded package implementations are not committed.
- Local tooling distributions: public `https://registry.npmjs.org/yarn` at **1.22.22** and
  `https://registry.npmjs.org/@yarnpkg%2fcli-dist` at **4.10.3**, BSD-2-Clause.
  `classic-tooling-lock.json` / `berry-tooling-lock.json` pin resolved tarball URLs and
  SHA-512 integrity; tooling install commands/exits are documented by recipe and native logs.
- Tiny public graph: **chalk 4.1.2**, MIT, fetched by original bare Yarn install.
  Generated project Yarn locks pin dependency resolutions/checksums. No large application
  builds, global installs, private registries, npm/pnpm corpus captures or copied donor code.
- `cases.json`: original command, argv, pinned executable path/version, platform, cwd,
  observed termination, complete pipe boundary, unknown presentation and raw SHA-256.
  LF-ended bytes use raw files; no-LF bytes use inline output without adding LF.
- `capture-attempts.json`: original failed attempts archived losslessly as inline UTF-8
  output plus original SHA-256; their schema remains `hugr-lean/native-cases/1`.
  It is an archive, not a reserved common C02 receipt; no `provenance.record` indirection.
- `capture-context.json`: capture root, Node/platform and final recipe hash. Recipe evolved
  during recovery; this hash identifies final reproduction recipe, not a historical attestation
  of every earlier process. Raw hashes attest stored bytes, not an external notarization.
