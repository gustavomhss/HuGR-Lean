# Security

## Reporting

Please report vulnerabilities privately through GitHub:
<https://github.com/gustavomhss/HuGR-Lean/security/advisories/new>.
Do not open a public issue for an unfixed vulnerability. You should get a reply within seven days.

Supported version: the latest published release. Release provenance establishes origin, not
absence of defects; the [delivery status](https://github.com/gustavomhss/HuGR-Lean/blob/delivery/github-ready/docs/DELIVERY.md)
describes known limitations of published 0.4.0.

## Data flow

- The OpenCode plugin rewrites tool-result text before the host sends it to the model. It makes
  no network requests, telemetry or extra model calls itself. This does not prevent OpenCode,
  tools, model providers or user-configured integrations from transmitting or retaining data.
- Summarization is not secret detection, redaction, encryption or a security boundary. Secrets
  may remain in summaries and originals. Do not use smaller output as evidence that data is safe
  to share with a model or another recipient.
- `lean_recall` returns a stored original or selected lines into the ordinary host/model tool-result
  flow. CLI recall prints to stdout; callers decide where that output goes. Any process with
  filesystem access can also read the records; they are not accessible only through these tools.

## Local recovery store

- Summarize mode enables storage by default. Originals are plaintext JSON files in
  `~/.cache/hugr-lean/raw` unless configured otherwise, and may contain whatever tools printed,
  including credentials and private files. Use a dedicated local directory, not a shared or
  cloud-synced location, unless that exposure is intended.
- POSIX validates current-user ownership and directory/file modes `0700`/`0600`. These checks
  do not establish isolation from POSIX extended ACLs, privileged processes or hostile directory
  swaps. Windows ACLs and extended ACLs on other systems remain caller-managed; restrict access
  on every OS. The store is cooperative local storage, not a filesystem sandbox.
- Defaults are 64 MiB of serialized record bytes and a seven-day TTL. Expiry cleanup is lazy:
  files may remain until a later operation. Summarize mode normally evicts the oldest records
  when full. Current unreleased source publishes before eviction to preserve existing evidence
  on write failure; a crash or later cleanup error may leave extra records above normal admission
  limits. The size limit is not a strict disk quota. Neither expiry nor purge is secure erasure,
  and neither deletes copies/backups.
- `"raw": false` disables plugin storage and lossy summaries. It does not purge older records
  or stop ordinary OpenCode/model logging. `"mode": "lossless"` disables summarize mode and
  leaves storage off unless explicitly configured.
- `hugr-lean raw purge` deletes validated records in the selected store (use `--directory PATH`
  for a custom store); unrelated files remain. Purge makes corresponding recall IDs unavailable.
- Host-side truncation happens before this package sees output. Recovery returns only the text
  captured at that boundary, not data the host already omitted. Expiry, eviction and storage
  errors can make recovery unavailable.

## Distribution

Published 0.4.0 has an npm registry signature and provenance attestation; its GitHub release
carries the tarball and SHA-256 checksum. See
[the release](https://github.com/gustavomhss/HuGR-Lean/releases/tag/v0.4.0).
Installation may contact npm even though the package's runtime has no network I/O.
