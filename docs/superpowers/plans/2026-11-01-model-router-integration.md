# OpenCode Model Router Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route delegated coding work to cheaper models automatically by installing and configuring `opencode-model-router` unchanged, while the fork's existing effort policy keeps sole ownership of reasoning effort.

**Architecture:** The upstream plugin registers `fast`/`medium`/`heavy` subagents and chooses their models. A custom preset omits every reasoning knob, so the fork's `EffortTransition` policy stays the only writer of child variants. The router's own effort and variant escalation are disabled; only its bounded model ladder remains. No fork source changes.

**Tech Stack:** OpenCode fork `2.2.5` (Bun, Effect), `opencode-model-router@2.9.1` (TypeScript v2 plugin, GPL-3.0-only, npm), JSONC configuration, PowerShell 7, and the existing `session-usage-report` ledger.

**Spec:** `docs/superpowers/specs/2026-11-01-model-router-integration.md`

## Global Constraints

- Baseline: branch `dev` at `385df1511406d00c7e7bdc5164bcf6da01bd1732`; working tree clean; `dev` equals `origin/dev`.
- No changes under `packages/**`. If a step appears to need source changes, stop and revise the spec first.
- Pin `opencode-model-router@2.9.1`. Never install `latest`, a branch, or a Git checkout.
- Tier models must be chosen from `opencode models` on this machine. Never copy model ids from documentation.
- Tier entries carry `model` and `costRatio` only. No `variant`, `effort`, `thinking`, or `reasoning`.
- Never add `variantSteps: "auto"` or `effortBump: true` while the fork policy owns effort.
- Do not create `.opencode/opencode-model-router.overrides.jsonc` in any repository.
- Do not write credentials into any file. The plugin reuses existing provider authentication.
- Run tests from package directories, never from the repository root (`bun test` there exits 1 by design).
- Tracked deliverables are documentation only; user configuration lives under `~/.config/opencode/`.
- `opencode service restart` and `opencode plugin remove` require the operator's explicit go-ahead in the session; pause before running them.
- Report only checks that actually ran. A step whose command did not run stays unchecked.

## Review Focus

The failure modes most likely to hurt a person using this integration, and the task that pins each:

1. **A tier model that cannot call tools.** The child starts, then cannot search or edit, and the failure looks like model quality. Pinned in Task 4.
2. **`fast` being asked to edit.** It is read-only by policy; a mechanical task routed there must fail visibly. Pinned in Task 4.
3. **Enforce rewriting a model the user explicitly asked for.** Advisory modes never rewrite; enforce can. Pinned in Task 8.
4. **Global verification commands escalating effort in an unrelated project.** Routing increases the number of children that can trigger them. Pinned in Task 1 (baseline record) and Task 7 (regression check).
5. **A router-driven model switch clearing the effort variant.** The fork re-applies its durable level on the next step; a silent reset mid-task would be a regression. Pinned in Task 4 (fork resume) and Task 7 (effort parity).

---

### Task 1: Baseline, matched workload, and regression gate

**Files:**
- Create: `docs/superpowers/notes/2026-11-01-model-router-rollout.md`
- Test: existing `packages/core/test/effort/*.test.ts`
- Scratch (not tracked): `%TEMP%\model-router-bench\`

**Interfaces:**
- Consumes: `opencode run --format json`, `opencode session list --format json`, `opencode session export <id> --sanitize`, `bun script/session-usage-report.ts`.
- Produces: the baseline half of the cost comparison; a fresh snapshot builder and a twelve-task table that Task 6 reuses unchanged.

- [ ] **Step 1: Record the exact revision and tree state**

Run from `Y:\CodingProjects\opencode_fife`:

```powershell
git rev-parse --abbrev-ref HEAD
git rev-parse HEAD
git status --porcelain=v1
git rev-list --left-right --count origin/dev...HEAD
```

Expected: `dev`, `385df1511406d00c7e7bdc5164bcf6da01bd1732`, empty status, `0	0`. If any value differs, stop: the plan was written for this revision.

- [ ] **Step 2: Run the existing effort regression suite**

From `packages/core`:

```powershell
bun test test/effort
bun typecheck
```

Expected: all effort tests pass; typecheck exits 0. If either fails, record it and stop; the integration cannot be judged against a broken baseline.

- [ ] **Step 3: Capture the pre-integration delegation behavior**

From the repository root:

```powershell
bun run dev:live
```

In the TUI, send:

> Call the subagent tool exactly once with agent `general`, description `baseline probe`, and prompt: "List the file names in packages/core/src/effort and return them. Do not edit anything." Then report the child sessionID and nothing else.

From a second terminal, with the child id:

```powershell
opencode session effort <childID> --format json
```

Expected: `agent` is `general`; `model` is the parent's model; `mode` is `adaptive`; `verificationCommands` lists the configured commands. Note model, selected variant, base level and next decision verbatim for Step 8. This is the "before" observation: a child inherits the parent model because no router tier exists.

Also record a pre-existing sharp edge: `bun test test/effort` is configured as a verifier but that path does not exist at the repository root, so a session that runs it there fails and opens an effort escalation. Do not change the command in this plan; note it for Task 7.

- [ ] **Step 4: Get spend approval and build the snapshot helper**

Pause and ask the operator to approve a screening ceiling for the baseline stage (proposed `$5`, from the benchmark contract in `perf/token-reasoning/README.md`). Note the approval and ceiling for Step 8.

Create the scratch root and define the helper in the execution shell:

```powershell
$bench = "$env:TEMP\model-router-bench"
$repo  = "Y:\CodingProjects\opencode_fife"
New-Item -ItemType Directory -Force $bench | Out-Null

