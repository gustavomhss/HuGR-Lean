# C06 local capture provenance

Captured 2026-10-08 on Darwin x86_64. Repository baseline:
`07ffe15e2263c2925778022194c5385807216603`; branch `campaign/native-v2/C06`.
No donor material. Project sources authored locally for this packet under repository MIT license.
Source files below are byte-identical copies of the disposable project at capture time;
modifications after capture: none. No external crates, registry access or global installs.
Cargo used `--offline --color never`; builtin probes stop at compile failure.
Custom binary prints a bounded fixed payload and exits; it is not the native bench harness.

Capture order: builtin 1.98; builtin filtered/ignored 1.91.1; custom 1.98;
custom collision 1.98; builtin qualified/exact/ignored 1.98.
The last failure recompiled after lower-bound Cargo; custom collision reused the custom build.
Source directory spelling is preserved as emitted by Cargo (`/private/var/...` versus supplied `/var/...`).
Cargo adds its own benchmark argument to harness=false executable; payload only tests for `collision`.
No runtime figures are inferred from fixture-authored stdout numbers.

Versions (actual executable output):

```
cargo 1.98.0 (797e8a9bc 2026-08-05)
rustc 1.98.0 (88d9e12ae 2026-08-18)
cargo 1.91.1 (ea2d97820 2025-10-10)
rustc 1.91.1 (ed61e7d7e 2025-11-07)
```

SHA-256 (file bytes, including inline capture and independent proposed-golden strings):

| Local path | SHA-256 |
| --- | --- |
| cases.json | b239b9ec545452c700e4b59814bb3146c65de72b4fffb7eff229b97cb5dea9c7 |
| source/Cargo.toml | af0a50aec6ad074441440a7466e4b45dfd3b3192be0a8cb56639e379cda24c24 |
| source/src/lib.rs | d933da918a380f7cc49115c833ad75787155d5c8e70b9dd31b93e18c897b8828 |
| source/benches/builtin.rs | 00750620ce6d579090b84c28a2688cbb2d81a06274ea5d75a53d421d73d40315 |
| source/benches/custom.rs | 24799a183ac55637bf9a1e99f6c058f3c39945a567246a059ef553056e1a0638 |

Raw strings live in JSON to preserve absent final LF without shell file writing.
No stdout/stderr concatenation is asserted: both complete streams remain separately recorded.
Compiler failures are native evidence; custom output is an authenticated arbitrary-output collision.
See CASES.md for precise builtin runtime blocker and unfulfilled benchmark requirements.
