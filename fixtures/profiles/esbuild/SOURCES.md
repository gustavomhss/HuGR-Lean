# B03 native capture provenance

Original tiny source project authored for this packet; exact source bytes embedded
in capture-receipt.json under `sources`. No donor fixture/parser copied. Sources and
raw output unmodified. Captured public package MIT; immutable npm pin `esbuild@0.25.11`,
tarball URL and registry SRI recorded in receipt. Native darwin-x64 executable SHA-256
`d738f75cffad3327640cc22c306066a9d6e921c533cf6f10a947460ba891fbe1`.
Installed via public registry into isolated temporary package, no global install.

Actual commands in cases.json are direct binary invocations, original source file
paths, no aliases. Receipt gives cwd/platform/environment and shared-pipe EOF
boundary. Native build clocks retained as printed, not performance measurements.
All records complete, presentation unknown. Capture host date: 2026-10-09.
Sources/outputs survive inline JSON escaping exactly; size/hash uses UTF-8 bytes.
Hashes below are independent raw golden witnesses, not profile-generated results.

| Case ID | Raw UTF-8 bytes | Raw SHA-256 |
| --- | ---: | --- |
| B03-file-bundle | 127 | a95f41490b7207f395c4793bea491dde7882894f1b8efbcbe4156ba72b20bc3d |
| B03-multiple-assets-splitting | 388 | 09026f62c338776dcfb57672ab9ffa000bccf2a2fd4d63dced9314a9dd931bba |
| B03-warning-full-context | 835 | 4c96266a128c4573eb3afe69a921df4c59e00d2587d5d5dbc3f7c5e68cd77aed |
| B03-failure-full-context | 204 | 2a3ee2fa9283ed586fd66f9f28f6b8543753cd97619432c8246229a250eee77a |
| B03-stdout-bundle | 85 | a2a1e7cbb198aca2f9fa877475660796e5950beb17ee821202a370196d6d7f4b |
| B03-silent-file | 0 | e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855 |

Asset filesystem sizes/hashes in receipt bind native printed asset rows to real
files. Capture-only material: baseline profile implementation and campaign corpus
registration remain lead work; no completed reduction coverage claim.