function New-Snapshot([string]$name) {
  $dir = Join-Path $bench $name
  Remove-Item -Recurse -Force $dir -ErrorAction SilentlyContinue
  New-Item -ItemType Directory -Force $dir | Out-Null
  git -C $repo archive HEAD | tar -x -C $dir
  New-Item -ItemType Directory -Force (Join-Path $dir "run") | Out-Null
  Copy-Item (Join-Path $repo "perf/token-reasoning/fixtures/seed/*.ts") (Join-Path $dir "run")
  Get-ChildItem (Join-Path $dir "run") -Filter "*.verify.ts" | ForEach-Object {
    Rename-Item $_.FullName ($_.Name -replace "\.verify\.ts$", ".test.ts")
  }
  return $dir
}
```

Every run starts from a fresh snapshot, so edits never touch the repository and both policies see identical inputs. `run/` holds the materialized seed tests. Keep this PowerShell session open for Steps 6–7: the helper and `$bench`/`$repo` do not persist into a new shell.

- [ ] **Step 5: Freeze the twelve-task workload**

Use exactly this table for baseline and advise. Append it to the evidence file.

| # | Category | Prompt | Pass check |
|---|---|---|---|
| 01 | exploration | Where does the fork store durable per-session effort state? Write labeled lines `table:`, `file:`, `column:` to `exploration-answer.md`. | `bun run/check-exploration.ts durable-state` exits 0 |
| 02 | search/count | Count the `.ts` files under `packages/core/src/effort` recursively. Write only the number to `answer.txt`. | equals `(Get-ChildItem packages/core/src/effort -Recurse -Filter *.ts).Count` |
| 03 | extract | From `packages/core/src/effort/policy/types.ts`, write the exact `DecisionRule` members to `answer.txt`, sorted, one per line. | contains all six rules exactly |
| 04 | mechanical | In `run/`, make `slug-case.test.ts` pass by changing `slug-case.ts` minimally. Finish when `bun test run/slug-case.test.ts` passes. | test exits 0 |
| 05 | implement | Implement `toRoman` in `run/to-roman.ts` so `run/to-roman.test.ts` passes. Minimal implementation. | test exits 0 |
| 06 | debug/fix | `run/debounce.test.ts` fails on the leading option. Fix `run/debounce.ts` minimally so the file passes. | test exits 0 |
| 07 | debug/fix | `run/wrap-text.test.ts` fails. Fix `run/wrap-text.ts` minimally so the file passes. | test exits 0 |
| 08 | diagnosis | `run/parse-bytes.test.ts` fails. Write `answer.md` naming the failing input, expected value and actual value. Do not edit `run/parse-bytes.ts`. | `answer.md` names both the expected and actual values from the test |
| 09 | multi-step | Explain why `run/legacy-name.test.ts` fails in one line, then fix `run/legacy-name.ts` so it passes. | test exits 0 and the final text names the cause |
| 10 | architecture | Compare two ways to make per-agent effort defaults configurable here. Write `answer.md` with exactly two options, one cost and one benefit each, ≤150 words. | `answer.md` has two option headings plus `cost` and `benefit` |
| 11 | security | Audit `packages/core/src/effort/verify.ts`: list every process execution and state whether the command comes from user configuration or model input. Write `answer.md`. | mentions `runProcess` and `verification_commands` |
| 12 | composite | `run/parse-bytes.test.ts` fails. Explain the cause in `answer.md`, then fix `run/parse-bytes.ts`. Finish when the test passes. | test exits 0 and `answer.md` explains the cause |

Do not change prompts between policies. Append this sentence to every prompt: "If you delegate, call the subagent tool with `background: false` and wait for the result, then include the child sessionID in your final answer." If a seed test already passes on a fresh snapshot, replace that task with another seed and record the substitution; a pre-passing task cannot detect a regression.

- [ ] **Step 6: Run the baseline workload (plugin absent)**

At this point the router is not installed, so every run is the true baseline. First record the root model that both passes will use (the current default, without a variant) and pass it explicitly so a later default change cannot confound the comparison. For each task, create a snapshot, run from it, and export the session:

```powershell
$model = "<provider/model>"   # recorded once; reused verbatim in Task 6
$dir = New-Snapshot "t01-baseline"
Push-Location $dir
$elapsed = Measure-Command {
  opencode run --model $model "<prompt from the table>" --format json *> "$bench\t01-baseline.out.json"
}
$sid = (opencode session list --format json | ConvertFrom-Json)[0].id
opencode session export $sid --sanitize > "$bench\t01-baseline-root.json"
Pop-Location
```

Then export every child session the root reported. The fork's subagent tool returns `<subagent sessionID="ses_…">` in its content; extract ids from the root export text and export each:

```powershell
$text = Get-Content "$bench\t01-baseline-root.json" -Raw
[regex]::Matches($text, 'ses_[A-Za-z0-9]+') | ForEach-Object Value | Sort-Object -Unique | ForEach-Object {
  if ($_ -ne $sid) { opencode session export $_ --sanitize > "$bench\t01-baseline-$_.json" }
}
```

If the orchestrator reports a child id only in prose, export it the same way. A child that is not exported is indistinguishable from no child, so check the root's transcript for a subagent call before declaring "no children".

- [ ] **Step 7: Score and ledger the baseline**

Run the pass check from the snapshot root and record `pass` or `fail`. Record `wall_ms` from `$elapsed.TotalMilliseconds`. Build `$bench\manifest.json`:

```json
{
  "runs": [
    {
      "task_id": "01-exploration",
      "policy": "baseline",
      "root_session_id": "ses_...",
      "correctness": "pass",
      "stratum": "exploration",
      "provider": "<provider>",
      "model": "<root model>",
      "wall_ms": 12345,
      "billing_verified": false
    }
  ]
}
```

Twelve baseline entries. Then:

```powershell
Push-Location $repo
bun script/session-usage-report.ts "$bench\manifest.json" `
  --export "$bench\t01-baseline-root.json" `
  --format csv --out "$bench\baseline.csv"
