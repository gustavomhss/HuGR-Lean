# Retired historical guide

> Not operational; do not register runners, trigger jobs or resume account setup. Current delivery uses GitHub gustavomhss/HuGR-Lean; CI remains deferred until completed candidate.

# Self-hosted GitLab CI

Project: <https://gitlab.com/gmhelmold/hugr-lean> (ID `87207373`).
First branch pipeline: `ci/self-hosted`, baseline `ef9a00c`.

## Allocation and coverage

The user requested dedicated self-hosted verification after hosted quota refusal.
These jobs use local runners, not GitLab-hosted compute minutes. There is no hosted
tag or quota fallback. Native macOS and Linux Docker share the user's Mac; Linux
container success does not prove native macOS or Windows behavior.

| Job | Runner tag / executor / image | Start |
| --- | --- | --- |
| `verify-macos` | `hugr-lean-local-macos` / shell / no image | Automatic |
| `verify-linux` | `hugr-lean-local-linux` / Docker / `node:22.17.1-bookworm` | Automatic |
| `verify-windows` | `hugr-lean-local-windows` / native PowerShell / no image | Manual, blocking |

**No Windows host is available. The full matrix is pending**, even if Mac/Linux
pass. Windows uses `when: manual` and `allow_failure: false`; it must finish
successfully before this pipeline can be fully green. Do not treat its manual
state as success or emulate Windows proof on another OS.

## Routing and isolation

Workflow admits only project `87207373`, exact branch `ci/self-hosted`, protected
ref status `true`, and pipeline sources `push`, `web`, or `api`. Everything else
is rejected: tags, other branches, forks, merge-request pipelines, schedules,
and downstream pipelines. Push remains enabled with an open MR. Review changes
in a draft MR; the protected branch pipeline supplies execution evidence.

Before unpausing runners, the lead must protect the exact `ci/self-hosted` branch
with Maintainer-only push/merge. The lead registers runners locked to project
`87207373`, with `run_untagged: false`, `access_level: ref_protected`, and only
their assigned local tags. Tags route jobs; project locking and protection are
separate server-side controls that YAML cannot configure or prove.

Mac/Linux share `resource_group: hugr-lean-local-machine` to serialize jobs across
pipelines in this project. The lead also sets runner `concurrent = 1` in each
runner service configuration. Separate services need the shared resource group
to prevent overlap on the one Mac. All jobs are interruptible, have a 40-minute
timeout, and use `retry: 0`; superseded interruptible jobs are auto-cancelled.

## Runtime and gate semantics

Every job fails closed unless Node is exactly `22.17.1`, architecture is `x64`,
platform matches the job, Python is version 3, and Git runs successfully.
macOS requires preinstalled tools on native Darwin x64: no image, sudo, downloads,
or tool-version changes. Linux uses the official Node Bookworm Docker image and
installs Python/Git with apt only if either is missing.

Mac/Linux run these steps in order, preserving every `npm run check` stage:

```sh
npm ci
npm run structure
npm run typecheck
node --import tsx --test --test-concurrency=2 tests/*.test.ts
npm run build
npm run smoke
npm pack --dry-run
```

Only Node test-file scheduling is bounded to 2. The test glob and internal
process/concurrency tests are unchanged. Pack retains its prepack build.
POSIX setup uses `set -eu`; command errors fail the job.

Windows retains the original Node bootstrap: use preinstalled `22.17.1` or fetch
the official Windows x64 archive and `SHASUMS256.txt`, require one exact checksum
row, verify SHA-256, extract under `.ci-node`, and prepend PATH. Python 3 and Git
must already work. Its four commands remain `npm.cmd ci`, `npm.cmd run check`,
`npm.cmd run smoke`, and `npm.cmd pack --dry-run`. `check` runs structure,
typecheck, tests, and build. PowerShell uses `$ErrorActionPreference = 'Stop'`
and immediately checks `$LASTEXITCODE` after each native command.

## Ownership and proof boundary

The lead owns registration, branch protection, tokens, service lifecycle, GitLab
server lint, and actual runner execution. The CI author changes source only.
Private runtime root: `~/Library/Application Support/HuGR-Lean/gitlab-runner`.
Mac service label: `hugr-lean-gitlab-runner`; Linux container:
`hugr-lean-gitlab-linux`. Keep tokens and runner configuration outside Git; never
print credentials. Use runner-job-scoped Git environment settings to avoid
credential-helper hangs; do not change global Git configuration.

Local real-parser checks and mutations cover the closed job set, tags, workflow,
gate steps, runtime assertions, and blocking Windows declaration. They do not
prove GitLab server acceptance, runner protection, shell/executor compatibility,
or native job results. The lead must run server CI lint (including auto-cancel
and workflow semantics) and record actual job results separately. Runtime and
Mac/Linux results remain unknown until execution; Windows remains unavailable.
Existing GitHub/AppVeyor configurations remain alternatives and provenance;
historical or hosted successes do not prove this self-hosted matrix.
