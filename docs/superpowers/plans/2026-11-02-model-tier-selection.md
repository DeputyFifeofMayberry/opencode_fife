# Model Tier Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Point the `fife` preset's `fast`, `medium` and `heavy` tiers at MiniMax M3.1 Flash `medium`, DeepSeek V4.1 Flash `max`, and GPT-6.1 Terra `xhigh`; then measure real cost under a hard $10 budget and decide the heavy tier from data rather than from an estimate.

**Architecture:** A configuration change plus a bounded experiment. No repository source is modified. One preset block in the user-level router config is rewritten, each tier is proved to route by a real dispatch, and a capped measurement run converts the one genuinely unknown quantity — heavy-tier cost — into a measured number.

**Tech Stack:** `opencode-model-router` 2.9.1, Vercel AI Gateway (native provider id `vercel`), `bun`, OpenCode `/tiers`, PowerShell.

**Spec:** `docs/superpowers/specs/2026-11-02-model-tier-selection-design.md`

## Global Constraints

- Target preset `fife`; `activeMode` stays `normal`.
- Catalog facts, verified on 2026-11-02, are the only source for model IDs. Do not retype from memory or from the spec's prose:
  - `vercel/minimax/minimax-m3.1-flash` serves `fast` at variant `medium` — $0.15 in / $0.60 out / $0.015 cache read, intelligence 29, 136 t/s.
  - `vercel/deepseek/deepseek-v4.1-flash-1017` serves `medium` at variant `max` — $0.30 / $1.20 / $0.007 cache read; variants `none`, `low`, `high`, `max`.
  - `vercel/openai/gpt-6.1-terra` — $1.00 in / $5.00 out / $0.05 cache read; variants `none`, `low`, `medium`, `high`, `xhigh`, `max`
  - `vercel/openai/gpt-6.1-terra-fast` is a **2× priced serving tier**, not a different model. Use plain `gpt-6.1-terra`.
  - `opencode/beam-free` and `vercel/reflection/beam-free` are both $0 but quota-limited; not usable at fast-tier volume.
- **Model discovery must use `all: true`.** The default model listing hides same-family entries; a default query showed only `terra-fast` and led to a wrong conclusion once. Never infer a model's absence from a default listing.
- `fast` carries no `variant` key. Gateway tiers carry the gateway's model ID verbatim.
- `costRatio` stays `1 / 3 / 8` for continuity.
- **Hard spend cap of $10** on the gateway during measurement. Never run the measurement without the cap in place.
- No credentials in the repository. Auth lives in the OpenCode auth store.
- No `.changeset` files. Conventional commits on `dev`.

## Review Focus

- **Gateway budget cap absent or set above $10.** A reasonable person expects the measurement to stop at the agreed figure; an uncapped run turns a $10 experiment into an open-ended bill.
- **Heavy tier under-sampled before the budget is exhausted.** A person expects the heavy number to rest on several observed dispatches, not one. Fewer than five heavy samples must trigger deliberate heavy work, not extrapolation from a single run.
- **A tier silently falling back to another model.** A person expects the configured model to be the one that ran; a silent substitution invalidates the measurement without announcing itself.
- **Variant rejected or ignored.** A person expects `max` and `xhigh` to be what executes; a silent downgrade makes the measured cost understate the real one.
- **Cache reads billed at the fresh-input rate.** A person expects the cache rate that makes this workload affordable; if it is not honoured, every projected figure is several times too low and the config choice changes.

---

## Prerequisites (human, blocking Task 4)

- [ ] **P1: Vercel team with AI Gateway access.** Already satisfied — authentication succeeded and 76 models are visible.
- [ ] **P2: Credits topped up.** Must cover $10 plus headroom for the smoke test.
- [ ] **P3: A $10 budget configured** on the Vercel AI Gateway, scoped to the API key in use. Vercel rejects requests after a budget is exceeded, so this is a hard stop.
- [ ] **P4: API key present** in the OpenCode auth store as `vercel-ai-gateway`.
- [ ] **P5: No long-running session mid-task** when the preset is swapped.

---

### Task 1: Authenticate the gateway provider — COMPLETE

**Files:** none. Authentication only.

**Interfaces:**
- Produces: provider prefix `vercel` and the three model IDs in Global Constraints.

