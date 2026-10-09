# B05 sources, pins, license and modification record

Native captures: webpack **5.102.1**, webpack-cli **6.0.1**, isolated public npm
installation; exact root `package.json`, entire transitive `package-lock.json`,
installed producer package manifests and native Node/npm/CLI version outputs stored.
`webpack-registry.json` / `webpack-cli-registry.json` retain exact registry metadata.
`measurements.json` records independently downloaded tarball SHA-512 SRI, matching
registry values. npm install also uses lockfile integrity. Tarballs are not vendored.

| Producer | Immutable upstream commit | Copied npm paths | License |
| --- | --- | --- | --- |
| https://github.com/webpack/webpack | `c7ebdbda637ea73a03a23446f5db0f600e304772` | `webpack@5.102.1/package.json`, `webpack@5.102.1/LICENSE` | MIT |
| https://github.com/webpack/webpack-cli | `480b33d23b277b3a55310bfc6dec8bcd3d4ed404` | `webpack-cli@6.0.1/package.json`, `webpack-cli@6.0.1/LICENSE` | MIT |

Copied files live under `producer/`; license filenames gain `-LICENSE.txt` suffix;
contents unchanged. Commit values are npm registry `gitHead`, not independently
attested package-to-Git source builds. SRI pins the actual registry distributions.
No runtime donor code copied. Tiny project source and capture scripts are original
campaign material under repository MIT license. Generated JS/assets are captured
build artifacts; webpack-generated runtime remains producer MIT material. These
artifacts are evidence only, not runtime package dependencies.

Original build sources live under `source/tiny café space/`; receipt lists exact
UTF-8 sizes and SHA-256s. Source contents copied unchanged from capture project.
Plugin correction changes three literal newline characters inside one JS string
to escaped `\n`; initial invalid config retained as
`plugin-initial-invalid.config.cjs`, corrected config at `plugin.config.cjs`.
Supplement runs bind original recipe failures and corrected producer-collision
captures without replacing any raw failure. All raw output is unnormalized.

Each command's argv is the actual local `.bin/webpack` executable path, never a
rewritten global launcher. Temporary root is recorded in receipt. Replay creates
a fresh isolated root: paths, timestamps, build duration and emitted/compared
status can change. Historical captured bytes remain the reference, not a claim
of byte-for-byte deterministic fresh webpack output.
