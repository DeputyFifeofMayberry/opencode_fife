# Final Implementation Plan — Tier Usage Simulation

- Status: CONDITIONAL
- Plan version: v4 (supersedes v3, v2 and the original draft)
- Review depth: Standard, with one targeted code-level investigation
- Evidence baseline: `Y:\CodingProjects\opencode_fife`; `~/.local/share/opencode/opencode.db` (30 assistant-model variants, 3444 costed steps); `model-router/{timings,decisions,turns}.jsonl`; `packages/core/src/session/{usage,projector}.ts`; spec `docs/superpowers/specs/2026-11-02-model-tier-selection-design.md`
- Required approvals: none to execute; the post-run band decision belongs to the user.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Measure per-dispatch cost for the three router tiers from real step-level records, and apply the spec's pre-agreed heavy-tier threshold rule.

**Architecture:** Cost is read at **step grain** from `session_message` (where every assistant step records its own `model`, `cost`, `costProvenance` and `tokens`), then summed to dispatch grain over an explicit cohort of child sessions recorded during the run. Tier and duration come from `timings.jsonl` joined on `childSessionID`. Subscription is never inferred: model and variant come from the step that ran, not from the session row, which can change mid-session.

**Tech Stack:** Bun (`bun:sqlite`), SQLite, PowerShell, Markdown.

**Spec:** `docs/superpowers/specs/2026-11-02-model-tier-selection-design.md`

## Global Constraints

- Total gateway spend: **≤ $10**. Stop before a tier block if cumulative cohort spend ≥ $4; abort at ≥ $6; abort on a single dispatch over $0.90.
- Do not edit the router config, any price table, or any file outside `docs/superpowers/measurements/2026-11-02-tier-usage-simulation/`.
- No `.changeset` files. No product-file changes from simulated tasks.
- Source data is read-only (`{ readonly: true }`); never write telemetry files.
- Scripts are re-runnable and byte-identical for identical inputs.
- Percentiles use nearest-rank. At n=9 that is the **maximum**, not the 90th percentile; the plan says so wherever it reports p90.
- Costs in USD at 6 decimal places.
- Never impute a cost for a dispatch with no step record.
- **No `bun -e` one-liners.** PowerShell strips inner quotes on this host; all checks go through `check.ts` modes.
- Scratch: `C:\Windows\Temp\opencode`.

## Established facts

Verified during hardening. The executor may rely on these and must re-verify the ones Task 2 checks.

**Cost provenance**
- `packages/core/src/session/usage.ts:54-63`: provider-reported `usage.cost` wins when present; otherwise the catalog estimate is used. A reported zero is authoritative; no matching rate yields `unpriced`, not free.
- Every assistant step observed has `costProvenance: {"estimated": N}` — **no Vercel row is provider-reported**. Stored cost is therefore a local estimate everywhere, and the invoice is the only external validation.
- `packages/core/src/session/projector.ts:56-70` sums per-step `cost` and tokens into the `session_v2` columns.

**Step-grain records (the basis of this plan)**
- `session_message` type `assistant`: 3444 of 3464 rows carry `model`, `cost`, `costProvenance` and `tokens`.
- `tokens` shape: `{input, output, reasoning, cache:{read, write}}`.
- Per-step `model` includes `variant`; per-step `agent` is present too.
- 5 sessions contain more than one assistant model; 84 `model-switched` events exist. **Session-level `model` is therefore not a valid per-step label.**

**Token semantics** (`usage.ts:12-20`, `usage.ts:25-38`)
- `tokens_input` = non-cached input; **excludes** cache read.
- `tokens_output` = visible output; **excludes** reasoning.
- Pricing adds `input·p_in + (output + reasoning)·p_out + cacheRead·p_read + cacheWrite·p_write`. No category is double-counted.

**Effective price table, derived from the data**
- Solving the three Terra sessions: `openai/gpt-6.1-terra` = **$1.00 input / $5.00 output / $0.05 cache-read / $1.25 cache-write** per million.
- `openai/gpt-6.1-terra-fast` is **exactly 2.0×** that across every class: 2.00 / 10.00 / 0.10 / 2.50. The ratio came out 2.0000 for both rows and 1.0000 for plain terra.
- The earlier "2.4× discrepancy" was an artefact of assuming terra's rates for terra-fast and cache-write = input. **There is no pricing anomaly.** Any plan text claiming one is wrong.
- Cache-write is 63% of a Terra dispatch's cost; output is ~30%. This is why heavy cost tracks context size, not task difficulty.

**Identity and joins**
- `timings.childSessionID` equals `session_v2.id`; every row matched in the current snapshot, and 9 child sessions carry more than one timing row.
- `decisions.sessionID` is the **parent** session: 115 of 115 matched a `parentSessionID`, 0 matched a child. A decisions-based join to a child cannot work and is removed.
- `session_part` is empty; `call_id` is never populated. No call-level join exists beyond `session_message`.

**Current configuration and observed costs (pre-run indications only)**
- The most recent heavy dispatch ran `openai/gpt-6.1-terra` (not `-fast`) at $0.0413754 for 4 steps.
- Fast (MiniMax) sessions: $0.00447144, $0.00721062, $0.003194404. Medium (DeepSeek V4.1 `max`): $0.036078464 (7 steps), $0.007382004 (5 steps).
- The 7-step medium dispatch cost ~5× the 5-step one. **Dispatch cost is dominated by step count**, which is the single strongest reason a fixed sample cannot represent a real day.

## Boundary and non-goals

- **This is a synthetic benchmark, not an estimate of real daily spend.** The plan measures cost per dispatch for tasks of known shape. It does not measure the real distribution of task size, step count, or daily frequency. Section 9 must report monthly cost as a function of dispatch count and mean dispatch cost, not as a single predicted figure presented as fact.
- Out of scope: changing configuration, evaluating output quality, A/B testing DeepSeek on heavy work (explicitly unmeasured), production latency.

## Review Focus

1. **Session-level model is wrong for 5 sessions.** Model, variant, cost and tokens must come from the step row. Guarded in Task 2 and asserted in Task 4.
2. **Cost per dispatch is driven by step count, which varies 5×.** Any mean over few samples is dominated by which task shapes were drawn. Guarded in Task 5 by reporting step-count distribution alongside cost, and in Task 9 by reporting monthly cost per dispatch-count scenario.
3. **The $200 band must remain reachable.** A per-dispatch ceiling below $0.7408 makes the upper band unreachable by construction. Guarded in Task 7 by setting the ceiling to $0.90 and stating the arithmetic.
4. **Sign conventions in the billing verdict.** `deltaPct = (local − billed)/billed` is negative when local understates. Guarded in Task 6 by explicit labels and by a table of worked sign cases.
5. **Cohort, not time window.** A window lets unrelated projects and preparation work into the sample. Guarded in Task 3 by keying statistics to logged child-session IDs.
6. **The invoice is account-wide; a cohort-only local figure can never match it.** Comparing them guarantees a false `local-understates` verdict. Guarded in Task 6 Step 2 by computing `localUSD` as a per-session snapshot delta over every session, and by refusing to run when `99-sessions.json` is absent.
7. **A dedupe keyed on cost value silently drops dispatches.** Two dispatches costing the same six-decimal amount are common. Guarded in Task 2 Step 5 by keying the session map on `sessionID`.

---

## Task 1: Baseline, preflight probe and budget fields