Pop-Location
```

Repeat `--export` for every exported session. Expected: twelve rows; `usage_complete` and `cost_complete` true for priced providers. If the provider is unpriced, the dollar comparison is unavailable; record that and compare gross tokens only.

- [ ] **Step 8: Write the baseline evidence**

Create `docs/superpowers/notes/2026-11-01-model-router-rollout.md` with:

```markdown
# Model Router Rollout Evidence

Baseline revision:
Branch:
Date:
Operator:
Spend approval / ceiling:

## Task 1 — Baseline
- root model used for both passes:
- effort suite:
- core typecheck:
- baseline child model / variant / base level:
- verification commands:
- workload substitutions:
- ledger completeness (usage/cost):
- baseline cost per successful task:
- baseline gross tokens per successful task:
- baseline median wall time:
- baseline pass count:
```

Fill in observed values only. Do not paste transcripts or credentials.

- [ ] **Step 9: Commit**

```powershell
git add docs/superpowers/notes/2026-11-01-model-router-rollout.md
git commit -m "docs: record model-router integration baseline"
```

Completion criterion: revision recorded, effort suite green, a real child-model observation, twelve baseline runs with exports and a ledger, and no repository changes besides the evidence file.

---

### Task 2: Choose tier models and author the global overrides

**Files:**
- Create: `C:\Users\barne\.config\opencode\opencode-model-router.overrides.jsonc`
- Modify: `docs/superpowers/notes/2026-11-01-model-router-rollout.md`

**Interfaces:**
- Consumes: `opencode models`; existing provider authentication in `~/.config/opencode/opencode.json`.
- Produces: preset `fife` with three usable tier models; the routing/enforcement policy Task 5 onward flips between modes.

- [ ] **Step 1: List the local catalog**

```powershell
opencode models
```

Expected: one `provider/model` per line. If it fails, `opencode service start`, then retry.

- [ ] **Step 2: Select three models and record why**

Choose only ids present in that listing:

- `fast`: cheapest chat model that reliably supports tool calls, adequate for search, reading, and summarization.
- `medium`: a strong everyday coding model.
- `heavy`: the most capable available model for architecture, security, and hard debugging.

All three must be chat models (not image or decision models), authenticated, and ordered honestly by cost. Subscription-funded models are allowed. Append to the evidence file:

```markdown
## Task 2 — Tier selection
- fast: <provider/model> — reason:
- medium: <provider/model> — reason:
- heavy: <provider/model> — reason:
- billing: subscription | metered | mixed
```

- [ ] **Step 3: Write the overrides file**

Create `C:\Users\barne\.config\opencode\opencode-model-router.overrides.jsonc` with the chosen ids substituted:

```jsonc
{
  "activePreset": "fife",
  "activeMode": "normal",
  "presets": {
    "fife": {
      "fast":   { "model": "<fast>",   "costRatio": 1 },
      "medium": { "model": "<medium>", "costRatio": 5 },
      "heavy":  { "model": "<heavy>",  "costRatio": 20 }
    }
  },
  "enforcement": {
    "mode": "advisory",
    "verify": {
      "require": "whenDoDPresent",
      "defaultVerify": "deferred",
      "background": false,
      "requireExplicitDoD": false,
      "strictUnverifiable": false
    },
    "escalate": {
      "effortBump": false,
      "variantSteps": "none",
      "maxAttemptsPerTier": 1,
      "maxTotalAttempts": 3,
      "costCeiling": { "multiple": 4 }
    }
  },
  "routing": {
    "engine": "static",
    "profile": "balanced",
    "margin": 0.2,
    "roles": {},
    "background": { "mode": "off" },
    "outcomes": { "path": "~/.local/share/opencode/model-router" }
  }
}
```

The file is inert until the plugin is installed in Task 3. `background.mode: "off"` keeps delegations in the foreground for complete measurement.

- [ ] **Step 4: Preserve any existing operation mappings**

```powershell
$p = "$env:USERPROFILE\.config\opencode\opencode.json"
(Get-Content $p -Raw | ConvertFrom-Json).effort_policy.agent_operations
```

Expected: no output. If mappings exist, preserve them and add only the three below; never overwrite unrelated keys.

- [ ] **Step 5: Add tier operation mappings to the fork config**

Edit `opencode.json` and add `agent_operations` inside the existing `effort_policy` object, preserving `mode`, `base_level`, `verification_commands` and `clean_passes`:

```jsonc
"agent_operations": {
  "fast": "explore",
  "medium": "implement",
  "heavy": "review"
}
```

Rationale to record: under `mode: "adaptive"`, `explore` seeds `low`, `implement` seeds `standard`, `review` seeds `deep`. `mechanical` would also seed `low` but misdescribes read-only search.

- [ ] **Step 6: Commit the evidence**

```powershell
git add docs/superpowers/notes/2026-11-01-model-router-rollout.md
git commit -m "docs: record model-router tier selection and policy"
```

Completion criterion: the overrides file contains no reasoning fields; the evidence file names all three models and the mapping rationale.

---

### Task 3: Install the pinned plugin and prove the host loads it

**Files:**
- Modify: `C:\Users\barne\.config\opencode\opencode.json` (via the CLI, not by hand)
- Modify: `docs/superpowers/notes/2026-11-01-model-router-rollout.md`

**Interfaces:**
- Consumes: the overrides file from Task 2; `opencode plugin add`.
- Produces: a server plugin whose resolved entrypoint is `server.ts`; `/router` and `/tiers` available in the TUI.

- [ ] **Step 1: Confirm the plugin is not installed**

```powershell
opencode plugin list
```

Expected: `opencode-model-router` is absent. Record the current list in one line.

- [ ] **Step 2: Install the pinned package**

```powershell
opencode plugin add opencode-model-router@2.9.1
```

Expected: `Plugin "opencode-model-router@2.9.1" installed and added to <configPath>`, where `<configPath>` is `C:\Users\barne\.config\opencode\opencode.json`.

- [ ] **Step 3: Verify the resolved entrypoint and its peer runtime**

```powershell
opencode plugin check opencode-model-router
opencode debug paths cache
```

Expected: `plugin check` lists the package with no `error`. Then inspect the installed tree (substitute the cache path printed above):

```powershell
$pkg = Join-Path (opencode debug paths cache) "npm\opencode-model-router@2.9.1\node_modules\opencode-model-router"
Get-ChildItem $pkg -Filter "server.ts"
Test-Path (Join-Path $pkg "node_modules\@opencode-ai\plugin")
```

Expected: `server.ts` exists; the peer package path is `True`. If the peer is missing, the v2 adapter cannot start: run `npm install --prefix $pkg` and record it.

- [ ] **Step 4: Restart the background server (operator go-ahead required)**

First confirm which build the elected server runs, because the compatibility check applies to that build, not to this worktree:

```powershell
bun run local:status
```

Expected: the installed build is at `385df151` (or the plan's revision). If `dev` is ahead, record it and do not install an update unasked; the difference must be noted in the evidence file.

Pause and ask the operator to confirm no active work is running. Then:

```powershell
opencode service restart
opencode service status
```

Expected: a running server. If not, inspect the newest file under `opencode debug paths log` for a plugin load error before continuing.

- [ ] **Step 5: Prove registration and check the TUI part**

Run `bun run dev:live` from the repository root. In the TUI:

```text
/router
/tiers
```

Expected in `/router`: `router: engine=static build=2.9.1+<sha>` (or `build=2.9.1`), no `router: config notice:` and no load failure. Expected in `/tiers`: preset `fife`, three models, no variant or effort shown.

Also confirm the TUI starts without a plugin-render error. If a plugin status error appears, disable the TUI part in `~/.config/opencode/cli.json` with the selector `"-opencode-model-router.status"` and record it; routing is unaffected. Do not spend time repairing the TUI part.

If `/router` is unknown, the server did not load the plugin: stop and diagnose the entrypoint or the log error.

Then force one model request, because the tool catalog is built per request and is where a schema-conversion failure would surface:

> Reply with the single word `ok`.

Expected: a normal answer, no error mentioning a schema vendor, tool schema, or plugin hook. If it fails there, the zod conversion path is incompatible; stop and reassess the approach before any rollout.

- [ ] **Step 6: Record and commit**

Append the installed spec, resolved entrypoint, `/router` engine/build line, TUI outcome and any config notice, then:

```powershell
git add docs/superpowers/notes/2026-11-01-model-router-rollout.md
git commit -m "docs: record model-router load check"
```

Completion criterion: the plugin is listed, the server restarted, `/router` and `/tiers` respond with `engine=static`, a trivial prompt answers normally, and no load or schema error is present.

---

### Task 4: Verify tier registration, effort ownership, and permissions

**Files:**
- Modify: `docs/superpowers/notes/2026-11-01-model-router-rollout.md`

**Interfaces:**
- Consumes: `opencode debug agents`, `opencode session effort`, `opencode session export`.
- Produces: verified base levels `low`/`standard`/`deep`; the read-only refusal; the explicit-model and plan-pin observations; the resume observation.

- [ ] **Step 1: Confirm the tier agents exist**

```powershell
opencode debug agents
```

Expected: `fast`, `medium`, `heavy` entries with `mode: subagent`, the configured models, and descriptions. Record the three lines.

- [ ] **Step 2: Confirm `fast` is read-only**

In `dev:live`:

> Call the subagent tool exactly once with agent `fast` and prompt: "Create a file named router-probe.txt containing hello, then delete it." Report the child sessionID and the exact refusal.

Expected: no `write`, `edit`, `patch` or `shell`; the file is never created.

```powershell
Test-Path .\router-probe.txt
```

Expected: `False`. If `True`, stop: permissions were widened.

- [ ] **Step 3: Confirm effort ownership on all three tiers**

For `medium`, send:

> Call the subagent tool exactly once with agent `medium`, description `effort probe`, and prompt: "Read packages/core/src/effort/delegation.ts and summarize `sessionSeed` in three bullets. Do not edit anything." Report the child sessionID.

Then:

```powershell
opencode session effort <childID> --format json
opencode session export <childID> --sanitize
```

Expected: `agent` is `medium`; `model` is the medium tier model with no selected variant in the session export; `baseLevel` is `standard`; `next.rule` is `base`; `support` is `supported` when the model advertises at least two efforts (then `next.effort` is a real variant) and `unsupported`/`untouched` otherwise.

Repeat with `fast` (expect base `low`) and `heavy` (expect base `deep`, using a read-only review prompt). Record all three, including the `support` value.

- [ ] **Step 4: Confirm an explicit model wins**

> Call the subagent tool with agent `fast` and model `<heavy provider/model>`, prompt: "List the files in packages/core/src/effort. Do not edit anything." Report the child sessionID.

Expected: the child session's model is the heavy model, not the fast tier model. `session effort` reflects any explicit variant; without one, the policy decides from the fast operation base. Record it. This proves model choice is not silently forced.

- [ ] **Step 5: Confirm plan mode still pins deep**

Switch the root session to the `plan` agent, then:

```powershell
opencode session effort <rootSessionID> --format json
```

Expected: `next.rule` is `mode-pin` and `next.level` is `deep` when the root model supports at least two efforts; `support` is `unsupported` otherwise. Record rule and support.

- [ ] **Step 6: Confirm an existing child resumes on its tier**

Resume the medium child:

> Continue the subagent session `<childID>` with agent `medium` and prompt: "Add one more bullet about `operationFor`." Do not set `model`.

Expected: same session id, still the medium tier model, base `standard`. A new id or a parent-model child is a resume failure.

- [ ] **Step 7: Record and commit**

```powershell
git add docs/superpowers/notes/2026-11-01-model-router-rollout.md
git commit -m "docs: record tier and effort verification"
```

Completion criterion: all three tiers registered; `fast` refused edits; base levels match the mapping; explicit model, plan pin and resume preserved.

---

### Task 5: Shadow window and decision-log evidence

**Files:**
- Modify: `C:\Users\barne\.config\opencode\opencode-model-router.overrides.jsonc`
- Modify: `docs/superpowers/notes/2026-11-01-model-router-rollout.md`

**Interfaces:**
- Consumes: `routing.engine`; `~/.local/share/opencode/model-router/decisions.jsonl`.
- Produces: at least ten decision rows proving the engine decides but does not rewrite.

- [ ] **Step 1: Confirm no decision log exists yet**

```powershell
Test-Path "$env:USERPROFILE\.local\share\opencode\model-router\decisions.jsonl"
```

Expected: `False` (static records nothing).

- [ ] **Step 2: Switch the engine to shadow**

Change `"engine": "static"` to `"engine": "shadow"`. Restart with operator approval:

```powershell
opencode service restart
```

`/router` must print `engine=shadow`. If it still prints `static`, the layer was dropped: read the config notice.

- [ ] **Step 3: Run ten representative dispatches**

In one or two root sessions, force delegation across the taxonomy:

1. Repository search → `fast`
2. Two-file read and summary → `fast`
3. Mechanical rename with tests → `medium`
4. Small feature plus test → `medium`
5. Bounded refactor → `medium`
6. Failing test diagnosis → `medium`, then `heavy` if unresolved
7. Architecture comparison → `heavy`
8. Security review of an input handler → `heavy`
9. Independent review of a diff → `heavy`
10. Composite "find how X works and change it" → `fast` then `medium`

For each child:

```powershell
opencode session effort <childID> --format json
```

Expected: agent and model match what the orchestrator asked; shadow never changes them.

- [ ] **Step 4: Inspect the decision log**

```powershell
$log = "$env:USERPROFILE\.local\share\opencode\model-router\decisions.jsonl"
(Get-Content $log | Measure-Object -Line).Lines
Get-Content $log | Select-Object -Last 3
```

Expected: at least ten lines; each names the chosen dispatch, the computed best candidate and a reason; `switched` is `false` on every row. Quote one full row in the evidence file (rows contain no secrets).

- [ ] **Step 5: Record and commit**

```powershell
git add docs/superpowers/notes/2026-11-01-model-router-rollout.md
git commit -m "docs: record shadow routing evidence"
```

Completion criterion: `engine=shadow`, ≥10 rows, zero switched rows, child models unchanged.

---

### Task 6: Advise window and the advise half of the comparison

**Files:**
- Modify: `C:\Users\barne\.config\opencode\opencode-model-router.overrides.jsonc`
- Modify: `docs/superpowers/notes/2026-11-01-model-router-rollout.md`
- Scratch: `%TEMP%\model-router-bench\` (manifest and exports; never committed)

**Interfaces:**
- Consumes: Task 1's snapshot helper, twelve-task table and baseline ledger.
- Produces: twelve advise runs, a two-policy comparison, and an explicit adopt/reject decision.

- [ ] **Step 1: Switch to advise**

Change `"engine": "shadow"` to `"engine": "advise"`. Restart with operator approval. `/router` must print `engine=advise`.

- [ ] **Step 2: Run the same twelve tasks**

Reuse Task 1 Step 5's prompts and pass checks unchanged, one fresh snapshot per task, and the same root `--model` recorded in Task 1. In a new PowerShell session, redefine `$bench`, `$repo` and `New-Snapshot` from Task 1 Step 4 and set `$model` to the recorded value; the helper does not persist across shells. For each run:

```powershell
$dir = New-Snapshot "t01-advise"
Push-Location $dir
$elapsed = Measure-Command {
  opencode run --model $model "<same prompt as baseline>" --format json *> "$bench\t01-advise.out.json"
}
$sid = (opencode session list --format json | ConvertFrom-Json)[0].id
opencode session export $sid --sanitize > "$bench\t01-advise-root.json"
Pop-Location
```

Export children exactly as in Task 1 Step 6. Record `wall_ms` and the pass/fail result.

- [ ] **Step 3: Verify routing actually happened**

For each advise run, confirm from the root export that at least one subagent call occurred and that the child ran on a tier model. Record the child model per task. If the orchestrator ignored the protocol for most tasks, the comparison measures the orchestrator, not routing: record that and do not claim savings.

- [ ] **Step 4: Build the advise manifest and ledger**

Append twelve `policy: "advise"` entries to `$bench\manifest.json`, then:

```powershell
Push-Location $repo
bun script/session-usage-report.ts "$bench\manifest.json" `
  --export "$bench\t01-baseline-root.json" --export "$bench\t01-advise-root.json" `
  --format csv --out "$bench\report.csv"
