# Codex and Claude Code updates: opportunities for the FIFE TUI

Reviewed November 5, 2026. Release window: October 5 through November 5, Pacific time. Repository baseline: `dev` at `edab3236fb73ed209df51a7b3f0e915e20cca739`.

## Recommendation

The most valuable work is to **check approval safety and improve keyboard access to transcripts**. The approval item is a verification priority, not a finding that FIFE is broken. The strongest new feature candidate is keyboard-driven transcript selection and search. Next, check whether the TUI accurately distinguishes the chosen reasoning effort from the effort actually used. None of these requires copying another product wholesale.

The rankings weigh impact on trust and daily use against likely implementation cost. Costs are rough judgments, not estimates from an implementation plan. Source inspection establishes existing code paths; it does not prove runtime behavior. Validate the proposed gaps before building.

| Rank | Candidate | Recommendation | Expected impact | Relative effort |
| --- | --- | --- | --- | --- |
| 1 | Approval prompt safety and review | Test first; fix any confirmed gaps | High if a gap exists | Small to medium |
| 2 | Keyboard transcript selection and search | Investigate a focused implementation | High for keyboard and long-session use | Medium to large |
| 3 | Show chosen versus applied effort | Investigate available execution evidence first | High for trust and cost awareness | Medium; could require backend changes |
| 4 | Searchable prompt history | Prototype if recall is a frequent pain point | Medium | Small to medium |
| 5 | Reusable prompt presets | Consider after history search | Medium for repeated workflows | Small to medium |
| 6 | More explicit background-agent status | Investigate whether current states distinguish the useful cases | Medium for delegated work | Medium; dependent on available events |
| 7 | Reviewable idle compaction | Defer pending evidence of actual latency or cost | Uncertain | Large |

## Ranked opportunities

### 1. Make approval prompts hard to answer accidentally and easy to inspect