**Files:**
- Create: `.../snapshot.ts`, `.../check.ts` (modes `config`, `schema`, `budget`)
- Output: `data/00-baseline.json`, `data/00-preflight.json`, `data/00-billing-baseline.json`

(All paths below are under `docs/superpowers/measurements/2026-11-02-tier-usage-simulation/`.)

**Interfaces:**
- `00-baseline.json`: `{takenAt, iso, versions, timingsRows, sessionCount, sessionCost, byClass, byAgent, byModel}`. Used for pre-run comparison only, **not** as the run window.
- `00-sessions.json`: `{sessionID: cost}` for every session at baseline. Task 6 Step 2 subtracts this from the post-run equivalent to obtain exact period spend.
- `00-preflight.json`: `{probeSessionID, probeModel, probeVariant, probeCost, expected, match}` — produced by an actual dispatch, not by reading config.
- `00-billing-baseline.json`: `{readAt, periodLabel, periodGrain, budgetLimitUSD, billedToDateUSD, availableHeadroomUSD}`.

- [ ] **Step 1: `.gitignore`**

```
data/sandbox/
```

Extracted JSONL, `stats.json` and the report are committed as evidence.

- [ ] **Step 2: `snapshot.ts`**

```ts
import { Database } from "bun:sqlite"
import { readFileSync, writeFileSync, mkdirSync } from "node:fs"
import path from "node:path"

const dataDir = path.join(import.meta.dir, "data")
mkdirSync(dataDir, { recursive: true })
const prefix = process.argv[2] ?? "00"
const opencodeDir = path.join(process.env.USERPROFILE!, ".local/share/opencode")
const db = new Database(path.join(opencodeDir, "opencode.db"), { readonly: true })
const timings = readFileSync(path.join(opencodeDir, "model-router", "timings.jsonl"), "utf8")
  .trim().split("\n").filter(Boolean).map((line) => JSON.parse(line))

const snapshot = {
  takenAt: Date.now(),
  iso: new Date().toISOString(),
  versions: { bun: Bun.version, opencode: db.query("select version from session_v2 order by time_created desc limit 1").get() },
  timingsRows: timings.length,
  lastDispatchStartedAt: Math.max(...timings.map((t) => t.startedAt)),
  sessionCount: db.query("select count(*) n from session_v2").get(),
  sessionCost: db.query("select round(sum(cost), 6) c from session_v2").get(),
  byClass: db.query("select case when parent_id is null then 'top' else 'child' end k, count(*) n, round(sum(cost),6) c from session_v2 group by k").all(),
  byAgent: db.query("select agent, count(*) n, round(sum(cost),6) c from session_v2 group by agent order by n desc").all(),
  byModel: db.query("select model, count(*) n, round(sum(cost),6) c from session_v2 group by model order by n desc").all(),
}

// Per-session cost snapshot. Two of these — before and after the run — let the
// reconciliation compute exact period spend, including cost accrued inside a
// session that already existed when the window opened.
const sessions = db.query("select id, parent_id, cost, time_created from session_v2").all()

writeFileSync(path.join(dataDir, `${prefix}-baseline.json`), JSON.stringify(snapshot, null, 2))
writeFileSync(path.join(dataDir, `${prefix}-sessions.json`), JSON.stringify(
  Object.fromEntries((sessions as Array<{ id: string; cost: number }>).map((s) => [s.id, s.cost])),
  null, 2,
))
console.log(JSON.stringify({ ...snapshot, sessionsWritten: sessions.length }, null, 2))
```

- [ ] **Step 3: `check.ts` — `schema` and `config` modes**

```ts
import { Database } from "bun:sqlite"
import { readFileSync } from "node:fs"
import path from "node:path"

const dataDir = path.join(import.meta.dir, "data")
const opencodeDir = path.join(process.env.USERPROFILE!, ".local/share/opencode")
const db = () => new Database(path.join(opencodeDir, "opencode.db"), { readonly: true })
const readJsonlAbs = (file: string) =>
  readFileSync(file, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line))

const mode = process.argv[2]

if (mode === "schema") {
  const required = ["id", "parent_id", "agent", "model", "cost", "tokens_input", "tokens_output",
    "tokens_reasoning", "tokens_cache_read", "tokens_cache_write", "time_created", "project_id"]
  const rows = db().query("select name from pragma_table_info('session_v2')").all() as Array<{ name: string }>
  const present = new Set(rows.map((r) => r.name))
  const missing = required.filter((c) => !present.has(c))
  const stepCols = db().query("select name from pragma_table_info('session_message')").all() as Array<{ name: string }>
  const stepMissing = ["session_id", "type", "data", "time_created"].filter((c) => !stepCols.some((r) => r.name === c))
  console.log(JSON.stringify({ sessionMissing: missing, messageMissing: stepMissing }, null, 2))
  process.exit(missing.length === 0 && stepMissing.length === 0 ? 0 : 1)
}

if (mode === "config") {
  // Runtime proof: read the model recorded on the most recent assistant step of a known dispatch.
  const target = process.argv[3]
  if (!target) throw new Error("usage: bun run check.ts config <sessionID>")
  const step = db().query(
    `select json_extract(data,'$.model.providerID') provider,
            json_extract(data,'$.model.id') model,
            json_extract(data,'$.model.variant') variant,
            json_extract(data,'$.costProvenance') provenance
     from session_message
     where session_id = ? and type = 'assistant'
     order by time_created limit 1`,
  ).get(target)
  console.log(JSON.stringify({ sessionID: target, step }, null, 2))
  process.exit(step ? 0 : 1)
}
```

`config` deliberately requires a real session ID. Historical `decisions.jsonl` rows are candidate lists produced in `shadow` mode, so they prove intent, not execution.

- [ ] **Step 4: Preflight probe (costs about $0.005)**

Run: `/opt` — dispatch one `subagent(agent="fast", ...)` with a trivial read-only question. Capture the returned `sessionID`, write it to `00-preflight.json`, then run:

`bun run docs/superpowers/measurements/2026-11-02-tier-usage-simulation/check.ts config <sessionID>`

Expected: exit 0 and `step.model` = `minimax/minimax-m3.1-flash`, `step.variant` = `medium`, `step.provenance` containing `estimated`. Record the exact ids in `00-preflight.json`.

If the probe shows a different model, **stop**: the preset is not what the plan assumes. This is the only reliable way to prove the paid run will measure the configured models.

- [ ] **Step 5: Baseline snapshot**

Run: `bun run .../snapshot.ts`

Expected: `takenAt` within 60 s of wall clock; `timingsRows` ≥ 107; `byClass` with `top` and `child`; non-null `versions.bun`.

- [ ] **Step 6: Billing baseline with three separate fields**

Write `data/00-billing-baseline.json` from the dashboard:

```json
{"readAt": "<ISO>", "periodLabel": "<verbatim>", "periodGrain": "day|month|custom",
 "budgetLimitUSD": 0, "billedToDateUSD": 0, "availableHeadroomUSD": 0}
```

Expected: `availableHeadroomUSD` read directly off the dashboard, not computed by subtracting `billedToDateUSD` again — the dashboard already nets it. If the dashboard exposes only a limit and a used figure, set `availableHeadroomUSD = budgetLimitUSD − billedToDateUSD` and say which definition was used. Pass condition: `availableHeadroomUSD ≥ 10`.

