# Agent Lessons Learned

## LL-001 — Performance stress case not checked against actual workload
- **Status:** Open
- **Reported By:** Spec Writer
- **Location:** `.opencode/specs/2026-11-06-session-context-investigation.md`; `docs/audits/cli-performance/`
- **Problem:** The investigation spec chose a synthetic tool-heavy scenario (500 messages, 20 parts each, 10,000 parts, 50 MB) without checking the repository's actual session data. The delivered benchmark measured a storage mode and scale that the current workload does not use.
- **Observations:** The local session database has zero `session_part` rows; all 21,253 parts from the last seven days are inline. The largest real session has 632 messages, 1,344 parts, and 3.89 MB. The entire week has 10,884 tool parts across 452 sessions, roughly the volume of one synthetic S3 session. The benchmark's `withParts` target therefore does not apply to the current inline path. Recommendation: before writing a performance investigation spec, query the actual session database for storage mode, session size, part count, and tool-call volume, and compare the proposed scenarios to that distribution.

## LL-002 — QA stage handoff omitted explicit user authorization
- **Status:** Open
- **Reported By:** Spec Writer
- **Location:** `.opencode/specs/2026-11-06-session-context-investigation.md`; QA stage handoff
- **Problem:** The first QA handoff stated that QA was authorized but did not quote the user's explicit approval. The QA agent stopped at its authorization check and returned Blocked without reviewing the work.
- **Observations:** The user had approved the QA stage in response to "Do you authorize QA?" The corrected handoff quoted the exact exchange and QA resumed. The stop consumed a round trip and delayed the review. Recommendation: include the user's exact approval wording and the review cycle in every gated-stage handoff.

## LL-003 — 20-iteration p95 was too unstable to decide the verdict
- **Status:** Open
- **Reported By:** Tester
- **Location:** `packages/core/script/benchmark-session-context.ts`; S3 measurement
- **Problem:** The benchmark's default 20 measured iterations made the S3 p95 the second-highest of 20 samples. The same tree produced p95 values from 93.24 to 120.51 ms across runs, straddling the 100 ms verdict threshold.
- **Observations:** The report's 20-iteration runs produced 93.24, 92.86, and 93.96 ms; the Tester's clean runs produced 120.51 and 115.77 ms. At 100 iterations, three runs produced 104.47, 103.66, and 121.93 ms, all above 100 ms, and the verdict became Material. The S3 median stayed stable at 85.21 to 85.90 ms. Recommendation: for tail-sensitive thresholds, use at least 100 iterations and decide from a distribution across multiple runs, not a single 20-sample p95.

## LL-004 — gstack setup defaults to unprefixed command names
- **Status:** Open
- **Reported By:** Build
- **Location:** `~/gstack/setup`; `.opencode/specs/2026-11-06-gstack-primary-stack.md`
- **Problem:** `./setup --host opencode` installs short command names by default, which collide with existing commands such as `/learn`. The install must pass `--prefix`.
- **Observations:** The setup help states `--no-prefix` is the default and `--prefix` is opt-in. The repo already has a `/learn` command. The install used `./setup --host opencode --prefix` and produced `gstack-*` skills and `/gstack-*` commands. Recommendation: always pass `--prefix` for this repo.

## LL-005 — Long-running gstack setup is killed by OpenCode server restarts
- **Status:** Open
- **Reported By:** Build
- **Location:** `~/gstack/setup`; OpenCode dev server
- **Problem:** Running `./setup` as a child of the OpenCode server cancels it when the dev server restarts, leaving a partial install and a stale registry.
- **Observations:** Two setup runs were cancelled during skill registration by server restarts. A detached Git Bash process started with `Start-Process` survived and completed the install. Recommendation: run long installs detached and read their log file instead of holding them in a shell call.

## LL-006 — gstack browser bootstrap stalls on the browse daemon's Chromium lock
- **Status:** Open
- **Reported By:** Build
- **Location:** `%LOCALAPPDATA%\RepoToolChest\browsers`; `~/gstack/browse`
- **Problem:** The Playwright Chromium install waits on a browser-directory lock held by the running gstack browse daemon, showing no download progress.
- **Observations:** The Playwright process held 0 MB read/write and the `__dirlock` directory was empty. Running `browse.exe stop` unblocked it; chromium-1254 and chromium_headless_shell-1254 then downloaded. Recommendation: stop the browse daemon before running setup or upgrading gstack.

## LL-007 — Editing agent files without installing leaves agent:status drift
- **Status:** Open
- **Reported By:** Build
- **Location:** `.opencode/agents/`; `script/agent-system/`
- **Problem:** Editing `.opencode/agents/*.md` without running the agent-system install leaves the repo copies and the global install out of sync, so `bun run agent:status` exits 1.
- **Observations:** After adding `disabled: true` to four agent files, `agent:status` reported four drifted files. `bun script/agent-system/cli.ts install --skipruntimeverify` synced them and `agent:status` exited 0. The runtime verification must be skipped because it asserts the disabled agents are enabled. Recommendation: install after any agent-file edit, and use `--skipruntimeverify` while agents are disabled.

## LL-008 — Disabling an agent leaves docs that name it as active
- **Status:** Open
- **Reported By:** Build
- **Location:** `AGENTS.md`; `.opencode/references/local-updates.md`
- **Problem:** Disabling an agent does not update the instruction files that describe it as the active routing primary, so the documented contract becomes false.
- **Observations:** After the four SDD agents were disabled, `AGENTS.md:41` and `local-updates.md:11` still said they retained their roles. The review caught the contradiction; both were corrected in `9f0376f32b`. Recommendation: grep the instruction files for every disabled agent name in the same change.

## LL-009 — gstack /ship assumes a feature branch, but this repo's default is dev
- **Status:** Open
- **Reported By:** Build
- **Location:** gstack `/ship`; `dev` branch
- **Problem:** gstack's ship workflow opens a PR, but this repository's default branch is `dev`; a PR from `dev` to `dev` is invalid.
- **Observations:** `gh repo view` reports `dev` as the default branch. The sprint pushed `dev` directly instead of opening a PR. Recommendation: use gstack's review and QA steps, but ship by pushing `dev`; only use `/ship` from a feature branch.

## LL-010 — Windows CRLF skews measurement scripts that mix working tree and git show
- **Status:** Open
- **Reported By:** Build
- **Location:** `packages/core/script/measure-cold-context.ts`
- **Problem:** A measurement script that reads the working tree with `Bun.file().text()` and the baseline with `git show` compares CRLF to LF on Windows, so the byte counts include line-ending churn.
- **Observations:** The script now normalizes both sides with `replaceAll("\r\n", "\n")`. The corrected comparison reports 71,145 to 49,025 bytes for the cold-context fixture. Recommendation: normalize line endings in any measurement that mixes working-tree and git-object reads.
