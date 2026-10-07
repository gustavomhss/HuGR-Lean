# Retired historical guide

> Not operational; do not register runners, trigger jobs or resume account setup. Current delivery uses GitHub gustavomhss/HuGR-Lean; CI remains deferred until completed candidate.

# AppVeyor on the GitLab mirror

Project: <https://gitlab.com/gmhelmold/hugr-lean> (ID `87207373`).
Clone origin: `https://gitlab.com/gmhelmold/hugr-lean.git`.
This is a configuration handoff, not evidence of a successful hosted build.

## Connect and run the first build

1. The user must connect their GitLab account/project in AppVeyor, or supply an
   authorized AppVeyor token out of band. No AppVeyor environment credentials are
   currently available for this handoff. Do not put credentials in the repository.
2. After the lead imports GitLab refs and pushes `ci/appveyor-gitlab`, use AppVeyor
   **New Project → GitLab** and select `gmhelmold/hugr-lean`. If using generic Git,
   use the clone URL above; confirm AppVeyor retrieves this branch's YAML through
   GitLab's API before relying on that route.
3. Leave **Ignore appveyor.yml** disabled. Use **Account → Validate YAML** for
   AppVeyor's own schema check. Set the AppVeyor project's initial default branch
   to `ci/appveyor-gitlab`, then start a manual **New build** on that branch.
   `main` intentionally remains at the old 0.2.0 state without this configuration.
4. Verify the displayed commit against the lead's pushed SHA. Record the build
   URL, commit, and results for **all three** images below. Check each lane's
   reported image, Node version, platform, architecture, and all four npm steps.
5. Before changing required checks, prove GitLab push/MR triggers, commit-status
   delivery, and branch protection actually block a deliberately failed build.
   A YAML file or a manual build alone does not prove integration equivalence.

## Gate contract

| Image | Node setup | Required runtime |
| --- | --- | --- |
| `Visual Studio 2022` | `Install-Product node 22 x64` | Node major 22, win32, x64 |
| `Ubuntu2404` | existing nvm, `nvm install 22`, `nvm use 22` | Node major 22, linux, python3 |
| `macos-sonoma` | existing nvm, `nvm install 22`, `nvm use 22` | Node major 22, darwin, python3 |

POSIX setup sources the image's existing `$NVM_DIR/nvm.sh` when nvm is not loaded
(default `$HOME/.nvm`). Missing Python, nvm, Node, or npm fails setup by name.
Windows setup requires the image's `Install-Product` helper and checks its exit
status. These are image labels and a major-version selection, not immutable VM
snapshots or a pinned Node patch. Image availability and account capacity still
need hosted confirmation.

`for.matrix.only` replaces the Windows install phase; bare `ps:` would also run
on POSIX. POSIX uses `sh:` (Bash). Common unprefixed commands use native CMD on
Windows and Bash on POSIX, preserving output and per-command failure status.
The common Node assertion rejects unknown images, platform mismatches, a major
other than 22, or non-x64 Windows Node before these ordered commands:

```sh
npm ci
npm run check
npm run smoke
npm pack --dry-run
```

`build: off` disables automatic MSBuild only. `check` includes structure checks,
typecheck, tests, and the package build. Smoke exercises the installed package;
`pack --dry-run` also invokes the existing prepack build lifecycle. All lanes are
required; failures are not allowed or skipped and fast-finish is not enabled.

## Triggers and rollout

No branch/path/tag filters are added. The YAML reference documents
`skip_branch_with_pr`, but does not establish its GitLab MR behavior. Keep default
triggers until a real MR proves that deduplication retains a required build for
every commit; then enable that documented option through a reviewed change.
Do not disable push builds to guess at deduplication. Superseded-build cancellation
is **Settings → General → Rolling builds**, a UI-only setting; enable it after
confirming replacement builds still run the complete matrix.

Keep the existing GitHub workflow until AppVeyor equivalence is demonstrated.
Git mirroring preserves objects, not GitHub PR metadata or release assets; their
old links remain historical. This route does not establish that GitHub's antispam
restriction has been removed. Hosted CI, GitLab statuses, trigger deduplication,
and protection remain unverified until the connection and runtime checks above.

## Vendor references

Configuration is original; it uses documented APIs rather than copied scripts.

- [YAML reference and validation](https://www.appveyor.com/docs/appveyor-yml/)
- [Matrix overrides, script errors, generic Git, rolling builds](https://www.appveyor.com/docs/build-configuration/)
- [Native shells and cross-platform PowerShell](https://www.appveyor.com/docs/getting-started-with-appveyor-for-linux/)
- [Windows Node selection](https://www.appveyor.com/docs/lang/nodejs-iojs/)
- [Detailed Linux image software](https://www.appveyor.com/docs/linux-images-software/)
- [Detailed macOS image software](https://www.appveyor.com/docs/macos-images-software/)
- [Branch defaults and manual builds](https://www.appveyor.com/docs/branches/)
- [Worker image and commit environment variables](https://www.appveyor.com/docs/environment-variables/)