- [ ] **Step 7: Commit**

```
git add docs/superpowers/measurements/2026-11-02-tier-usage-simulation
git commit -m "chore(measurement): baseline, preflight probe, budget fields"
```

---

## Task 2: Step-grain extraction

**Files:**
- Create: `.../extract.ts`
- Output: `data/steps.jsonl`, `data/dispatches.jsonl`, `data/sessions.jsonl`, `data/join-report.json`

**Interfaces:**
- `steps.jsonl`: `{messageID, sessionID, stepIndex, timeCreated, agent, provider, model, variant, costUSD, provenance, tokens:{input,output,reasoning,cacheRead,cacheWrite}}` — one row per assistant step.
- `dispatches.jsonl`: `{sessionID, parentSessionID, tier, tierSource, agent, provider, model, variant, modelMix, costUSD, steps, tokens, durationMs, outcome, joinStatus, nCalls, sessionCostTotal}`. `joinStatus ∈ {exact, split, untimed, unmatched}`.
- `sessions.jsonl`: `{id, parentID, sessionClass, agent, cost, stepCost, steps, timeCreated, projectID}`.
- `join-report.json`: `{window, timingsRows, uniqueChildSessions, exact, split, untimed, unmatched, tierUnknown, modelMixSessions, costDeltaSessions}`.

- [ ] **Step 1: Schema preflight**

Run: `bun run .../check.ts schema`

Expected: `{"sessionMissing": [], "messageMissing": []}`. Both tables are required; a missing `session_message.data` breaks the whole design.

- [ ] **Step 2: Confirm step-grain cost reconciles to session cost for child sessions**

Add a `step-sums` mode that, for every child session, compares `session_v2.cost` with the sum of its assistant-step costs, and reports the count and worst absolute delta.

Expected on pre-run data: for **child** sessions the deltas are zero or below $1e-6. Known exception: 15 **top-level** sessions differ (largest $0.992 vs $0.925), because usage can be recorded without an assistant step (compaction). Record this asymmetry; do not "fix" it.

If a child session shows a material delta, that session's dispatch cost is the session total, not the step sum — Task 9 uses the session total for money and reports the discrepancy.

- [ ] **Step 3: Write `extract.ts`**

```ts
import { Database } from "bun:sqlite"
import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"

const TIER_AGENTS = new Set(["fast", "medium", "heavy"])
const [fromArg, toArg] = process.argv.slice(2)
if (!fromArg || !toArg) throw new Error("usage: bun run extract.ts <fromEpochMs> <toEpochMs>")
const from = Number(fromArg)
const to = Number(toArg)

const opencodeDir = path.join(process.env.USERPROFILE!, ".local/share/opencode")
const db = new Database(path.join(opencodeDir, "opencode.db"), { readonly: true })
const readJsonl = (file: string) =>
  readFileSync(path.join(opencodeDir, "model-router", file), "utf8")
    .trim().split("\n").filter(Boolean).map((line) => JSON.parse(line))

// Step grain is the source of truth for model, variant, cost and tokens.
const stepRows = db.query(
  `select m.id messageID, m.session_id sessionID, m.time_created timeCreated,
          json_extract(m.data,'$.agent') agent,
          json_extract(m.data,'$.model.providerID') provider,
          json_extract(m.data,'$.model.id') model,
          json_extract(m.data,'$.model.variant') variant,
          json_extract(m.data,'$.cost') cost,
          json_extract(m.data,'$.costProvenance') provenanceJson,
          json_extract(m.data,'$.tokens.input') tIn,
          json_extract(m.data,'$.tokens.output') tOut,
          json_extract(m.data,'$.tokens.reasoning') tReason,
          json_extract(m.data,'$.tokens.cache.read') tRead,
          json_extract(m.data,'$.tokens.cache.write') tWrite
   from session_message m
   where m.type = 'assistant' and m.time_created between ? and ?
   order by m.session_id, m.time_created`,
).all(from, to) as Array<Record<string, any>>

const provenance = (raw: string | null) => {
  if (!raw) return "unknown"
  const value = JSON.parse(raw) as Record<string, number>
  if ("provider" in value) return "provider"
  if ("estimated" in value) return "estimated"
  if ("unpriced" in value) return "unpriced"
  return "unknown"
}

let previousSession = ""
let stepCounter = 0
const steps = stepRows.map((row) => {
  if (row.sessionID !== previousSession) {
    previousSession = row.sessionID
    stepCounter = 0
  }
  const stepIndex = stepCounter++
  return {
    messageID: row.messageID,
    sessionID: row.sessionID,
    stepIndex,
    timeCreated: row.timeCreated,
    agent: row.agent,
    provider: row.provider,
    model: row.model,
    variant: row.variant ?? "unspecified",
    costUSD: row.cost ?? 0,
    provenance: provenance(row.provenanceJson),
    tokens: {
      input: row.tIn ?? 0, output: row.tOut ?? 0, reasoning: row.tReason ?? 0,
      cacheRead: row.tRead ?? 0, cacheWrite: row.tWrite ?? 0,
    },
  }
})

const sessionRows = db.query(
  `select id, parent_id, agent, cost, tokens_input, tokens_output, tokens_reasoning,
          tokens_cache_read, tokens_cache_write, time_created, time_updated, idle_outcome, project_id
   from session_v2 where time_created between ? and ? order by time_created`,
).all(from, to) as Array<Record<string, any>>

const timings = readJsonl("timings.jsonl").filter((t) => t.startedAt >= from && t.startedAt <= to)
const sessionByID = new Map(sessionRows.map((row) => [row.id, row]))

const stepsBySession = new Map<string, typeof steps>()
for (const step of steps) {
  const list = stepsBySession.get(step.sessionID) ?? []
  list.push(step)
  stepsBySession.set(step.sessionID, list)
}

const timingGroups = new Map<string, any[]>()
for (const timing of timings) {
  const group = timingGroups.get(timing.childSessionID) ?? []
  group.push(timing)
  timingGroups.set(timing.childSessionID, group)
}

const emptyTokens = { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0 }

const dispatched: any[] = []
for (const [sessionID, calls] of timingGroups) {
  const session = sessionByID.get(sessionID)
  const first = calls[0]
  if (!session) {
    dispatched.push({
      sessionID, parentSessionID: first.parentSessionID, tier: first.tier,
      tierSource: "timings", agent: "unknown", provider: "unknown", model: "unknown",
      variant: "unknown", modelMix: [], costUSD: null, steps: 0, tokens: null,
      durationMs: first.durationMs, outcome: first.outcome, joinStatus: "unmatched",
      nCalls: calls.length, sessionCostTotal: null,
    })
    continue
  }
  const own = stepsBySession.get(sessionID) ?? []
  const identities = [...new Set(own.map((s) => `${s.provider}/${s.model}#${s.variant}`))]
  const last = own.at(-1)
  const agentIsTier = TIER_AGENTS.has(session.agent)
  dispatched.push({
    sessionID,
    parentSessionID: first.parentSessionID,
    tier: first.tier !== "unknown" ? first.tier : agentIsTier ? session.agent : "unknown",
    tierSource: first.tier !== "unknown" ? "timings" : agentIsTier ? "session_agent" : "unknown",
    agent: session.agent,
    provider: last?.provider ?? "unknown",
    model: last?.model ?? "unknown",
    variant: last?.variant ?? "unspecified",
    modelMix: identities,
    costUSD: session.cost,
    steps: own.length,
    tokens: own.reduce((acc, s) => ({
      input: acc.input + s.tokens.input, output: acc.output + s.tokens.output,
      reasoning: acc.reasoning + s.tokens.reasoning,
      cacheRead: acc.cacheRead + s.tokens.cacheRead,
      cacheWrite: acc.cacheWrite + s.tokens.cacheWrite,
    }), { ...emptyTokens }),
    durationMs: calls.reduce((a, c) => a + c.durationMs, 0),
    outcome: calls.map((c) => c.outcome).join(","),
    joinStatus: calls.length === 1 ? "exact" : "split",
    nCalls: calls.length,
    sessionCostTotal: session.cost,
  })
}

