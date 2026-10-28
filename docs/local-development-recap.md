# Local development setup recap

Applied October 27, 2026, in `Y:\Coding_Projects\opencode_fife`.

The fork now uses local builds for daily use. GitHub Actions and distribution update checks are disabled. The new CLI is installed, the previous executable is archived, and the running server was left on its existing version. Follow [the daily workflow](local-development.md).

**Repository changes**

| File | Change |
| --- | --- |
| `AGENTS.md` | Made `dev` the daily integration branch, allowed single-task work directly on it, and replaced mandatory CI/PR integration with reviewed local merges. New task branches use local `dev` so unpushed work is included. Kept separate worktrees for concurrent tasks, one writer per checkout, Git safety rules, and remote-operation approval requirements. Added the local installation and idle-time adoption rules. |
| `CONTRIBUTING.md` | Added the personal-fork workflow as the governing route for local work. Kept upstream contribution rules for upstream submissions. Corrected the Bun requirement to the version pinned in `package.json`, currently 1.4.4. |
| `.opencode/references/definition-of-done.md` | Separated applicable local verification from public distribution and release requirements. Kept relevant lint, typechecks, regression tests, generated-contract checks, and runtime verification. Document-only changes do not require an application rebuild. |
| `script/install-local.ps1` | Automatically assigns a millisecond timestamp version on the `dev` channel. Runs the existing Windows x64 build and compiled service smoke test before replacing installed files. Compares the source commit, Git diff/status, and untracked-file hashes before and after verification; remaining source changes block installation. Archives the previous executable, OpenTUI DLLs, and any previous build record. Writes build provenance and an executable SHA-256 hash. Restores the old executable if the final staged-file move fails. Does not restart services. |
| `script/dev-live.ts` | Fixed the dropped first directory argument in normal mode, preserved Vite-mode forwarding, and rejected the `stopped` service-status result before reading a credential or starting a client. |
| `packages/cli/script/service-smoke.ts` | Chooses an available loopback port and passes that same port to both competing test servers. This preserves the service-election test while allowing the live daily server to keep its own port. Temporary app state remains isolated. |
| `packages/cli/test/dev-live.test.ts` | Added a regression test using compiled command fixtures. Checks a directory containing spaces, normal and Vite argument forwarding, the explicit server argument, and stopped-service rejection without contacting the live server. |
| `packages/cli/test/windows-opentui.test.ts` | Extended the existing compiled native-renderer installation test. Checks that smoke failure blocks installation, a successful install records a unique dev version and source provenance, the old executable is archived, and source changes during verification leave the installed build record unchanged. |
| `docs/local-development.md` | Added the daily commands, applicable-check guidance, concurrent testing and sandbox steps, build-record location, rollback steps, and future release considerations. |
| `docs/local-development-recap.md` | Added this record of the changes and verification. |

**Settings and installed files outside Git**

- GitHub repository `DeputyFifeofMayberry/opencode_fife`: changed Actions permissions from enabled to disabled. Submitted cancellation requests for 51 queued or pending runs. Follow-up queries found no queued, pending, or in-progress runs. Workflow YAML files remain unchanged in the repository.
- Created `C:\Users\barne\.config\opencode\opencode.json` containing `"update": "disable"`. There was no existing file at that path to overwrite. Other user configuration files were preserved. This disables distribution update checks; local updates still use `bun run install:local`.
- Installed `C:\Users\barne\.local\bin\opencode.exe`, version `0.0.0-dev-20261027183248265`. The installer continues to place the required hash-named OpenTUI DLL beside it when absent.
- Created `C:\Users\barne\.local\bin\opencode-build.json`. It records the version, `dev` channel, installation time, repository path, source commit, dirty-tree status, source fingerprint, executable hash, and previous-build archive path.
- Archived the previous executable and its OpenTUI DLLs at `C:\Users\barne\.local\share\opencode-fife-builds\20261027183340706`. Running that archived executable with `--version` confirmed `0.0.0-dev-202610270210`. It predates build manifests, so this first archive has no previous manifest.
- Saved the final build/install output under ignored `artifacts/local-workflow/install.log`. This local log is not part of the commit or a GitHub backup.

The installed package was built from base commit `9d1a6727dfe8d095188ab7b8b0f03711273a8aea` plus the local setup changes. Its manifest accurately records `dirty: true`; it does not claim that the base commit alone reproduces this package. The repository changes are saved in a local commit after installation. No push, PR, tag, or release was created.

**Verification completed**

| Verification | Result |
| --- | --- |
| Full CLI suite, `bun run test` in `packages/cli` | 342 passed, 15 skipped, zero failures across 55 files. |
| Final focused workflow/installer tests | Two passed, zero failures, 46 assertions, including the additional source-change check. |
| Root `bun run lint` | Passed. Existing repository-wide output reported 1,672 warnings and zero errors; SDK documentation checks reported zero problems. |
| Focused lint on the four changed TypeScript scripts/tests | Zero warnings and zero errors. |
| CLI typecheck | Passed: no type errors in 1,923 files across two projects. |
| PowerShell parser | No installer syntax errors. |
| Compiled service smoke test | Passed in three consecutive trials after correcting port selection, then passed again inside the final installer. Covers service election, credentials, authenticated and unauthorized routes, embedded web assets, plugin reload, and shutdown. |
| Real `bun run install:local` | Passed through build, smoke verification, source comparison, archiving, and installation. |
| Installed executable and archive | Confirmed both reported versions, archive existence, and equality between the installed executable's SHA-256 and its build record. |
| Real `dev:live` wrapper with the repository path and `--version` | Passed and reported the source client's `local` version without opening a session or replacing the server. |
| Git diff check | Passed. |
| GitHub and user preference readback | Actions disabled; no queued/pending/in-progress runs; update preference is `disable`. |
| Live daily server | Still PID `15992`, version `0.0.0-dev-202610270210`, at `http://127.0.0.1:28896`. |

The initial installation attempts stopped at the smoke-test gate before replacing the installed executable. Testing exposed a conflict with the live service's default port, then showed that separate port-zero allocations did not reliably elect one owner. Sharing one dynamically selected port corrected both issues; no live service restart was used to make the test pass.

**Preserved and remaining work**

- `main` remains at `07bae7483b6a7983bae2008407683097235e06c5`; GitHub's default branch is still `main`.
- `.github/workflows`, the pre-push hook, dependency versions, lockfile, and public release machinery are unchanged. The inherited release workflows still target `dev`/`beta`; future releases need explicit configuration and re-enabling Actions.
- Existing sessions, databases, credentials, and the running server were not migrated or restarted. A new normal client can replace the older shared server. Wait until agent work and persistent terminal work are idle, close old clients, then launch `opencode .` to adopt the installed version.
- Source edits remain separate from the running compiled app, but configuration and plugins can affect live work. The source fingerprint checks before/after state; it cannot detect a file briefly changed and restored during packaging. Avoid simultaneous edits or builds in one checkout.
- Public publishing checks, unrelated OS matrices, full-monorepo tests, live model requests, and interactive TUI/browser acceptance testing were not run. The changes concern development tooling and workflow settings. Exercise your next real session after adopting the installed build.
- Source changes are committed locally, not yet backed up to `origin`. GitHub backup still requires a push under the existing remote-operation approval rules. Ignored binaries and app data need separate backup if desired.