- [x] **Step 1: Authenticate** via `opencode auth login` → Vercel AI Gateway, or `AI_GATEWAY_API_KEY` in the launching environment.

- [x] **Step 2: Verify the catalog resolves**

Queried the model list filtered to the provider.

Expected: both required models present with their exact IDs.
Actual: `vercel/deepseek/deepseek-v4.1-flash-1017` and `vercel/openai/gpt-6.1-terra` both resolved. Variants confirmed. (An initial query without `all: true` surfaced only `gpt-6.1-terra-fast`; see Global Constraints.)

- [x] **Step 3: Record IDs** in the ledger.

- [x] **Step 4: Confirm no credential in the repository**

Run: `git grep -n "AI_GATEWAY" --` from the repo root.
Expected: no key material. (Documentation mentioning the variable name is acceptable; a value is not.)

---

### Task 2: Rewrite the `fife` preset

**Files:**
- Modify: `C:\Users\barne\.config\opencode\opencode-model-router.overrides.jsonc`
- Create: same path + `.bak`

**Interfaces:**
- Consumes: model IDs from Task 1.
- Produces: a loaded preset whose three tiers Task 3 exercises and Task 4 measures.

- [ ] **Step 1: Back up the current file**

Run: `Copy-Item "$env:USERPROFILE\.config\opencode\opencode-model-router.overrides.jsonc" "$env:USERPROFILE\.config\opencode\opencode-model-router.overrides.jsonc.bak"`

Expected: `.bak` exists, size matches the original. This is the rollback path and must exist before any edit.

- [ ] **Step 2: Replace the three tier entries inside `presets.fife`**

```jsonc
"fast":   { "model": "vercel/minimax/minimax-m3.1-flash",       "variant": "medium", "costRatio": 1 },
"medium": { "model": "vercel/deepseek/deepseek-v4.1-flash-1017", "variant": "max",   "costRatio": 3 },
"heavy":  { "model": "vercel/openai/gpt-6.1-terra",              "variant": "xhigh", "costRatio": 8 }
```

Leave `activePreset`, `activeMode`, `enforcement`, `routing` untouched.

- [ ] **Step 3: Verify the preset loads**

Open the TUI and run `/tiers`.

Expected: preset `fife` listed with the three models above. If it does not appear, the file did not parse — restore the `.bak` and use `superpowers:systematic-debugging` rather than patching the live file.

---

### Task 3: Prove each tier routes

**Files:**
- Read: `C:\Users\barne\.local\share\opencode\model-router\timings.jsonl`

**Interfaces:**
- Consumes: the loaded preset from Task 2.
- Produces: a confirmed baseline line count and one verified dispatch per tier.

- [ ] **Step 1: Record the baseline**

Run: `(Get-Content "$env:USERPROFILE\.local\share\opencode\model-router\timings.jsonl").Count`

Expected: an integer. Ledger it as `baseline lines: <n>`.

- [ ] **Step 2: Exercise `fast`** with one read-only task (list files in a directory and report the count).

Expected: row names `minimax-m3.1-flash`, tier `fast`, variant `medium`.

- [ ] **Step 3: Exercise `medium`** with one small implementation task (create a file, then change it).

Expected: row names `deepseek-v4.1-flash-1017`, tier `medium`.

- [ ] **Step 4: Exercise `heavy`** with one hard analysis task that escalates.

Expected: row names `gpt-6.1-terra`, tier `heavy`. If the effort silently lands on a default rather than `xhigh`, ledger `Ruling: variant not honoured` and continue — Review Focus item 4.

- [ ] **Step 5: Read the new rows**

Run: `Get-Content "$env:USERPROFILE\.local\share\opencode\model-router\timings.jsonl" | Select-Object -Skip <baseline lines>`

Expected: three rows with the expected tier and model each. A failing tier names its provider error; record it and do not begin Task 4 for that tier.

---

### Task 4: Measurement run under the $10 cap

**Files:**
- Read: `C:\Users\barne\.local\share\opencode\model-router\outcomes.json`
- Read: `C:\Users\barne\.local\share\opencode\model-router\timings.jsonl`

**Interfaces:**
- Consumes: the verified tiers from Task 3.
- Produces: measured `measuredUSD` means per tier, and the observed heavy-dispatch token size, which Task 5 turns into a monthly figure.

- [ ] **Step 1: Confirm the $10 cap is active** (P3) before dispatching anything paid.