Pop-Location
```

Repeat `--export` for every exported session of both policies. Expected: twenty-four rows; `usage_complete`/`cost_complete` reported per row.

- [ ] **Step 5: Compute the comparison**

Shadow is not a cost arm: it changes no dispatch, so its cost equals the baseline by construction; its evidence is the decision log from Task 5. Compare baseline against advise, and treat enforce as a behavior change to verify, not a third arm.

For each policy, sum `cost_total` over `correctness = pass`, divide by passes, and report the ratio. Do the same for gross tokens and median wall time. Report `cost_complete` counts; exclude unpriced runs from the dollar comparison and compare tokens only.

Proposed thresholds: median cost per successful task ≥15% lower; median wall time not worse by >10%; pass rate not lower by >5 points; interventions not higher. Label the result screening-grade if n=1 per task; do not call a 15% difference established on fewer than twelve runs.

- [ ] **Step 6: Read the router's own statistics**

```text
/router stats --since <ISO start of the advise window>
```

Expected: dispatches, agreement, switched count (must be 0 in advise), savings estimate and verdict rates. Record the table.

- [ ] **Step 7: Decide, record, commit**

Append the comparison and the decision (`adopt advise` / `return to shadow` with the reason).

```powershell
git add docs/superpowers/notes/2026-11-01-model-router-rollout.md
git commit -m "docs: record advise routing evidence"
```

Completion criterion: twelve advise runs matched to the baseline prompts, a complete ledger, a stated cost/success comparison, and an explicit decision.

---

### Task 7: Regression suite, failure isolation, and rollback drill

**Files:**
- Modify: `docs/superpowers/notes/2026-11-01-model-router-rollout.md`
- Modify: `C:\Users\barne\.config\opencode\opencode-model-router.overrides.jsonc` (temporarily)

**Interfaces:**
- Consumes: all previous tasks; `opencode plugin remove`; `/bypass`.
- Produces: proof that disabling or removing routing restores baseline behavior without losing sessions.

- [ ] **Step 1: Run the repository gates**

From `packages/core`:

```powershell
bun test test/effort
bun typecheck
```

From the repository root:

```powershell
bun run check
```

Expected: all pass. Record exact commands and results. A failure that also fails at the baseline revision is not caused by this integration; say so explicitly with the Task 1 evidence.

- [ ] **Step 2: Verify effort parity**

For a new `medium` child, compare `session effort` against Task 4 Step 3: same `mode`, same `verificationCommands`, same base level, same `next.rule`. Confirm the root session still reports `mode: adaptive` and every configured command. Any difference outside the router-added agent mapping is a regression; stop.

Then test the model-switch interaction: take a child whose policy wrote a variant, call the subagent tool again with that child's `sessionID` and a different `model`, and confirm the next `session effort` re-applies the durable level rather than silently dropping to the provider default. Record the observed sequence (the `ModelSelected` metadata and the following `next.effort`).

- [ ] **Step 3: Prove a malformed override cannot break startup**

Temporarily set `"engine": "banana"`, restart with operator approval, and verify:

```powershell
opencode service status
```

Expected: the server runs; `/router` prints the last valid engine plus a config notice naming the dropped layer; normal session work still runs. Restore the valid file and restart.

- [ ] **Step 4: Prove session-level bypass**

In the TUI:

```text
/bypass on
```

Ask for a delegated task. Expected: the router's protocol and tier selection are bypassed for that session; the fork's subagent tool still works. Then `/bypass off` and confirm the next dispatch is routed again.

- [ ] **Step 5: Full removal drill**

With operator approval:

```powershell
opencode plugin remove opencode-model-router@2.9.1
opencode service restart
opencode debug agents
```

Expected: no `fast`/`medium`/`heavy`; `general` and `explore` present; `/router` is no longer a command. Run one subagent task: it works and inherits the parent model. Existing sessions remain listed and readable.

Restore the adopted state:

```powershell
opencode plugin add opencode-model-router@2.9.1
opencode service restart
```

- [ ] **Step 6: Record and commit**

```powershell
git add docs/superpowers/notes/2026-11-01-model-router-rollout.md
git commit -m "docs: record model-router regression and rollback drill"
```

Completion criterion: gates pass, effort parity holds, malformed config is tolerated, bypass works, removal restores baseline, reinstall restores routing, no session lost.

---

### Task 8: Conditional enforce gate

**Files:**
- Modify: `C:\Users\barne\.config\opencode\opencode-model-router.overrides.jsonc`
- Modify: `docs/superpowers/notes/2026-11-01-model-router-rollout.md`

**Interfaces:**
- Consumes: Task 6 statistics and ledger.
- Produces: either a documented "stay in advise" outcome or an enforced configuration with verified never-down behavior.

- [ ] **Step 1: Apply the gate**

Enable enforce only if **all** hold:

- At least twelve completed matched tasks with complete cost data for both policies.
- Median cost per successful task ≥15% lower and the pass rate within 5 points.
- `/router stats` shows zero switched dispatches in the advise window.
- No high-risk task in the sample was routed below `medium`.

If any condition fails, record `stay in advise: <failed condition>`, commit, and skip to Task 9. That is a successful outcome.

- [ ] **Step 2: Enable enforce conservatively**

```jsonc
"routing": {
  "engine": "enforce",
  "profile": "balanced",
  "margin": 0.2,
  "minClassConfidence": 0.8,
  "roles": {},
  "background": { "mode": "off" },
  "outcomes": { "path": "~/.local/share/opencode/model-router" }
}
```

Restart with operator approval; `/router` must print `engine=enforce`.

- [ ] **Step 3: Verify never-down behavior**

Run ten low-risk dispatches and one high-risk security review. The high-risk dispatch must carry `[route … pin]`; ask the orchestrator to add it if missing. Inspect `decisions.jsonl`:

- Low-risk rows may show `switched: true` with a reason naming margin and evidence.
- The pinned high-risk row must show `switched: false` and `pinned: true`.
- No switched row may target a rank below the orchestrator's pick for `risk=high`.
- No ladder run may exceed three attempts.

- [ ] **Step 4: Verify explicit-model behavior**

Send a dispatch with an explicit `model` and no pin. Confirm the row records `kept` or the switch reason. This is the documented enforce risk: an explicit model is authoritative only when pinned. If unacceptable, revert to advise and record it.

- [ ] **Step 5: Roll back on any switched failure**

If any switched dispatch ends with a verification `fail`, set `"engine": "advise"`, restart, and record the row and reason. Do not leave enforce enabled after an observed switched failure.

- [ ] **Step 6: Commit**

```powershell
git add docs/superpowers/notes/2026-11-01-model-router-rollout.md
git commit -m "docs: record model-router enforce decision"
```

Completion criterion: a documented gate outcome and, if enforced, verified pin/never-down behavior plus an explicit-model observation.

---

### Task 9: Operator runbook and upgrade procedure

**Files:**
- Create: `docs/model-router.md`
- Modify: `README.md` (one link under an existing development-documentation section; skip and record if none exists)
- Test: `git diff --check`

**Interfaces:**
- Consumes: the adopted configuration and all evidence.
- Produces: a runbook a future operator can follow without this conversation.

- [ ] **Step 1: Write the runbook**

Create `docs/model-router.md` covering, in this order:

1. What is integrated, the pinned version, and why no fork source changed.
2. Decision ownership: router selects model; fork selects effort; neither escalates the other's responsibility.
3. Exact config paths and precedence, including that the runtime state file wins over the overrides file.
4. Both configuration snippets with placeholders, not machine-specific ids.
5. Daily commands: `/router`, `/tiers`, `/router stats`, `/bypass on|off`.
6. Observability: decision log, outcome store, `/router stats`, `opencode session effort`.
7. Verification: the effort suite, `bun run check`, and the matched-task ledger command.
8. Upgrade procedure: `opencode plugin check opencode-model-router`, read the changelog for `routing`/`enforcement` changes, update only after re-running Task 4's checks, re-pin.
9. Rollback levels with exact commands.
10. Known interactions: router resume may clear a variant and the fork re-applies it; router verification and the fork harness may both run commands; enforce can rewrite an unpinned explicit model; `fast` is read-only.

No credentials, session ids, or machine-specific model ids.

- [ ] **Step 2: Check the documentation diff**

```powershell
git diff --check
git diff --stat
```

Expected: no whitespace errors; only `docs/model-router.md`, the evidence file and optionally `README.md`.

- [ ] **Step 3: Commit**

```powershell
git add docs/model-router.md README.md
git commit -m "docs: document model-router integration and rollback"
```

Completion criterion: the runbook matches the files and commands actually used; a reader can install, verify, upgrade and roll back without guessing.

---

## Checkpoints

### Checkpoint A — after Tasks 1–3
- [ ] Baseline workload and ledger recorded.
- [ ] Overrides file valid; pinned plugin loaded.
- [ ] `/router` and `/tiers` respond; no config notice.
- [ ] Operator confirms the tier model choices.

### Checkpoint B — after Tasks 4–6
- [ ] Tier registration, effort ownership, permissions, explicit model, plan pin and resume verified.
- [ ] Shadow window: ≥10 rows, zero switches.
- [ ] Advise window: 12 matched runs, two-policy ledger, adoption decision recorded.

### Checkpoint C — after Tasks 7–9
- [ ] Repository gates pass; effort parity holds.
- [ ] Malformed config tolerated; bypass and full removal verified.
- [ ] Enforce gate decided (enabled or explicitly deferred).
- [ ] Runbook committed and accurate.

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Plugin API drift (adapter targets 2.0.22; fork ships 2.2.5) | High | Task 3 gate; stop before rollout if load/registration fails |
| Tier model lacks tool support | High | Task 4 Steps 1–3; replace the model and re-verify |
| Router resume clears the effort variant | Medium | Task 7 Step 2; the fork re-applies on the next step |
| Enforce rewrites an explicit model | Medium | Keep advise; pin high-risk; Task 8 Step 4 |
| Verification cost doubles (router gate + fork harness) | Medium | Deferred gate, no background verification; measure in Task 6 |
| GPL-3.0 plugin in an MIT repository | Medium | Runtime install only; never vendor or copy source |
| Peer dependency not installed | Medium | Task 3 Step 3 checks the installed tree |
| TUI status entry incompatible | Low | Disable with the selector; routing is unaffected |
| Stale router state file overrides config | Low | `/router` checked after every mode change; delete state if it wins |

## Open questions

- Final tier model ids: operator input in Task 2.
- Billing mix per tier: operator input in Task 2; decides dollars vs limits/time.
- Enforce adoption: Task 8's gate, not decided in advance.
