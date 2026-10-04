# Native GitLab CI

Project: <https://gitlab.com/gmhelmold/hugr-lean> (ID `87207373`).
Initial branch: `ci/gitlab-native`, baseline `30cf5cc`.

## Allocation and coverage

The user authorized the namespace's Free GitLab compute allocation. Linux small
and Windows medium runners were confirmed online for this namespace at planning
time. Compute minutes are charged to the namespace even for public projects;
the remaining balance is unknown. Public visibility does not imply unlimited use.

| Job | Runner / image | Start |
| --- | --- | --- |
| `verify-linux` | `saas-linux-small-amd64` / `node:22.17.1-bookworm` | Automatic |
| `verify-windows` | `saas-windows-medium-amd64` / provider Windows VM | Automatic |
| `verify-macos` | `saas-macos-medium-m1` / `macos-15-xcode-16` | Manual, blocking |

Hosted macOS requires Premium/Ultimate or an eligible Open Source program;
Free namespace entitlement is not assumed. Its job uses `when: manual` and
`allow_failure: false`: **Linux/Windows green is not a full green matrix**.
Until macOS is run successfully, the pipeline remains blocked and macOS coverage
is pending. This configuration never automatically starts paid macOS compute.
An operator must establish entitlement and authorization before starting it.

## Runtime and script semantics

All jobs assert native platform, architecture, exact Node `22.17.1`, and Python 3;
Git must work. Linux installs Python/Git through apt only if either is missing.
Windows and macOS use preinstalled Node only at the pinned version; otherwise
they fetch the official `nodejs.org/dist/v22.17.1` archive and `SHASUMS256.txt`,
require exactly one matching filename and SHA-256, then extract under `.ci-node`
and prepend PATH. Windows requires its provider's Python 3 installation.

Every job runs, in order, `npm ci`, `npm run check`, `npm run smoke`, and
`npm pack --dry-run`, with normal lifecycle scripts. `check` includes structure,
typecheck, tests, and build; pack retains its existing prepack build. POSIX setup
uses `set -eu`; each Windows native command immediately checks `$LASTEXITCODE`.
PowerShell cmdlet errors terminate via `$ErrorActionPreference = 'Stop'`.
Jobs are interruptible and never retry automatically. Linux/macOS have a 20-minute
timeout; Windows has 25 minutes because hosted VM/bootstrap and installed-package
checks reached the original limit during final packaging. Gate commands are unchanged.

Workflow permits merge requests, branch/tag pushes (including main), and web/API
branch pipelines. Only branch pushes with an open MR are suppressed to avoid
duplicate pipelines; web/API remain allowed. Superseded interruptible jobs are
auto-cancelled. Every admitted pipeline includes all three verification jobs.
Explicit job rules include MR pipelines; macOS retains its manual job-level `when`.

## Provider references and proof boundary

- [Windows runner documentation](https://docs.gitlab.com/ci/runners/hosted_runners/windows/)
  specifies PowerShell and the custom executor: **no `image` or `services`**.
  Its linked [image recipes](https://gitlab.com/gitlab-org/ci-cd/shared-runners/images/gcp/windows-containers/-/blob/main/cookbooks/preinstalled-software/recipes/languages.rb)
  document provider-installed languages; these moving recipes do not pin Node.
- [macOS runner documentation](https://docs.gitlab.com/ci/runners/hosted_runners/macos/)
  lists the M1 tag, GA `macos-15-xcode-16` image, and entitlement restrictions.

Local YAML parsing, contract mutation probes, and script syntax checks cannot
prove provider compatibility. The lead must run GitLab server CI lint (including
`workflow.auto_cancel` support) and actual provider jobs before claiming it.
Historical GitHub matrix success at `ae4c3b5` does not prove this GitLab matrix.
Record actual job results and pending macOS coverage separately.
