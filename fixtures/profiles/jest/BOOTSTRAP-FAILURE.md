# First bootstrap failure

First `python3 fixtures/profiles/jest/capture.py` attempt failed before any native capture:

```
OSError: [Errno 28] No space left on device: '/private/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode/lean-native-v2-R02/fixtures/profiles/jest/install.log'
```

The npm subprocess had returned, but archiving its merged output failed. Its output and
exit code were not persisted; neither success nor an exact bootstrap-output claim is made.
The partially populated isolated tool directory remained at
`/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode/R02-jest-ei_x09fw/tools`.
Retry reuses only this agent's directory via `R02_TEMP`, repairing npm installation.
No foreign temp files were removed. This failure is not native Jest evidence.

First `finalize.py` attempt also stopped with `AssertionError` at its asset-equality
check: native HTML reporter prepends `/* eslint-disable */` plus LF to JavaScript.
Raw attachments were retained. Provenance was corrected to record this native
modification and compare immutable upstream bytes to installed source bytes separately.

Second finalization attempt stopped with `KeyError: 'integrity'`: repair-generated npm
lock omitted integrity for already unpacked Jest. Finalization now archives registry
metadata, verifies tarball SHA-512 integrity, and compares every installed Jest package
file with that tarball. Dependency lock omission remains explicit; no full dependency
artifact-integrity attestation is claimed.