for (const row of sessionRows) {
  if (timingGroups.has(row.id) || row.parent_id === null || !TIER_AGENTS.has(row.agent)) continue
  const own = stepsBySession.get(row.id) ?? []
  const last = own.at(-1)
  dispatched.push({
    sessionID: row.id, parentSessionID: row.parent_id, tier: row.agent,
    tierSource: "session_agent", agent: row.agent,
    provider: last?.provider ?? "unknown", model: last?.model ?? "unknown",
    variant: last?.variant ?? "unspecified",
    modelMix: [...new Set(own.map((s) => `${s.provider}/${s.model}#${s.variant}`))],
    costUSD: row.cost, steps: own.length, tokens: null, durationMs: null,
    outcome: row.idle_outcome, joinStatus: "untimed", nCalls: 0, sessionCostTotal: row.cost,
  })
}

const sessions = sessionRows.map((row) => {
  const own = stepsBySession.get(row.id) ?? []
  return {
    id: row.id, parentID: row.parent_id,
    sessionClass: row.parent_id === null ? "top" : "child",
    agent: row.agent, cost: row.cost,
    stepCost: own.reduce((a, s) => a + s.costUSD, 0), steps: own.length,
    timeCreated: row.time_created, projectID: row.project_id,
  }
})

const count = (status: string) => dispatched.filter((d) => d.joinStatus === status).length
const report = {
  window: { from, to },
  timingsRows: timings.length,
  uniqueChildSessions: timingGroups.size,
  exact: count("exact"), split: count("split"), untimed: count("untimed"), unmatched: count("unmatched"),
  tierUnknown: dispatched.filter((d) => d.tier === "unknown").length,
  modelMixSessions: dispatched.filter((d) => d.modelMix.length > 1).length,
  costDeltaSessions: sessions.filter((s) => Math.abs(s.cost - s.stepCost) > 0.000001).length,
}

