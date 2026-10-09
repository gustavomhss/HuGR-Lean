# P05 capture-only case ledger

Every row has ID `P05/<name>`, native input `<name>.txt`, full actual argv and
SHA-256 in `cases.json`. All dispositions are `passthrough`; `proposal: null`.
Expected evidence is the entire original capture, not an invented empty summary.
No filter test, reduction golden, removable-byte count or completed reduction
support is claimed. Independent lead review must decide grammar and usefulness.

| Name | Native variant / required evidence | Exit | Capture finding |
| --- | --- | --- | --- |
| public-fresh | Bare pip; colorama 0.4.6 metadata/download/install/version | 0 | Download sizes and package identity are meaningful; no progress bar in pipe snapshot |
| public-satisfied | Actual Python -m pip; package/version/environment path | 0 | Satisfaction evidence retained |
| public-cache | Bare pip force-reinstall; cached metadata/wheel, uninstall/version changes | 0 | Cache and change evidence retained |
| public-binary-progress-off | Python -m pip; original only-binary/progress-off; fresh target | 0 | Native cached package/install evidence retained; no runtime flags added |
| local-fresh | Bare pip; local root plus transitive dependency versions | 0 | Dependency/install associations retained |
| local-satisfied | Python -m pip; root plus dependency satisfaction | 0 | Both package identities and paths retained |
| requirements-constraints | Original -r/-c plus binary/progress-off; fresh target | 0 | Requirement file/line, dependency relation and versions retained |
| resolver-failure | -r/-c conflict; root dep==1 versus constraint dep==2 | 1 | Full conflict, environment caveat, numbered advice, ResolutionImpossible URL exact |
| offline-miss | Python -m pip; no-index unknown local package | 1 | No matching distribution diagnostics exact |
| offline-warning | Bare pip; no-index, missing find-links plus valid local wheels | 0 | Both repeated warnings, dependency/install summary retained |
| backend-logs | Python -m pip -v; tiny original PEP 517 in-tree backend | 0 | Native-shaped Collecting/Downloading/Successfully installed/user build logs, warning, timing retained |
| binary-satisfied-backend | Original binary/progress-off; backend package already installed | 0 | Genuine satisfaction snapshot; not a rejection witness |
| binary-reject-backend | Same named backend lookup, fresh target, wheel-only | 1 | No backend wheel available in find-links; full diagnostic exact |
| binary-explicit-source | Original binary/progress-off plus explicit local source, -v, fresh target | 0 | Backend still executes; wheel-only flag alone cannot prove producer identity |

## Decision boundary

Highest-value finding: pip-shaped lines can come from arbitrary build backend.
`--only-binary=:all:` still executes the explicitly requested local source backend.
A future finite wheel-only grammar would need to reject source paths, direct URLs,
editable installs and backend-capable options, then validate complete native output.
No such grammar is implemented or claimed by these captures.

Bounded public wheel is only 25 kB; pipe capture exposes download/cache evidence,
not a meaningful progress stream. Capture does not establish behavior for large
downloads, PTYs, other pip/Python versions, platforms or all install argv spellings.
No safe material deletion proposed. Mandatory reduction remains not implemented;
capture-only status is not a scope waiver. Native failures and ambiguity witnesses
stay exact. Integrity control described in SOURCES.md is not a parser test.
