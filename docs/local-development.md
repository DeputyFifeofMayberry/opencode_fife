# Local development

Use the installed `dev` build to work on this repository. Edit source on `dev`, verify the change, and install a new local build when ready. GitHub holds source history and backup. Preserve `main` for future release work.

1. Start the working app:

   ```powershell
   Set-Location 'Y:\Coding_Projects\opencode_fife'
   opencode .
   ```

2. Edit and run the applicable checks. For a TUI change:

   ```powershell
   bun run lint
   bun run --cwd packages/tui typecheck
   bun run --cwd packages/tui test
   ```

   Use the affected package and regression tests. Check callers when contracts change. Run root `bun run generate` after public Protocol/Server `HttpApi` changes. Use root `bun run check` and broader tests for shared configuration, dependency, or broad changes. Run tests through package scripts, never root `bun test`. The pre-push hook still checks package types.

3. Review the diff and commit a coherent checkpoint. A single task can work directly on `dev`. Use separate branches and worktrees for independent concurrent tasks, with one writer per checkout. Integrate locally after checks. Push to `origin` when you want source backup and remote-operation authorization permits it. No PR or GitHub build is required.

4. Finish source edits, then build and install:

   ```powershell
   bun run install:local
   ```

   The installer assigns a timestamped `dev` version, builds Windows x64 with its embedded web UI, and runs the compiled service smoke test using temporary data and an operating-system-assigned port. Failed builds, failed smoke tests, or a changed source fingerprint stop installation. Relevant lint/typechecks/regression tests remain your responsibility before this command. Run one build/installer at a time per checkout.

5. When sessions and terminal work are idle, close old clients and launch `opencode .` again. The new client can replace an older shared `dev` server. The installer itself does not stop or restart it. Verify the changed behavior in the installed app.

Source edits do not change an already running compiled executable. Configuration, plugins, and project files remain live inputs. Installing changes the executable on disk; existing processes continue running their previous code. `opencode --version` shows the executable on disk.

For TUI testing against your real sessions:

```powershell
bun run dev:live 'Y:\Coding_Projects\opencode_fife'
```

Use `bun run dev:vite:live` with the same directory for Vite development. Both attach to the installed server without automatically replacing it. They share real sessions, tool actions, and the `dev` TUI state. Backend source changes need a separate source server or a newly adopted compiled build.

For backend testing, open a fresh PowerShell window and use disposable app state and a disposable project:

```powershell
Set-Location 'Y:\Coding_Projects\opencode_fife'
$sandboxRoot = Join-Path $env:LOCALAPPDATA 'OpenCode-Fife-Sandbox'
$sandboxProject = Join-Path $sandboxRoot 'project'
New-Item -ItemType Directory -Path $sandboxProject -Force | Out-Null
$env:XDG_CONFIG_HOME = Join-Path $sandboxRoot 'config'
$env:XDG_DATA_HOME = Join-Path $sandboxRoot 'data'
$env:XDG_STATE_HOME = Join-Path $sandboxRoot 'state'
$env:XDG_CACHE_HOME = Join-Path $sandboxRoot 'cache'
$env:OPENCODE_TEST_HOME = $sandboxRoot
$env:OPENCODE_CONFIG_DIR = Join-Path $sandboxRoot 'config\opencode'
$env:OPENCODE_DB = Join-Path $sandboxRoot 'opencode.db'
Remove-Item Env:OPENCODE_CONFIG, Env:OPENCODE_CONFIG_CONTENT -ErrorAction SilentlyContinue
bun run dev $sandboxProject --standalone
```

Close that window afterward. Configure test credentials separately. This isolates app state, not operating-system permissions. Worktrees alone do not isolate databases, servers, sessions, or credentials. Source execution defaults to the `local` channel; daily packages use `dev`.

The installed build record is `%USERPROFILE%\.local\bin\opencode-build.json`. It records the build version, source commit, dirty-tree status, source fingerprint, executable hash, installation time, and previous-build archive. A dirty build includes local changes beyond its recorded commit. The before/after fingerprint detects changes remaining at the end of packaging; it cannot prove that a file was never briefly changed and reverted during the build.

Previous builds are retained under `%USERPROFILE%\.local\share\opencode-fife-builds`. To roll back:

1. Save work and close clients, then run `opencode service stop`.
2. Copy the selected archive's `opencode.exe`, `opentui-*.dll`, and `opencode-build.json` (when present) into `%USERPROFILE%\.local\bin`.
3. Reopen `opencode .` and verify it. The first archive may lack a build record because the earlier installer did not create one.

Test database migrations with disposable data first. Stop the server before backing up its database; an old executable may not understand a migrated database. GitHub does not back up ignored binaries, sessions, databases, or credentials.

GitHub Actions and distribution update checks are disabled for this personal setup. Workflow YAML files remain available for a future release. To resume publishing later, explicitly choose the release branch, configure the fork's release jobs and credentials, re-enable Actions, and run the relevant release checks. Current inherited release workflows target `dev`/`beta`; preserving `main` does not make it a configured release branch.