writeFileSync(path.join(dataDir, "steps.jsonl"), steps.map((s) => JSON.stringify(s)).join("\n") + "\n")
writeFileSync(path.join(dataDir, "dispatches.jsonl"), dispatched.map((d) => JSON.stringify(d)).join("\n") + "\n")
writeFileSync(path.join(dataDir, "sessions.jsonl"), sessions.map((s) => JSON.stringify(s)).join("\n") + "\n")
writeFileSync(path.join(dataDir, "join-report.json"), JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
```

Note what is **absent** by design: no cost division across calls, and no token copying across calls. Cost is the session total; tokens are the sum of that session's own steps. A dispatch with several timing rows is counted once for money and once for tokens.

- [ ] **Step 4: Dry-run on existing traffic**

Run: `bun run .../extract.ts 1793032672338 <baselineTakenAt>`

Expected: `timingsRows` ≈ 107; `split` ≥ 1; `modelMixSessions` ≥ 1 (a session that switched model is observable); `costDeltaSessions` ≈ 15 **before the run** and every one of them top-level. After the run, re-read it: the number should rise only for top-level sessions, and any **child** session with a cost/step delta above $1e-6 is a finding to record, because that is the case where dispatch cost would not equal the sum of its steps. If `modelMixSessions` is 0, the per-step model label adds nothing and that claim must be dropped from the report.

- [ ] **Step 5: `check.ts cost-sums` — against an independent query, keyed by session**

```ts
if (mode === "cost-sums") {
  const guard = db().query("select round(sum(cost),6) c from session_v2").get() as { c: number }
  const rows = readJsonlAbs(path.join(dataDir, "dispatches.jsonl"))
     as Array<{ sessionID: string; costUSD: number | null; sessionCostTotal: number | null }>
  const costed = rows.filter((r) => r.costUSD !== null)
  const dispatchSum = costed.reduce((a, r) => a + (r.costUSD ?? 0), 0)
  // Dedupe by SESSION ID. Deduping by cost value silently collapses two dispatches
  // that happen to cost the same — which is common at 6 decimal places.
  const bySession = new Map<string, number>()
  for (const r of costed) bySession.set(r.sessionID, r.sessionCostTotal ?? 0)
  const sessionSum = [...bySession.values()].reduce((a, c) => a + c, 0)
  const report = {
    costedDispatches: costed.length,
    distinctSessions: bySession.size,
    dispatchSum: Number(dispatchSum.toFixed(6)),
    sessionSum: Number(sessionSum.toFixed(6)),
    dbAllTime: guard.c,
  }
  console.log(JSON.stringify(report, null, 2))
  process.exit(report.dbAllTime > 0 && Math.abs(report.dispatchSum - report.sessionSum) < 1e-9 ? 0 : 1)
}
```

Expected: `dispatchSum === sessionSum`, `distinctSessions === costedDispatches` (one row per dispatch), and `sessionSum ≤ dbAllTime`, where `dbAllTime` comes from a query the extraction never touched. This is no longer circular, and it no longer collapses equal-cost dispatches.

- [ ] **Step 6: Commit**

```
git add docs/superpowers/measurements/2026-11-02-tier-usage-simulation
git commit -m "feat(measurement): step-grain extraction"
```

---

## Task 3: Cohort construction and classification

**Files:**
- Create: `.../cohort.ts`
- Output: `data/cohort.json`

**Interfaces:**
- `cohort.json`: `{dispatchingSessionIDs, byTier, nonTierChildren, topLevel, totals, checks}`. Every statistic in Tasks 5–9 is computed over `dispatchingSessionIDs` only.

- [ ] **Step 1: Define the cohort from the run log, not a timestamp**

The run log (Task 7) records the `sessionID` returned by every dispatch. `cohort.ts` reads `data/07-run-log.md`, extracts those IDs, and intersects them with `dispatches.jsonl`. Sessions not in the log are excluded from tier statistics, regardless of when they were created.

- [ ] **Step 2: Classify**

- `byTier[tier]` = cohort dispatches grouped by `tier`, with `n`, `costUSD`, `steps`.
- `nonTierChildren` = child sessions in the window whose agent is not a tier (`general`, `explore`, `plan`, `build`); `n`, `cost`, `agents`.
- `topLevel` = `sessionClass === "top"` in the window; `n`, `cost`, and `createdAfterRunStart` count.
- `totals`, and `gatewayShare` computed per provider from `steps.jsonl`.

- [ ] **Step 3: Checks**

- `checks.cohortSize` = distinct cohort IDs.
- `checks.dispatchRowsForCohort` = `dispatches.jsonl` rows matching the cohort.
- `checks.cohortWithoutDispatchRow` = cohort IDs absent from `dispatches.jsonl` (must be 0).
- `checks.dispatchRowsOutsideCohort` = rows in `dispatches.jsonl` absent from the log (reported, not fatal).
- `checks.projectIDs` = distinct `projectID` values inside the cohort. More than one is a contamination signal; report it.

- [ ] **Step 4: Run and check**

Run: `bun run .../cohort.ts`

Expected on pre-run data (no run log yet): `cohortSize` 0 and an explicit `"no run log; cohort empty"` message, exit 0. After the run: `cohortWithoutDispatchRow` 0; `dispatchRowsOutsideCohort` ≤ 20 (pre-existing traffic in the window); `projectIDs` = 1 if every dispatch came from this repo.

- [ ] **Step 5: Commit**

```
git add docs/superpowers/measurements/2026-11-02-tier-usage-simulation
git commit -m "feat(measurement): cohort construction"
```

---

## Task 4: Identity resolution

**Files:**
- Create: `.../identity.ts`
- Output: `data/identity.json`

**Interfaces:**
- `identity.json`: `{byKey, byTierKey, mixedSessions, fallbacks, provenance}`.

  - `byKey` groups steps by `` `${provider}/${model}#${variant}` ``.
  - `byTierKey` groups **dispatches** by `` `${tier} | ${provider}/${model}#${variant}` ``, so a tier's identity mix is visible in one table.
  - `mixedSessions` lists cohort dispatches whose steps span more than one identity.
  - `fallbacks` lists cohort dispatches whose identity differs from the tier's intended model.
  - `provenance` counts steps by `estimated` / `provider` / `unpriced` / `unknown` and sums cost per kind.

- [ ] **Step 1: Build identity from steps only**

`byKey` keys on `` `${provider}/${model}#${variant}` `` computed from `steps.jsonl` rows belonging to cohort sessions. Do not read `session_v2.model` for any statistical purpose; it is the session's last-applied model and disagrees with step history in 5 sessions.

- [ ] **Step 2: Handle mixed sessions explicitly**

For a cohort dispatch whose `modelMix.length > 1`, record it in `mixedSessions` with the per-identity cost split derived from its steps, and mark the dispatch `identity: "mixed"`. Such dispatches are **excluded** from per-identity means and reported separately, because assigning a single identity would be false.

- [ ] **Step 3: Record provenance**

`provenance` counts steps by `provenance` (`estimated`, `provider`, `unpriced`, `unknown`) and the dollar sum per kind. If any `provider` rows appear during the run, report them separately: they are billed truth and should not be mixed with estimates in one mean.

- [ ] **Step 4: Note fallbacks**

`fallbacks` lists cohort dispatches whose identity is not the tier's intended model (for example a heavy dispatch on DeepSeek). Report their count and cost. They are excluded from the Terra mean and reported as a distinct routing observation.

- [ ] **Step 5: Run and check**

Run: `bun run .../identity.ts`

Expected pre-run: `byKey` contains `vercel/openai/gpt-6.1-terra#xhigh` and `vercel/openai/gpt-6.1-terra-fast#xhigh` as **separate** keys, with cost ratios 1.0 and 2.0 per the derived price table. If they collapse into one key, the variant/model extraction is broken.

- [ ] **Step 6: Commit**

```
git add docs/superpowers/measurements/2026-11-02-tier-usage-simulation
git commit -m "feat(measurement): step-level identity resolution"
```

---

## Task 5: Statistics

**Files:**
- Create: `.../stats.ts`
- Output: `data/stats.json`

**Interfaces:**
- `stats.json`: `{groups, excludedUnmatched, zeroCost, stepCounts}`.
- `StatGroup`: `{groupBy: "tier"|"identity"|"tierIdentity", group, n, costedN, metrics}`.
- Metrics: `cost_usd`, `steps_per_dispatch`, `tokens_input`, `tokens_output`, `tokens_reasoning`, `tokens_cache_read`, `tokens_cache_write`, `duration_ms`.
- Each metric: `{n, total, mean, median, p90, min, max, meanCI95}`.

- [ ] **Step 1: Reducer with per-metric null filtering**

```ts
const percentile = (sorted: number[], p: number) => {
  if (sorted.length === 0) return null
  return sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)]
}

const summarise = (values: number[]) => {
  const clean = values.filter((v) => typeof v === "number" && Number.isFinite(v))
  if (clean.length === 0) return null
  const sorted = [...clean].sort((a, b) => a - b)
  const total = sorted.reduce((a, v) => a + v, 0)
  return {
    n: sorted.length, total, mean: total / sorted.length,
    median: percentile(sorted, 0.5), p90: percentile(sorted, 0.9),
    min: sorted[0], max: sorted[sorted.length - 1],
    meanCI95: bootstrapCI(clean, 2000),
  }
}
```

`bootstrapCI` is descriptive only: seed 42, 2000 resamples, percentiles 2.5/97.5. It measures resampling variability of these particular observations, not sampling uncertainty about real usage. The report must say that in those words.

- [ ] **Step 2: Add `steps_per_dispatch` as a first-class metric**

Because a 7-step dispatch cost 5× a 5-step one, a cost mean without its step-count distribution is uninterpretable. Both are reported for every group.

- [ ] **Step 3: Groupings**

`tier`; `identity`; `tierIdentity`. Dispatches with `costUSD === null` excluded and counted. Zero-cost dispatches included in means, listed in `zeroCost` with `{sessionID, provider, model, variant}`, and additionally classified `verified_free` when provider is a `-free` model or provenance is `provider: 0`, else `unresolved_zero`.

- [ ] **Step 4: Exact table columns**

```
group | metric | n | costed_n | total | mean | median | p90 | min | max | ci95_low | ci95_high
```

- [ ] **Step 5: State the p90 convention in output**

`stats.json` carries `{p90Method: "nearest-rank", note: "at n=9 p90 equals the maximum observation"}`.

Expected: at n=9, `p90 === max` for cost. Task 9 must not describe it as a 90th percentile.

- [ ] **Step 6: Dry-run**

Run: `bun run .../stats.ts`

Expected: no `NaN`; `p90 === max` where n < 10; identical output on rerun.

- [ ] **Step 7: Commit**

```
git add docs/superpowers/measurements/2026-11-02-tier-usage-simulation
git commit -m "feat(measurement): step-aware cost statistics"
```

---

## Task 6: Rate derivation, reconciliation and spend split

**Files:**
- Create: `.../reconcile.ts`, `.../spend.ts`
- Output: `data/reconcile.json`

**Interfaces:**
- `reconcile.json`: `{window, localUSD, billedUSD, deltaUSD, deltaPct, verdict, derivedRates, rateResidual, localHeavy, localNonHeavy, heavyOutsideCohort, validationFactor, validationStatus, split, fastMonthly, fastMonthlyStatus}`.

- [ ] **Step 1: Derive effective unit rates instead of assuming a catalog**

For each identity, solve the least-squares fit of `cost = (in·pIn + (out+reason)·pOut + read·pRead + write·pWrite)/1e6` over that identity's **steps** (each step is one equation).

Four unknowns require **four linearly independent equations**, not three. Two rows with the same token pattern give a rank-deficient system even though there are four numbers. So:

1. Build the design matrix over that identity's steps.
2. Compute its rank. If rank = 4, solve all four rates and report the residual.
3. If rank < 4, fix `pRead` and `pWrite` at the plain-terra values and solve the scale only.
4. Report `rank`, `equations`, `residual`, and `status ∈ {solved, scale-only, underdetermined}`.

Expected: `openai/gpt-6.1-terra` solves to 1.00 / 5.00 / 0.05 / 1.25 with residual < $1e-6 when it has ≥ 4 steps with varied cache composition; `terra-fast` returns `scale-only` at 2.0 until it has a rank-4 design.

This replaces every hard-coded price constant. There is no `k`; the earlier 2.4× was an assumption error, and re-deriving rates is how that is prevented from recurring.

- [ ] **Step 2: Billing delta with explicit sign conventions**

```
localUSD  = Σ over ALL sessions of (costEnd − costStart)
            where costStart comes from 00-sessions.json (0 for sessions absent there)
                  and costEnd comes from 99-sessions.json
billedUSD = 99-billing-final.billedUSD − 00-billing-baseline.billedUSD
deltaUSD  = localUSD − billedUSD
deltaPct  = deltaUSD / billedUSD × 100
```

`localUSD` must be **account-wide for the period**, because the invoice is account-wide. Comparing an invoice total against cohort-only cost would guarantee a false `local-understates` verdict. The per-session snapshot delta also credits spend that accrues inside a session created before the window, which a creation-time filter cannot see.

If `99-sessions.json` is missing, `reconcile.ts` must exit non-zero rather than fall back to a creation-time sum.

Labels, stated as a table in the report so the sign can never be misread:

| condition | meaning | label |
| --- | --- | --- |
| `deltaPct > +15` | local exceeds invoice | `local-overstates` (projection is an upper bound) |
| `deltaPct < −15` | local is below invoice | `local-understates` (projection is a lower bound) |
| `|deltaPct| ≤ 15` | aggregate agreement | `aggregate-within-tolerance` |
| `billedUSD <= 0` | no usable invoice | `inconclusive` |

`aggregate-within-tolerance` means only that the totals agree. It does **not** confirm per-model prices or cache rates, and no longer uses the word "confirmed".

- [ ] **Step 3: Validation factor, applied once and only when identified**

```
localHeavy    = cohort cost where tier === "heavy"      // every heavy dispatch in the window is in the cohort
localNonHeavy = localUSD − localHeavy
validationFactor = |deltaPct| > 15 ? (billedUSD − localNonHeavy) / localHeavy : 1
```

Add a check: if any heavy-tier dispatch in the window is **outside** the cohort, `localHeavy` is incomplete and `validationStatus` must be `"invalid"`. Report the count of such dispatches.

Guards: if `localHeavy ≤ 0` → `validationStatus: "inconclusive"`, factor 1. If `validationFactor ≤ 0` or `> 5` → `validationStatus: "invalid"`, factor **1**, and Task 9 must not apply any correction; the global ratio is printed as a scenario only. Never substitute a different estimator for an impossible one.

`validationStatus` is one of `not-needed`, `applied`, `inconclusive`, `invalid`.

- [ ] **Step 4: Spend split**

Report `cohortUSD`, `nonTierChildUSD`, `topLevelUSD`, `topLevel.createdAfterRunStart`, `tierShare`, and `fastMonthly`.

`fastMonthly` is only meaningful **after** the run, because it uses the measured fast mean. Before the run, `reconcile.ts` writes it as `null` with `fastMonthlyStatus: "pending-run"`; Task 8 regenerates it. The spec says fast is free; it is not, and the report states the measured number without amending the spec.

- [ ] **Step 5: `spend.ts`**

```ts
import { Database } from "bun:sqlite"
import path from "node:path"

const from = Number(process.argv[2])
const to = Number(process.argv[3] ?? Date.now())
if (!from) throw new Error("usage: bun run spend.ts <fromEpochMs> [toEpochMs]")
const db = new Database(path.join(process.env.USERPROFILE!, ".local/share/opencode/opencode.db"), { readonly: true })

console.log(JSON.stringify({
  window: { from, to },
  spentSinceFrom: db.query("select round(sum(cost),6) v from session_v2 where time_created between ? and ?").get(from, to),
  sessionsSinceFrom: db.query("select count(*) v from session_v2 where time_created between ? and ?").get(from, to),
  byTierAgent: db.query(
    `select case when parent_id is null then 'top' else coalesce(agent,'unknown') end k,
            count(*) n, round(sum(cost),6) cost
     from session_v2 where time_created between ? and ?
     group by k order by cost desc`,
  ).all(from, to),
}, null, 2))
```

- [ ] **Step 6: Run and check (pre-run)**

Run: `bun run .../reconcile.ts`

Expected pre-run: `verdict: "inconclusive"` because no final billing or session snapshot exists; `fastMonthly: null` with `fastMonthlyStatus: "pending-run"`; `derivedRates` reporting each identity's `rank` and `status` as defined in Step 1.

Run: `bun run .../spend.ts <baselineTakenAt>`

Expected: `spentSinceFrom` is **small** (a few cents at most) — it covers only sessions created after the baseline snapshot was taken, not the account's all-time total. The all-time total is a different quantity and lives in `00-baseline.json`; do not compare against it.

`runStartMs` does not exist yet — it is created in Task 7 Step 1. Nothing in Task 6 may reference it.

- [ ] **Step 7: Commit**

```
git add docs/superpowers/measurements/2026-11-02-tier-usage-simulation
git commit -m "feat(measurement): rate derivation and reconciliation"
```

---

## Task 7: Run the simulated day

**Files:**
- Output: `data/run-window.json`, `data/07-run-log.md`, `data/99-baseline.json`, `data/99-sessions.json`, `data/99-billing-final.json`

**Interfaces:**
- `run-window.json`: `{runID, runStartMs, runEndMs, planned, executed, concurrency, perDispatchCeilingUSD, stoppedEarly, state}`.
- `07-run-log.md`: `seq | tier | agent | sessionID | family | subject | startedAt | costUSD`, no `|` inside fields, two header lines.

- [ ] **Step 1: Freeze the run window immediately before the first dispatch**

Capture `runStartMs = Date.now()` in a fresh `run-window.json`. Do **not** reuse `00-baseline.json.takenAt`: Tasks 2–6 involve implementation, commits and possibly dispatches, all of which would otherwise enter the sample.

Set `perDispatchCeilingUSD = 0.90`. Rationale, recorded in the file: the $200/month band requires a mean of `200 / (9 × 30) = $0.7408`; a $0.50 ceiling would make that band unreachable by construction. At $0.90, nine heavy dispatches cost at most $8.10, inside the cap only if fast and medium are cheap — hence the mid-block abort below.

- [ ] **Step 2: Fast block — 45 dispatches, 9 families × 5, concurrency 3**

Dispatch with `subagent(agent="fast", ...)`; `agent` is what sets `timings.tier`. Wait for each wave to finish before starting the next: concurrent fan-out changes cache-write behaviour, which is the dominant cost term.

Families (vary the subject each repetition): locate callers of `{symbol}`; list files matching `{glob}`; find where the experimental route group is registered; `pragma table_info` for `{table}`; report headings of `{path}`; count `{symbol}` across packages; last 20 lines of `{path}`; package.json scripts for `{package}`; tests covering `{symbol}`.

After each wave run `spend.ts <runStartMs>`. Abort at ≥ $4 before a block or ≥ $6 cumulative.

Expected: 45 logged lines, all `tier=fast`, `spend` ≈ $0.20–$0.45.

- [ ] **Step 3: Medium block — 39 dispatches, with real fixtures**

Before dispatching, create deterministic fixtures under `data/sandbox/{n}/` for n in 1..8. Each fixture must actually contain the defect the prompt names: a file with a genuine type error for the fix task, a file with a forbidden assertion for the guard task, a file with an exported function and no tests for the test task. Verify each fixture with `bun typecheck` or `bun test` before it is used.

A prompt whose fixture lacks the described defect produces a one-token reply and a fictitious price.

Families: add a helper plus test; replace a forbidden assertion with a guard; write three tests; rename a local symbol; add JSDoc; add a config default; fix the reported type error; implement a small schema plus round-trip test.

Expected: 39 logged lines, `spend` cumulative ≤ $4.00 before starting heavy.

- [ ] **Step 4: Heavy block — 9 dispatches, read-only, ceiling $0.90**

Tasks, all analysis-only: CI failure diagnosis from pasted artifacts; design comparison with a recommendation; injection/path-traversal audit of a named handler; RCA from an error log; zero-downtime column-rename strategy; profiling plan for a slow query; five-file diff review; integration design with failure modes; critique of a sampling plan.

Vary the subject each time. After **every** dispatch, run `spend.ts` and check the individual cost. Abort the block at a single dispatch > $0.90 or cumulative ≥ $6, set `stoppedEarly: "ceiling" | "budget"`, and record the over-ceiling observation rather than discarding it.

If the block completes with mean cost well below $0.7408/month-equivalent, say plainly that the upper band was not reached and that reaching it would need higher mean cost — the band is measured, not assumed.

- [ ] **Step 5: Optional distributional supplement (labelled, not part of the day)**

If cumulative spend ≤ $2.00 after the heavy block, run a second 9-dispatch heavy block and label it `heavy-supplement` in the run log. n=18 makes the p90 the 17th of 18 rather than the maximum. It is reported separately and pooled only for distributional statistics, never counted as part of a 9-per-day day.

- [ ] **Step 6: Close the window**

Run `bun run .../snapshot.ts 99`, which writes `data/99-baseline.json` and `data/99-sessions.json`, then set `runEndMs`. The pair of session snapshots is what makes exact period spend computable; without `99-sessions.json`, Task 6's reconciliation must refuse to run.

Expected: `timingsRows` grew by at least the dispatch count; `executed` counts match the log; `state` is `completed` or `stopped-early`.

- [ ] **Step 7: Billing close**

Write `data/99-billing-final.json` in the baseline's shape, same `periodLabel`, same period.

Expected: `billedToDateUSD` increased by $0.30–$10.00. If the run crossed the dashboard period boundary, record `periodGrain` and treat the comparison as `inconclusive` rather than guessing.

- [ ] **Step 8: Commit**

```
git add docs/superpowers/measurements/2026-11-02-tier-usage-simulation
git commit -m "chore(measurement): simulated dispatch run"
```

---

## Task 8: Regenerate and reconcile

**Files:**
- Output (regenerated): `dispatches.jsonl`, `sessions.jsonl`, `steps.jsonl`, `join-report.json`, `cohort.json`, `identity.json`, `stats.json`, `reconcile.json`
- Modify: `check.ts` (add `coverage`)

**Interfaces:**
- Consumes `run-window.json`.

- [ ] **Step 1: Regenerate in order**

```
extract.ts <runStartMs> <runEndMs>
cohort.ts
identity.ts
stats.ts
reconcile.ts
check.ts cost-sums
```

`reconcile.ts` must run after the billing file exists. If it is skipped, `validationFactor` stays 1 and the invoice never enters the decision.

Expected: `join-report.unmatched` ≤ 10% of timings rows; `cohort.checks.cohortWithoutDispatchRow` = 0; `stats` has the three tier groups; `reconcile.verdict` ≠ `inconclusive`.

- [ ] **Step 2: Coverage mode — one-to-one, not set membership**

```ts
if (mode === "coverage") {
  const lines = readFileSync(path.join(dataDir, "07-run-log.md"), "utf8").trim().split("\n")
    .filter((line) => /^\d+\s*\|/.test(line))
  const logged = lines.map((line) => line.split("|")[3].trim()).filter(Boolean)
  const rows = readJsonlAbs(path.join(dataDir, "dispatches.jsonl")) as Array<{ sessionID: string }>
  const rowIDs = rows.map((r) => r.sessionID)
  const loggedSet = new Set(logged)
  const rowSet = new Set(rowIDs)
  const report = {
    logLines: logged.length,
    uniqueLogged: loggedSet.size,
    duplicateLogEntries: logged.length - loggedSet.size,
    dispatchRows: rowIDs.length,
    duplicateDispatchRows: rowIDs.length - rowSet.size,
    missingFromExtraction: [...loggedSet].filter((id) => !rowSet.has(id)).length,
    outsideCohort: [...rowSet].filter((id) => !loggedSet.has(id)).length,
  }
  console.log(JSON.stringify(report, null, 2))
  const ok = report.duplicateLogEntries === 0 && report.missingFromExtraction === 0
  process.exit(ok ? 0 : 1)
}
```

Run: `bun run .../check.ts coverage`

Expected: exit 0, both duplicate counts 0, `missingFromExtraction` 0. `outsideCohort` is reported, not fatal — it is pre-existing traffic.

- [ ] **Step 3: Record state**

Append `coverage: ...` and `state: completed|stopped-early|invalid` to the run log. If `stoppedEarly` is set, the experiment is `stopped-early` and **may not** claim the same acceptance as a completed run; Task 9 must produce a band with `bandCertain: false` and say why.

---

## Task 9: Decision

**Files:**
- Create: `.../decision.ts`
- Output: `data/decision.json`

**Interfaces:**
- Consumes: `data/stats.json` (the `tier=heavy` and `tierIdentity=heavy | …terra#xhigh` groups, including `metrics.cost_usd.meanCI95` → `heavyCI95`), `data/identity.json` (`mixedSessions`, `fallbacks`), `data/cohort.json` (cohort membership), `data/reconcile.json` (`validationFactor`, `validationStatus`), `data/run-window.json` (`state`, `stoppedEarly`).
- Produces `decision.json`: `{heavyN, heavyMean, heavyMedian, heavyMax, heavyP90, p90IsMax, validationFactor, validationStatus, monthlyRaw, monthlyMean, monthlyP90, monthlyCI95, band, bandCertain, scenarios, state, rationale}`.

`heavyCI95` is `stats.groups[tier=heavy].metrics.cost_usd.meanCI95` — the bootstrap interval on the heavy mean, not on the p90. If that group has fewer than 2 observations, `heavyCI95` is `null` and `bandCertain` must be `false`.

- [ ] **Step 1: Estimate on the confirmed identity only**

`heavyMean` is the mean over cohort dispatches whose identity is `vercel/openai/gpt-6.1-terra#xhigh` — the identity the preset dispatches. Fallbacks and mixed sessions are excluded and reported. Using all `tier === "heavy"` would silently price a mixed routing policy.

- [ ] **Step 2: Project, applying the validation factor at most once**

```
monthlyRaw  = heavyMean × 9 × 30
monthlyMean = heavyMean × (validationStatus === "applied" ? validationFactor : 1) × 9 × 30
monthlyP90  = heavyP90  × (same factor) × 9 × 30
monthlyCI95 = heavyCI95 × (same factor) × 9 × 30
```

If `validationStatus` is `invalid` or `inconclusive`, the factor is 1 by construction and the report says the invoice was not usable. Do not substitute the global ratio here.

- [ ] **Step 3: Band the interval, not the point estimate**

```
band(lo, hi) =
  hi  <  100 ? "keep-terra-xhigh"
: lo >= 100 && hi <= 200 ? "between-thresholds"
: lo >  200 ? "drop-to-deepseek-max"
: "inconclusive-band"
```

Boundaries: a value exactly 100 or 200 falls in the middle band. `bandCertain = band(monthlyCI95[0], monthlyCI95[1])` is one of the three determinate values; otherwise `inconclusive-band` and `bandCertain: false`. A point estimate never overrides the interval.

- [ ] **Step 4: Report scenarios rather than a single prediction**

`scenarios` is a table over dispatch counts `{3, 6, 9, 18}` per day and means `{heavyMean, heavyMedian, heavyMax}`, plus the same for a `validationFactor` of 1 and the global ratio. The report's headline quotes 9/day at the measured mean and names the alternatives.

- [ ] **Step 5: Sample-size honesty**

`p90IsMax = heavyN < 10`. If true, the report says the p90 is the maximum observation. If the supplement block ran, report n and the p90 separately for 9 and 18 and do not pool them for the band.

- [ ] **Step 6: Rationale**

Must contain: `heavyN`, the identity used, `validationStatus`, whether the band came from the interval or the point, the step-count distribution, the fast-tier monthly cost, and — for `between-thresholds` — both options with monthly costs and a recommendation, plus the spec's stated consequence "accept a ceiling of 32" for the DeepSeek branch. DeepSeek-on-heavy cost is **unmeasured** and must be labelled as such.

- [ ] **Step 7: Run and check**

Run: `bun run .../decision.ts`

Expected: `heavyN` matches `stats`; `band` is one of four values; `bandCertain` false whenever the interval crosses a threshold; `monthlyMean === monthlyRaw` when the factor is 1.

---

## Task 10: Report

**Files:**
- Create: `.../report.md`
- Modify: `check.ts` (add `numbers`)

- [ ] **Step 1: Headings**

```markdown
# Tier Usage Simulation — 2026-11-02
## 1. Run summary
## 2. Method, cohort and join integrity
## 3. Baseline vs final totals
## 4. Per-tier cost distribution
## 5. Per-identity cost distribution
## 6. Token and step composition
## 7. Local vs billed reconciliation
## 8. Tier spend vs main-session spend
## 9. Monthly projection and decision
## 10. Assumptions still unverified
## 11. What this data cannot tell you
```

- [ ] **Step 2: Sections 4–6 from `stats.json`, no hand arithmetic**

Include `steps_per_dispatch` alongside `cost_usd` in every table. Section 6 shows, per identity, the share of cost from each token class; for Terra the dominant term is cache-write, and that must be stated as the reason heavy cost tracks context size.

- [ ] **Step 3: Section 7 with the sign table**

Reproduce the Task 6 sign table verbatim, then `localUSD`, `billedUSD`, `deltaPct`, `verdict`, `validationStatus`, `derivedRates` with residuals, and the global ratio as a scenario. State that aggregate agreement does not validate per-model prices.

- [ ] **Step 4: Section 8 with the split and fast cost**

`cohortUSD`, `nonTierChildUSD`, `topLevelUSD`, `topLevel.createdAfterRunStart`, `tierShare`, `fastMonthly`. State that `session_v2.cost` is cumulative, so top-level spend is bounded rather than isolated, and note that 15 top-level sessions have session cost above their step-cost sum.

- [ ] **Step 5: Sections 10 and 11**

Section 10: whether the installed build matches the reviewed `usage.ts`; whether Vercel ever reports `cost` (none observed); the derived cache-write rate and whether the invoice confirms it; whether 9 dispatches per day matches real usage; whether the synthetic task mix matches real tasks.

Section 11: reasoning effort actually performed beyond the `variant` string; cost of unmatched dispatches; window-attributable cost of long-lived sessions; per-request billed cost; DeepSeek on equivalent heavy work; real daily dispatch frequency; whether fast is cheaper than the free models the spec assumed.

- [ ] **Step 6: Lead section 9 with the decision and its certainty**

First sentence: `monthlyMean`, the band, whether it is certain, and the recommendation. Then the scenario table.

- [ ] **Step 7: `numbers` mode**

Add a mode that re-reads `stats.json`, `reconcile.json`, `decision.json` and asserts that section 9 contains `heavyMean`, `monthlyMean`, `band` and `bandCertain` verbatim.

Run: `bun run .../check.ts numbers`

Expected: exit 0, `missingFromSection9: []`.

- [ ] **Step 8: Commit**

```
git add docs/superpowers/measurements/2026-11-02-tier-usage-simulation
git commit -m "docs(measurement): simulation report"
```

---

## Verification summary

| Check | Command | Pass |
| --- | --- | --- |
| Schema | `check.ts schema` | exit 0, both arrays empty |
| Config, by real dispatch | `check.ts config <sessionID>` | model/variant match the preset |
| Step cost equals session cost (child) | `check.ts step-sums` | max delta < $1e-6 |
| No double counting | `check.ts cost-sums` | `dispatchSum === sessionSum` |
| One-to-one cohort | `check.ts coverage` | exit 0, duplicates 0, missing 0 |
| Report matches data | `check.ts numbers` | exit 0 |
| Budget | `spend.ts <runStartMs>` | < $4 before a block, < $6 total |
| Per-dispatch ceiling | manual | none > $0.90 |
| Rate derivation | `reconcile.ts` | status `solved` or `scale-only`, never silently rank-deficient |
| Period spend basis | `reconcile.ts` | exits non-zero without `99-sessions.json` |

## Acceptance criteria

1. Every logged dispatch appears exactly once in `dispatches.jsonl`.
2. `cost-sums` shows `dispatchSum === sessionSum`, with `dbAllTime` from an independent query.
3. Every dispatch's cost comes from `session_v2.cost`; no cost is divided across calls.
4. Statistics report eight metrics including `steps_per_dispatch`, with nearest-rank percentiles and the n<10 p90 caveat.
5. `reconcile.json` carries a real `deltaPct` and one of four verdicts, using the corrected sign labels, with `localUSD` computed from the two session snapshots rather than a creation-time filter.
6. `derivedRates` reproduces the terra table at 1.00/5.00/0.05/1.25 with a residual below $1e-6.
7. `decision.json` bands the interval, not the point estimate, and excludes fallbacks and mixed sessions.
8. Report has all eleven sections and passes `check.ts numbers`.
9. Total spend < $10.
10. The report labels the result a synthetic benchmark, not an estimate of real daily spend.

## Remaining risks and decisions

| Item | Owner | Consequence |
| --- | --- | --- |
| Band lands between $100 and $200 | User | Choose Terra `xhigh` vs DeepSeek `max`; DeepSeek heavy cost unmeasured |
| `validationStatus` = `invalid` | Executor | Decision uses raw local cost; report states the invoice was unusable |
| Synthetic task mix | Accepted | Cost per dispatch is measured for known task shapes only; daily total is not |
| n=9 heavy | Accepted, floored at 18 with the supplement | p90 equals max at n=9; interval carries the band |
