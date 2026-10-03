# Retained control workspaces

Five marked failure controls and `git-status-mixed` prepare private retained copies
of their pinned project. Primary cases retain their original cwd/cache behavior.
The native catalog's 30 IDs, ordering, literal commands, exact code recipes,
markers, exit policies and independent oracles are unchanged. Each command still
runs once. Existing project commit, license and source-path records remain the
provenance authority; these are benchmark modifications, not upstream tests.

## Source and retention boundary

Preparation reads the source checkout; it never edits source files or its Git
index. The mixed-Git preflight uses
`git --no-optional-locks status --porcelain=v1 --untracked-files=all` to avoid an
index refresh. Only the private copy stages `README.md`; the captured command
remains literal `git status`.

The POSIX Python helper opens source directories read-only and pins directory
descriptors. Snapshot creation and recipe writes use descriptor-relative operations
with exclusive destination creation and identity checks. Regular file bytes are
copied, not hardlinked. The helper checks source versions and destination identities
before publication. Copies include the private Git index and prepared dependencies.
Symlinks retain their targets; this is not an OS sandbox for upstream executables.

Live enumerable `cwd`/`workspace` getters are installed after entry construction.
Before preparation and after restore, cwd names the source. During capture it names
the owned copy. Restore only resets memory context: no file restoration, deletion
or Git unstaging. Marked bytes, private staged state, partial failure images and
later foreign edits remain available in the retained workspace.
Transactions are one-shot: restore does not allow preparation again, even after a
failed attempt. A later prepare rejects with `CASE_ALREADY_PREPARED`.

## Artifacts and costs

`capture.json` stores actual provenance as `caseWorkspace`:
`source`, `cwd`, `retained`, `sourceReadOnly`. `failure.json` stores available partial
workspace metadata and `error.code`. Helper failure Buffer streams are archived
separately as `workspace-helper.stdout`/`workspace-helper.stderr` under the output
case directory; they never enter measured native stdout/stderr. Static modification
descriptions retain path/phase fields without dynamic workspace metadata, so replay
can compare non-timing catalog facts.

Python3 and POSIX descriptor-relative filesystem support are required; Python3 is
already needed by benchmark provisioning. Windows control preparation fails with
named `CASE_WORKSPACE_UNSUPPORTED`, with source/index preservation assertions rather
than skipped proofs. Snapshot setup time and retained-copy disk overhead fall outside
native-command and filtering timing. Historical captures and numeric reports remain
immutable; no upstream/native corpus rerun is implied by these synthetic checks.

The source-writing `edits` export and rollback helpers are retired. Workspace metadata
must be an object with an absolute string cwd, canonical source and both retention/read-only
flags true before replacing valid partial stderr metadata. Malformed stdout workspace
metadata rejects with `CASE_HELPER_PROTOCOL` for success and failure replies; raw buffers
and prior valid partial metadata survive. Valid unknown string failure codes/messages survive.
Before success publication, read-only realpath/stat checks require an existing directory
distinct from canonical source, with canonical parent equal to source's parent and basename
`.hugr-case-` plus exactly 32 lowercase hex characters. Source aliases, descendants,
unrelated paths and missing directories reject with `CASE_HELPER_PROTOCOL`; filesystem
causes remain attached. Published cwd is canonical. IPC mock controls use disposable real
owned-sibling paths for validation, but are not native filesystem or Windows-support proof.