Expected: the Vercel dashboard shows a budget at or below $10 scoped to this key. If it does not, stop — do not proceed.

- [ ] **Step 2: Work normally** until either the budget is exhausted or these minimums are met: **20 medium dispatches and 5 heavy dispatches**.

Deliberately trigger heavy work if fewer than five samples accumulate, by giving the agent a genuinely hard debugging or architecture task. Do not pad with synthetic traffic that does not resemble real use — the measurement is worthless if the workload is not representative.

- [ ] **Step 3: If the budget exhausts before the minimums are met, stop spending and record it**

An early exhaustion is itself the finding: it implies heavy cost far above the estimate. Ledger `Measure: budget exhausted after <n> medium, <n> heavy` and continue to Task 5 with partial data.

- [ ] **Step 4: Extract per-tier means**

From `outcomes.json`, read the entries keyed `task|tier|model`, and record n, mean input/output/cacheRead tokens, and `measuredUSD` mean for `fast`, `medium` and `heavy`.

Expected: at least a medium and a heavy entry. If `heavy` has no cost row despite dispatches, ledger that `outcomes.json` does not price Terra through this provider — a real finding, since it means cost can only be read from the Vercel dashboard.

- [ ] **Step 5: Establish the heavy dispatch size**

Compute heavy's mean total tokens divided by medium's mean total tokens. This ratio is what Task 5 multiplies, and it is the number every earlier estimate guessed at.

Expected: a single ratio, ledgered.

- [ ] **Step 6: Confirm cache reads bill at the cache rate**

In the Vercel dashboard, open one DeepSeek request and one Terra request from the measurement window and read the itemized token breakdown.

Expected: cached tokens billed at $0.007/M (DeepSeek) and $0.05/M (Terra), separate from fresh input at $0.30 and $1.00. If cached tokens are billed at the input rate, ledger `Ruling: cache not passed through` — Review Focus item 5 — and recompute every figure before Task 5, because the whole cost case assumes the cache rate.

---

### Task 5: Decide the heavy tier from data

**Files:**
- Modify: `docs/superpowers/specs/2026-11-02-model-tier-selection-design.md` (Section 9)
- Modify: `C:\Users\barne\.config\opencode\opencode-model-router.overrides.jsonc` (only if the decision changes the model)

**Interfaces:**
- Consumes: the per-tier means and dispatch ratio from Task 4.
- Produces: a decided heavy model, a corrected Section 9, and a config that matches the decision.

- [ ] **Step 1: Project monthly cost**

For each tier: `measured mean per dispatch × observed dispatches per day × 30`, using the telemetry rates of 45 fast / 39 medium / 9 heavy per day.

Expected: three monthly figures, ledgered.

- [ ] **Step 2: Apply the decision rule, agreed in advance**

- Heavy under ~$100/month → keep `vercel/openai/gpt-6.1-terra` at `xhigh`.
- Heavy over ~$200/month → switch heavy to `vercel/deepseek/deepseek-v4.1-flash-1017` at `max`.
- Between → operator decides with the numbers in hand.

Ledger the projection and the outcome as `Decision: heavy = <model> — <projected $/mo> — <rule applied>`.

- [ ] **Step 3: Apply the change if the decision differs from the configured model**

Edit the `heavy` entry only. Re-run Task 3 Step 4 to confirm it routes.

- [ ] **Step 4: Replace Section 9's projections with measured figures**

Rewrite Section 9 so the measured numbers replace the deferred table, keep the superseded figures as an audit trail, and note the date and sample sizes.

- [ ] **Step 5: Commit the docs**

```bash
git add docs/superpowers/specs/2026-11-02-model-tier-selection-design.md docs/superpowers/plans/2026-11-02-model-tier-selection.md
git commit -m "docs: record measured model tier costs"
```

---

## Rollback

Restore `opencode-model-router.overrides.jsonc` from the `.bak` made in Task 2 Step 1 and reload. Nothing in the repository depends on the config, so no code changes are required to revert.

## Out of scope

- Gateway `sort: "cost"` / `sort: "ttft"` provider-selection tuning. It may reach the $0.15/$0.60 DeepSeek routes Vercel advertises, but that is a separate experiment and must not contaminate this measurement.
- Whether Terra's answers are *better* than DeepSeek's. Cost and routing are measured here; answer quality remains a judgement call from real use.
