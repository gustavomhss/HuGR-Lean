# Security

## Reporting

Please report vulnerabilities privately through GitHub:
<https://github.com/gustavomhss/HuGR-Lean/security/advisories/new>.
Do not open a public issue for an unfixed vulnerability. You should get a reply within seven days.

Supported version: the latest published release.

## What the plugin does with your data

- It runs inside OpenCode and only rewrites the text of tool results before the model sees it.
- It makes no network requests and sends no telemetry.
- Summarized originals are written to a local directory (default `~/.cache/hugr-lean/raw`,
  created with mode `0700`), with a 64 MiB size limit and seven-day expiry. They can contain
  whatever your tools printed, including secrets. Use `"raw": false` to disable storage
  (this also disables summaries) and `hugr-lean raw purge` to delete stored records.
- Stored records are read back only by the `lean_recall` tool and the `hugr-lean recall` / `raw get` commands.

Releases are published from GitHub Actions with npm provenance; the GitHub release carries the
tarball and its SHA-256.