**What changed:** Claude Code fixed keys typed immediately after submission or before a slow approval appeared being applied to that approval. It also tightened review of calls that cannot be read in full. Codex added expandable patch details while an approval is open. Sources: [Claude Code 2.1.318](https://github.com/anthropics/claude-code/releases/tag/v2.1.318), [Claude Code 2.1.314](https://github.com/anthropics/claude-code/releases/tag/v2.1.314), [Codex 0.167.0](https://github.com/openai/codex/releases/tag/rust-v0.167.0).

**FIFE today:** [`PermissionPrompt`](../../packages/tui/src/routes/session/permission.tsx) already displays edit details and supports a fullscreen view. That is useful existing functionality. Source review alone does not establish whether delayed input can answer a newly opened prompt, or whether every long command and edit remains inspectable at small terminal sizes.

**Why it matters:** An unintended approval or an approval without enough context affects trust more than an ordinary display defect. The impact is conditional: no such FIFE failure was reproduced in this review.

**Proposed next step:** Exercise delayed prompts, rapid Enter and number keys, long commands and patches, small windows, multiple requests, and request cancellation. If a problem is reproduced, fix the relevant input handling or review flow; keep the full action accessible before approval. Verify keyboard and mouse paths. This does not suggest changing the user's configured autoaccept policy.

### 2. Add keyboard-driven transcript selection and search

**What changed:** [Codex 0.166.0](https://github.com/openai/codex/releases/tag/rust-v0.166.0) added keyboard selection with word, line and page movement, search and configurable shortcuts.

**FIFE today:** [`selection.ts`](../../packages/tui/src/util/selection.ts) and its tests cover mouse selection and copy-on-select; [`dialog-timeline.tsx`](../../packages/tui/src/routes/session/dialog-timeline.tsx) searches timeline entries. Those are not evidence of full keyboard text selection or search across transcript content. A targeted search did not identify an equivalent selection mode, but this needs runtime confirmation.

**Why it matters:** Finding and copying a specific passage in a long session is a frequent task, especially over remote terminals or without a mouse. Full-content search also makes old decisions easier to recover.

**Proposed next step:** Verify existing shortcuts and renderer support, then scope an explicit transcript mode: search visible and loaded history, move among matches, select by character/word/line and copy. Indicate when older history is not loaded, preserve the draft and focus, and handle scrolling, streaming and narrow terminals. Start with the smallest usable version; terminal rendering and large histories make the cost uncertain.

### 3. Distinguish selected effort from applied effort

**What changed:** Claude Code corrected displays that named a newly selected effort before the model applied it, and added a notice when a change may take effect later. [Claude Code 2.1.312](https://github.com/anthropics/claude-code/releases/tag/v2.1.312). Codex also enabled changing effort during a conversation for supported models. [Codex 0.165.0](https://github.com/openai/codex/releases/tag/rust-v0.165.0).

**FIFE today:** [`local.tsx`](../../packages/tui/src/context/local.tsx) tracks model/variant selection and pending selection commits; [`mini/runtime.ts`](../../packages/tui/src/mini/runtime.ts) maintains and displays an active variant. FIFE also has its own effort policy. This review did not establish that either TUI surface can always identify the effective effort of an in-flight model request, or that the provider actually honored it.

**Why it matters:** The selected setting, the setting sent on a request, and what a provider actually does are different facts. Confusing them can mislead decisions about task quality and API spending.

**Proposed next step:** Trace existing execution records and event data before designing UI. If reliable evidence exists, show the current request's applied or sent value, and label a changed selection as pending for the next applicable step. Show unknown when the provider does not report the outcome. Do not infer savings or change model routing without task-level benchmarks. Preserve existing tier and stage rules.

### 4. Search previous prompts, including pasted content

**What changed:** Claude Code improved reverse prompt search to match text inside collapsed paste placeholders and made cleared drafts easier to recover. [Claude Code 2.1.314](https://github.com/anthropics/claude-code/releases/tag/v2.1.314), [2.1.292](https://github.com/anthropics/claude-code/releases/tag/v2.1.292).

**FIFE today:** [`history-machine.ts`](../../packages/tui/src/prompt/history-machine.ts) and [`footer.prompt.tsx`](../../packages/tui/src/mini/footer.prompt.tsx) provide prompt history and previous/next navigation. I did not find a dedicated searchable history command in the inspected TUI paths; confirm its absence in the live interface.

**Why it matters:** Search makes a useful earlier instruction retrievable without repeatedly pressing Up. This is especially helpful for long prompts and repeated local workflows.

**Proposed next step:** Add a searchable picker over existing permitted history, including the underlying text of collapsed pastes where stored. Selecting a result should populate an editable draft, never send it. Preserve the current draft on cancel and respect existing history storage and privacy behavior.

### 5. Offer reusable prompt presets

**What changed:** [Codex 0.164.0](https://github.com/openai/codex/releases/tag/rust-v0.164.0) added numbered slots for reusable prompts and slash commands.

**FIFE today:** The TUI already has commands, skills and prompt history. A targeted search did not identify an equivalent user-managed prompt preset list. Existing skills can cover repeatable procedures, so presets should solve a distinct need: quick insertion of short, user-authored text.

**Why it matters:** Frequently reused prompts could be inserted consistently without creating a skill or finding an old conversation. This is convenience rather than a reliability requirement.

**Proposed next step:** If history search is insufficient, provide a small named preset list with save, edit, delete and search. Insert into the current draft with an explicit send afterward. Avoid duplicating skill or slash-command management and clearly indicate where presets are stored.

### 6. Clarify why a background agent is still running or has stopped

**What changed:** Claude Code made background-agent notices distinguish waiting on background work, messages that arrived too late and usage-limit stops. [Claude Code 2.1.299](https://github.com/anthropics/claude-code/releases/tag/v2.1.299). It also added a notice for an unanswered automatic tool check. [2.1.317](https://github.com/anthropics/claude-code/releases/tag/v2.1.317).

**FIFE today:** The TUI already has session activity, subagent views, permission handling, notifications and unread tab states, including [`session-tabs.tsx`](../../packages/tui/src/context/session-tabs.tsx). Whether each reason above is available and visible was not established here.

**Why it matters:** During delegated work, a generic spinner can leave the user unsure whether to wait, answer a request or intervene. Precise states help only when backed by actual events.

**Proposed next step:** Walk through live or fixture scenarios for waiting on a permission, long-running tool, usage limit, interruption and completion. Surface a specific reason only if the session system reports it reliably; otherwise retain an honest generic state. Avoid adding a separate agent dashboard until existing views are assessed.

### 7. Explore idle compaction only if measurements justify it

**What changed:** [Claude Code 2.1.299](https://github.com/anthropics/claude-code/releases/tag/v2.1.299) added optional idle-time summarization for large sessions, timed around its prompt-cache behavior. Later releases added safeguards for invalid summaries. [2.1.311](https://github.com/anthropics/claude-code/releases/tag/v2.1.311), [2.1.318](https://github.com/anthropics/claude-code/releases/tag/v2.1.318).

**FIFE today:** [`compaction.ts`](../../packages/core/src/session/compaction.ts) already supports a background summary as context approaches a threshold, and validates structured summaries. This is related but not the same trigger as idle-time compaction.

**Why it matters:** An idle-time approach might reduce a later wait or cache reprocessing for some providers. It can also spend tokens on a session the user never resumes, and provider cache rules differ. No saving has been measured for FIFE.

**Proposed next step:** Do not implement by default. First measure representative long sessions, provider cache behavior, compaction cost, and time to resume. Any future proposal should disclose extra model calls, preserve the original history and existing compaction controls, and handle invalid summaries safely.

## Already present or not recommended as new work

- **Unread session indicators:** Codex 0.167.0 added unread results. FIFE already tracks unread/attention states and offers next/previous unread tab commands in [`session-tabs.tsx`](../../packages/tui/src/context/session-tabs.tsx) and [`app.tsx`](../../packages/tui/src/app.tsx). The interfaces differ, so compare only if a specific workflow is missing.
- **Image previews:** Codex added local attachment previews. FIFE already exposes prompt and session image preview settings in [`config/index.tsx`](../../packages/tui/src/config/index.tsx). Compatibility and live appearance were not tested here.
- **Queue and steer controls:** Codex and Claude improved follow-up delivery. FIFE already supports queued prompts, steering, cancellation and undo through [`session/index.tsx`](../../packages/tui/src/routes/session/index.tsx). Do not change delivery semantics for parity; test actual problems against FIFE's documented session invariants.
- **Terminal status protocol:** Claude added OSC 7501 for compatible terminals. FIFE already implements it in [`program-status.ts`](../../packages/tui/src/context/program-status.ts). Terminal-specific behavior was not tested.
- **Project and worktree navigation:** Codex added repository filtering and directory grouping. FIFE already has searchable sessions, projects and worktrees in [`dialog-open.tsx`](../../packages/tui/src/component/dialog-open.tsx). Assess gaps through a real navigation task before adding another picker.
- **Process-daemon 0.5.0:** This is an upstream OpenCode change, not a Codex or Claude Code TUI release. The current repo uses protocol 7; do not upgrade the daemon package independently of its matching client. Its new pipe mode is explicitly out of scope on Windows. [Upstream change](https://github.com/anomalyco/opencode/pull/61875).

## Scope and evidence limits

- Reviewed the official Claude Code release notes for releases published in the window and selected official Codex stable release notes from 0.162.0 through 0.167.0, including the 0.162.1 patch. Codex 0.167.0 was published November 5 in Pacific time even though GitHub displays November 6 UTC. Pre-releases were excluded.
- GitHub's paginated Codex release API timed out, so this is a review of the named stable releases and their linked notes, not a guarantee that every patch release in the window was captured. Claude's release list returned 25 entries in the window. Product-specific cloud, enterprise and model-catalog changes were screened for relevance, not cataloged exhaustively.
- Findings about FIFE are based on targeted static inspection at the baseline commit, not a live TUI session, performance benchmark, or full audit. “Not found” is a candidate for verification, not proof of absence. No implementation, dependency update, tests, or installation was performed.
