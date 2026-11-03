# Tier Usage Simulation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Measure the real per-dispatch cost of the `fife` router's three tiers by running one simulated day of realistic traffic, then decide whether the heavy tier stays on Terra `xhigh`.

**Architecture:** Three read-only extraction scripts over local telemetry, one paid dispatch run, one statistics pass, one reconciliation against the Vercel dashboard. Every cost number is derived from `session_v2` token columns; `timings.jsonl` supplies only tier and duration; the Vercel dashboard is the independent check. Dispatch grain and session grain are kept distinct so a session's cost is never counted twice.

**Tech Stack:** Bun (`bun:sqlite`, `bun run`), SQLite, PowerShell on Windows, Markdown.

**Spec:** `docs/superpowers/specs/2026-11-02-model-tier-selection-design.md`

## Global Constraints

- Total gateway spend for this exercise: **≤ $10**. Stop before starting a new tier block if cumulative spend ≥ $4; stop mid-block at ≥ $6.
- Do not edit `C:\Users\barne\.config\opencode\opencode-model-router.overrides.jsonc`, any router price table, or any file outside `docs/superpowers/measurements/2026-11-02-tier-simulation/`.
- No `.changeset` files. No product-file changes from simulated tasks.
- Source data is read-only: open `opencode.db` with `{ readonly: true }`; never write `timings.jsonl`, `outcomes.json`, `decisions.jsonl`, `turns.jsonl`.
- Every script must be re-runnable and produce identical output for the same inputs and window.
- Percentiles use nearest-rank (`sorted[Math.min(n-1, Math.ceil(0.9*n)-1)]`), never interpolation. With n=9, interpolated p90 invents a value.
- Costs in USD, 6 decimal places.
- Never impute a cost for a dispatch that has no `session_v2` row. Report it as unresolved.
- Scratch space: `C:\Windows\Temp\opencode`. Working shell: PowerShell.

## Facts established before this plan was written

These were queried directly and are not assumptions. The executor may rely on them, and Task 2 re-verifies them.

- `session_v2` has `cost real`, `tokens_input/output/reasoning/cache_read/cache_write integer`, `agent text`, `model text` (JSON: `providerID`, `id`, optional `variant`), `parent_id text`, `time_created integer`. `time_created` is **epoch milliseconds** (max observed `1793660682056`, compared against `Date.now()`).
- `timings.jsonl`: 106 rows, keys `kind, v, ts, parentSessionID, childSessionID, callID, role, class, scope, tier, model, background, startedAt, endedAt, durationMs, outcome, capacity`. No `variant`, no cost. `startedAt` is epoch ms. 97 of 106 `childSessionID` values exist in `session_v2`; 5 rows have `tier: "unknown"`.
- **One `childSessionID` can appear on several timing rows** (two calls inside one child session). Cost lives at session grain.
- `session_part` exists but is **empty (0 rows)**, and `session_part.call_id` is never populated. A `callID` join is impossible. Do not attempt one.
- `decisions.jsonl` (113 rows) carries `chosen.variant`, `chosen.model`, `sessionID`, `agent`. `childSessionID` is `null` in the current `shadow` mode, so it can supply a variant but not a dispatch identity.
- `outcomes.json` keys are `"<role>|<tier>|<model>#<variant>"` with `cost.measuredUSD.{mean,n}` and `cost.tokens`. It contains entries for gateway models, but n=1 for medium and heavy.
- `session_v2.cost` for MiniMax and DeepSeek exactly equals tokens × catalog price (three rows, delta 0.00%). For **Terra it does not**: stored cost is ~2.6× catalog math, because a heavy dispatch is dominated by ~18,000 cache-**write** tokens against 6 fresh input tokens.
- Observed heavy model id is `openai/gpt-6.1-terra-fast`, not the `openai/gpt-6.1-terra` named in the preset. The billed id must be recovered from the run, not assumed.
- Cost split on 2026-11-02: top-level sessions $3.0371 over 65 sessions, child sessions $0.8538 over 114.

## Review Focus

1. **Two timing rows for one child session.** Cost is per session, so summing `cost` once per timing row doubles that dispatch. Guarded in Task 2 (`nCalls`, `costAttribution: "split"`).
2. **A timing row whose `childSessionID` is absent from `session_v2`.** 9 of 106 already are. It has a duration but no cost. Guarded in Task 2 (`joinStatus: "unmatched"`) and excluded from cost statistics in Task 5.
3. **Terra's implied price multiplier.** Catalog math understates stored cost by ~156%. If the run does not reproduce a stable multiplier, the local price table is wrong in a way that changes the monthly projection. Guarded in Task 6 (`k` per model, with coefficient of variation).
4. **A tier falling back to a non-preset model.** Already observed: `variant: "none"` on a fast dispatch, and `heavy | deepseek/deepseek-flash` ×8. A per-tier mean that silently mixes models answers the wrong question. Guarded in Task 5 (group by tier **and** by `provider/model#variant`).
5. **A zero-cost model.** `reflection/beam-free` recorded `cost 0` with real tokens. Dropping zeros biases the mean down; averaging them in hides that the model is free. Guarded in Task 5 (`cost_usd` vs `costed_n`).

---

## Task 1: Baseline snapshot

**Files:**
- Create: `docs/superpowers/measurements/2026-11-02-tier-simulation/snapshot.ts`
- Output: `docs/superpowers/measurements/2026-11-02-tier-simulation/data/00-baseline.json`

**Interfaces:**
- Produces: `00-baseline.json` with `takenAt` (epoch ms). Task 2 uses `takenAt` as the window `from`. Task 6 reads `sessionsByClass` as the pre-run comparison.
- Produces: `data/00-billing-baseline.json`, hand-written by the operator.

- [ ] **Step 1: Create the snapshot script**

```ts
import { Database } from "bun:sqlite"
import { readFileSync, writeFileSync, mkdirSync } from "node:fs"
import path from "node:path"

const dataDir = path.join(import.meta.dir, "data")
mkdirSync(dataDir, { recursive: true })

const opencodeDir = path.join(process.env.USERPROFILE!, ".local/share/opencode")
const routerDir = path.join(opencodeDir, "model-router")
const db = new Database(path.join(opencodeDir, "opencode.db"), { readonly: true })

const timings = readFileSync(path.join(routerDir, "timings.jsonl"), "utf8")
  .trim().split("\n").filter(Boolean).map((line) => JSON.parse(line))
const outcomes = JSON.parse(readFileSync(path.join(routerDir, "outcomes.json"), "utf8"))

const snapshot = {
  takenAt: Date.now(),
  iso: new Date().toISOString(),
  timings: { rows: timings.length, lastStartedAt: Math.max(...timings.map((t) => t.startedAt)) },
  outcomes: { savedAt: outcomes.savedAt, entries: Object.keys(outcomes.entries).length },
  totals: db.query("select count(*) n, round(sum(cost), 6) cost from session_v2").get(),
  sessionsByClass: db.query(
    "select case when parent_id is null then 'top' else 'child' end k, count(*) n, round(sum(cost), 6) cost from session_v2 group by k",
  ).all(),
  byAgent: db.query(
    "select agent, count(*) n, round(sum(cost), 6) cost from session_v2 group by agent order by n desc",
  ).all(),
  byModel: db.query(
    "select model, count(*) n, round(sum(cost), 6) cost from session_v2 group by model order by n desc",
  ).all(),
  gateway: db.query(
    "select count(*) n, round(sum(cost), 6) cost from session_v2 where model like '%vercel%'",
  ).get(),
}

writeFileSync(path.join(dataDir, "00-baseline.json"), JSON.stringify(snapshot, null, 2))
console.log(JSON.stringify(snapshot, null, 2))
```

- [ ] **Step 2: Run it**

Run: `bun run docs/superpowers/measurements/2026-11-02-tier-simulation/snapshot.ts`

Expected: pretty-printed JSON. `takenAt` within 60s of wall clock. `totals.n` = 179 or higher. `sessionsByClass` has exactly two rows, `top` and `child`. `gateway.n` ≥ 1.

- [ ] **Step 3: Record the pre-run billing baseline**

Read the Vercel AI Gateway dashboard for the running period and write:

```json
{
  "readAt": "<ISO-8601>",
  "periodLabel": "<dashboard's own label, verbatim>",
  "billedUSD": 0,
  "requestCount": 0,
  "creditRemainingUSD": 0,
  "note": "Manual read; no API access configured."
}
```

Save as `data/00-billing-baseline.json`.

Expected: `billedUSD` and `creditRemainingUSD` are numbers you read off the screen, not computed. `creditRemainingUSD` must exceed `billedUSD + 10`, otherwise stop: the $10 budget is already consumed.

- [ ] **Step 4: Commit**

```
git add docs/superpowers/measurements/2026-11-02-tier-simulation
git commit -m "chore(measurement): capture pre-run tier cost baseline"
```

---

## Task 2: Extraction harness

**Files:**
- Create: `docs/superpowers/measurements/2026-11-02-tier-simulation/extract.ts`
- Output: `data/dispatches.jsonl`, `data/sessions.jsonl`, `data/join-report.json`

**Interfaces:**
- Consumes: `data/00-baseline.json` → `takenAt` as `<from>`.
- Produces: `dispatches.jsonl`, one JSON object per dispatch with exactly these fields:
  `sessionID, parentSessionID, tier, tierSource, agent, provider, model, variant, variantSource, joinStatus, nCalls, durationMs, outcome, costUSD, costAttribution, sessionCostTotal, tokens{input,output,reasoning,cacheRead,cacheWrite}, startedAt, timeCreated, tierDisagreement, modelDisagreement`.
  `joinStatus ∈ {exact, split, untimed, unmatched}`. `costUSD` is `null` for `unmatched`.
- Produces: `sessions.jsonl`, one object per session row in the window: `id, parentID, sessionClass, agent, provider, model, variant, cost, tokens{...}, timeCreated`.
- Produces: `join-report.json`: `{window:{from,to}, timingsRows, uniqueChildSessions, exact, split, untimed, unmatched, tierUnknown, tierDisagreement, modelDisagreement}`.
- Task 5 consumes `dispatches.jsonl`; Tasks 6 and 8 consume `sessions.jsonl`.

- [ ] **Step 1: Re-verify the schema before trusting it**

Run:

```powershell
$env:DB="$env:USERPROFILE\.local\share\opencode\opencode.db"
bun -e "const {Database}=require('bun:sqlite');const db=new Database(process.env.DB,{readonly:true});console.log(db.query(\"select name, type from pragma_table_info('session_v2')\").all().filter(c=>/^(id|parent_id|agent|model|cost|tokens_|time_created)/.test(c.name)))"
```

Expected: includes `cost real`, `model text`, `agent text`, `parent_id text`, `time_created integer`, and all five `tokens_*` integer columns. If any is missing or typed differently, stop and report the actual DDL.

- [ ] **Step 2: Write the failing assertion for the duplicate-session case**

Before the script exists, confirm the trap is real:

```powershell
bun -e "const {readFileSync}=require('fs');const p=require('path').join(process.env.USERPROFILE,'.local/share/opencode/model-router/timings.jsonl');const rows=readFileSync(p,'utf8').trim().split('\n').map(JSON.parse);const m=new Map();for(const r of rows)m.set(r.childSessionID,(m.get(r.childSessionID)??0)+1);const dup=[...m].filter(([,n])=>n>1);console.log({rows:rows.length,unique:m.size,duplicated:dup.length,sample:dup.slice(0,3)})"
```

Expected: `duplicated` ≥ 1 (observed: two rows share one `childSessionID`). If `duplicated` is 0, the `split` branch is still required but untestable this run — note it.

- [ ] **Step 3: Implement `extract.ts`**

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

const rows = db
  .query(
    `select id, parent_id, agent, model, cost,
            tokens_input, tokens_output, tokens_reasoning, tokens_cache_read, tokens_cache_write,
            time_created, time_updated, idle_outcome
     from session_v2
     where time_created between ? and ?
     order by time_created`,
  )
  .all(from, to) as Array<Record<string, any>>

const readJsonl = (file: string) =>
  readFileSync(path.join(opencodeDir, "model-router", file), "utf8")
    .trim().split("\n").filter(Boolean).map((line) => JSON.parse(line))

const timings = readJsonl("timings.jsonl").filter((t) => t.startedAt >= from && t.startedAt <= to)
const decisions = readJsonl("decisions.jsonl").filter((d) => d.kind === "decision")

const parseModel = (raw: string | null) => {
  if (!raw) return { provider: "unknown", model: "unknown", variant: "unspecified" }
  const value = JSON.parse(raw) as { providerID?: string; id?: string; variant?: string }
  return {
    provider: value.providerID ?? "unknown",
    model: value.id ?? "unknown",
    variant: value.variant ?? "unspecified",
  }
}

const sessionByID = new Map(rows.map((row) => [row.id, row]))
const timingGroups = new Map<string, any[]>()
for (const timing of timings) {
  const group = timingGroups.get(timing.childSessionID) ?? []
  group.push(timing)
  timingGroups.set(timing.childSessionID, group)
}

const variantFromDecisions = (sessionID: string, startedAt: number) => {
  let best: { variant: string; delta: number } | null = null
  for (const decision of decisions) {
    if (decision.sessionID !== sessionID) continue
    const delta = Math.abs(Date.parse(decision.ts) - startedAt)
    if (delta > 120_000) continue
    if (best && best.delta <= delta) continue
    best = { variant: decision.chosen.variant, delta }
  }
  return best
}

const dispatches: any[] = []
const covered = new Set<string>()

for (const [sessionID, group] of timingGroups) {
  const session = sessionByID.get(sessionID)
  covered.add(sessionID)
  const first = group[0]

  if (!session) {
    dispatches.push({
      sessionID, parentSessionID: first.parentSessionID,
      tier: first.tier, tierSource: "timings", agent: "unknown",
      provider: "unknown", model: "unknown", variant: "unknown", variantSource: "none",
      joinStatus: "unmatched", nCalls: group.length, durationMs: first.durationMs,
      outcome: first.outcome, costUSD: null, costAttribution: "none", sessionCostTotal: null,
      tokens: null, startedAt: first.startedAt, timeCreated: null,
      tierDisagreement: false, modelDisagreement: false,
    })
    continue
  }

  const parsed = parseModel(session.model)
  const agentIsTier = TIER_AGENTS.has(session.agent)
  const tier = first.tier !== "unknown" ? first.tier : agentIsTier ? session.agent : "unknown"
  const tierSource = first.tier !== "unknown" ? "timings" : agentIsTier ? "session_agent" : "unknown"
  const decisionVariant =
    parsed.variant === "unspecified" ? variantFromDecisions(sessionID, first.startedAt) : null
  const timingModel = first.model === "unknown" ? null : first.model

  for (const call of group) {
    dispatches.push({
      sessionID,
      parentSessionID: call.parentSessionID,
      tier,
      tierSource,
      agent: session.agent,
      provider: parsed.provider,
      model: parsed.model,
      variant: decisionVariant?.variant ?? parsed.variant,
      variantSource: parsed.variant !== "unspecified" ? "session_v2" : decisionVariant ? "decisions" : "unspecified",
      joinStatus: group.length === 1 ? "exact" : "split",
      nCalls: group.length,
      durationMs: call.durationMs,
      outcome: call.outcome,
      costUSD: session.cost / group.length,
      costAttribution: group.length === 1 ? "direct" : "split",
      sessionCostTotal: session.cost,
      tokens: {
        input: session.tokens_input,
        output: session.tokens_output,
        reasoning: session.tokens_reasoning,
        cacheRead: session.tokens_cache_read,
        cacheWrite: session.tokens_cache_write,
      },
      startedAt: call.startedAt,
      timeCreated: session.time_created,
      tierDisagreement: first.tier !== "unknown" && agentIsTier && first.tier !== session.agent,
      modelDisagreement: timingModel !== null && timingModel !== `${parsed.provider}/${parsed.model}`,
    })
  }
}

for (const row of rows) {
  if (covered.has(row.id)) continue
  if (row.parent_id === null) continue
  if (!TIER_AGENTS.has(row.agent)) continue
  const parsed = parseModel(row.model)
  dispatches.push({
    sessionID: row.id, parentSessionID: row.parent_id,
    tier: row.agent, tierSource: "session_agent", agent: row.agent,
    provider: parsed.provider, model: parsed.model,
    variant: parsed.variant, variantSource: "session_v2",
    joinStatus: "untimed", nCalls: 0, durationMs: null,
    outcome: row.idle_outcome, costUSD: row.cost, costAttribution: "direct",
    sessionCostTotal: row.cost,
    tokens: {
      input: row.tokens_input, output: row.tokens_output, reasoning: row.tokens_reasoning,
      cacheRead: row.tokens_cache_read, cacheWrite: row.tokens_cache_write,
    },
    startedAt: null, timeCreated: row.time_created,
    tierDisagreement: false, modelDisagreement: false,
  })
}

const sessions = rows.map((row) => {
  const parsed = parseModel(row.model)
  return {
    id: row.id,
    parentID: row.parent_id,
    sessionClass: row.parent_id === null ? "top" : "child",
    agent: row.agent,
    provider: parsed.provider,
    model: parsed.model,
    variant: parsed.variant,
    cost: row.cost,
    tokens: {
      input: row.tokens_input, output: row.tokens_output, reasoning: row.tokens_reasoning,
      cacheRead: row.tokens_cache_read, cacheWrite: row.tokens_cache_write,
    },
    timeCreated: row.time_created,
  }
})

const count = (status: string) => dispatches.filter((d) => d.joinStatus === status).length
const joinReport = {
  window: { from, to },
  timingsRows: timings.length,
  uniqueChildSessions: timingGroups.size,
  exact: count("exact"),
  split: count("split"),
  untimed: count("untimed"),
  unmatched: count("unmatched"),
  tierUnknown: dispatches.filter((d) => d.tier === "unknown").length,
  tierDisagreement: dispatches.filter((d) => d.tierDisagreement).length,
  modelDisagreement: dispatches.filter((d) => d.modelDisagreement).length,
}

const dataDir = path.join(import.meta.dir, "data")
writeFileSync(path.join(dataDir, "dispatches.jsonl"), dispatches.map((d) => JSON.stringify(d)).join("\n") + "\n")
writeFileSync(path.join(dataDir, "sessions.jsonl"), sessions.map((s) => JSON.stringify(s)).join("\n") + "\n")
writeFileSync(path.join(dataDir, "join-report.json"), JSON.stringify(joinReport, null, 2))
console.log(JSON.stringify(joinReport, null, 2))
```

- [ ] **Step 4: Dry-run against existing traffic, before spending anything**

Run: `bun run docs/superpowers/measurements/2026-11-02-tier-simulation/extract.ts <firstSessionMs> <baselineTakenAt>`

Use `1793032672338` as `<firstSessionMs>` if unsure: that is the oldest `time_created` in the database, and `baselineTakenAt` comes from `00-baseline.json.takenAt`. This window contains existing traffic only; nothing is dispatched.

Expected: `timingsRows` close to 106. `split` ≥ 1. `unmatched` between 0 and 12. `exact + split + untimed` equals the number of tier child sessions. No exception from `JSON.parse`.

- [ ] **Step 5: Verify cost is not double-counted**

Run:

```powershell
bun -e "const {readFileSync}=require('fs');const p='docs/superpowers/measurements/2026-11-02-tier-simulation/data/dispatches.jsonl';const rows=readFileSync(p,'utf8').trim().split('\n').map(JSON.parse);const costed=rows.filter(r=>r.costUSD!==null);const total=costed.reduce((a,r)=>a+r.costUSD,0);const bySession=new Map();for(const r of rows)bySession.set(r.sessionID,r.sessionCostTotal??0);const truth=[...bySession.values()].reduce((a,c)=>a+c,0);console.log({costedDispatches:costed.length,total:Number(total.toFixed(6)),sessionTruth:Number(truth.toFixed(6)),delta:Number((total-truth).toFixed(9))})"
```

Expected: `delta` is `0` (or within 1e-9). A non-zero delta means a session's cost was added more than once or dropped.

---

## Task 3: Session classification

**Files:**
- Modify: `docs/superpowers/measurements/2026-11-02-tier-simulation/extract.ts` (classification already emitted)
- Create: `docs/superpowers/measurements/2026-11-02-tier-simulation/classify.ts`
- Output: `data/classification.json`

**Interfaces:**
- Consumes: `data/sessions.jsonl`, `data/dispatches.jsonl`.
- Produces: `classification.json`: `{tiers:{fast,medium,heavy}, nonTierChildren:{...}, topLevel:{n,cost,gatewayCost}, totals:{sessionCount,sessionCost}, gatewayShare, checks...}`. Task 8 consumes this directly.

- [ ] **Step 1: Write the failing check first**

The rule: a session is a tier dispatch only if `parent_id is not null` **and** `agent ∈ {fast, medium, heavy}`. `general`, `explore`, `plan`, `build` spawn child sessions too and must not be counted as tiers.

```powershell
bun -e "const {Database}=require('bun:sqlite');const db=new Database(require('path').join(process.env.USERPROFILE,'.local/share/opencode/opencode.db'),{readonly:true});console.log(db.query(\"select agent, count(*) n from session_v2 where parent_id is not null group by agent order by n desc\").all())"
```

Expected: several non-tier children exist (`general`, `explore`, `plan`, `build`). If every child's agent were a tier, the filter would be redundant — record that it is not.

- [ ] **Step 2: Implement `classify.ts`**

Signature: `classify(sessions: Session[], dispatches: Dispatch[]): Classification`. It reads the two JSONL files, then groups:

- `tiers[tier]` = child sessions whose `agent` is a tier name; `n`, `cost`, `gatewayCost` (sum where `provider === "vercel"`).
- `nonTierChildren` = child sessions whose agent is not a tier name; `n`, `cost`, `agents[]`.
- `topLevel` = `sessionClass === "top"`; `n`, `cost`, `gatewayCost`.
- `totals` = all sessions; `sessionCount`, `sessionCost`.
- `gatewayShare` = gateway cost ÷ `totals.sessionCost`.
- `checks`:
  - `tierDispatchSessions` = sum over tiers of `n`.
  - `dispatchesCoveringTiers` = dispatches with `tier ∈ {fast,medium,heavy}` counted by distinct `sessionID`.
  - `orphanDispatches` = dispatches whose `sessionID` is absent from `sessions.jsonl`.

- [ ] **Step 3: Run and check**

Run, as two separate commands:

`bun run docs/superpowers/measurements/2026-11-02-tier-simulation/extract.ts <from> <to>`

then

`bun run docs/superpowers/measurements/2026-11-02-tier-simulation/classify.ts`

Expected:
- `nonTierChildren.n` ≥ 1 on pre-run data.
- `tiers.fast.n + tiers.medium.n + tiers.heavy.n` equals the count of child sessions with tier agents from Step 1.
- `checks.dispatchesCoveringTiers` ≥ `checks.tierDispatchSessions` (extra dispatches are `unmatched`, which is allowed) and `checks.orphanDispatches` equals `join-report.json`'s `unmatched`. If `orphanDispatches` exceeds `unmatched`, a timing row points at a session created before the window — widen `from` and rerun.

- [ ] **Step 4: Commit**

```
git add docs/superpowers/measurements/2026-11-02-tier-simulation
git commit -m "feat(measurement): extract and classify tier dispatches"
```

---

## Task 4: Variant reconciliation

**Files:**
- Create: `docs/superpowers/measurements/2026-11-02-tier-simulation/variants.ts`
- Output: `data/variants.json`

**Interfaces:**
- Consumes: `data/dispatches.jsonl`.
- Produces: `variants.json`: `{byKey:{[provider/model#variant]:{n,costUSD,tokens}}, unresolved, sources:{session_v2,decisions,unspecified}, disagreements:[...], tierModelMatrix:[...]}`. Task 5 consumes `byKey`; Task 10 quotes `sources` and `disagreements`.

- [ ] **Step 1: Confirm `timings.jsonl` cannot supply a variant**

```powershell
bun -e "const {readFileSync}=require('fs');const p=require('path').join(process.env.USERPROFILE,'.local/share/opencode/model-router/timings.jsonl');const rows=readFileSync(p,'utf8').trim().split('\n').map(JSON.parse);const keys=[...new Set(rows.flatMap(r=>Object.keys(r)))];console.log({hasVariant:keys.includes('variant'),hasCost:keys.includes('cost'),hasOutputTokens:keys.some(k=>/token/i.test(k)),keys})"
```

Expected: `hasVariant: false`, `hasCost: false`, `hasOutputTokens: false`. If any is `true`, the plan's premise is wrong — stop and report which key exists.

- [ ] **Step 2: Implement the join rules explicitly**

Signature: `joinVariants(dispatches: Dispatch[]): VariantReport`. Rules, in precedence order:

1. **Identity key is `childSessionID = session_v2.id`.** Do not join on `startedAt ≈ time_created`; that is a heuristic that silently mispairs concurrent dispatches, and 2 sessions would collide within the same millisecond. Time is used only to bound the window.
2. **`session_v2` wins on model and variant.** It is the session that was billed. If `timings.model` disagrees with `provider/id` from `session_v2.model`, keep `session_v2` and increment `modelDisagreement`.
3. **`timings.jsonl` wins on tier and duration.** `session_v2` has no tier field, and `durationMs` exists only in timings.
4. **`decisions.jsonl` is a fallback for variant only**, used when `session_v2.model` has no `variant` key, matched on `sessionID` plus `|ts − startedAt| ≤ 120s`. It never overrides `session_v2` and never supplies identity, because `childSessionID` is `null` in `shadow` mode.
5. **Unresolvable variant → literal `"unspecified"`.** Do not infer a variant from the tier name. `"none"` and `"default"` are real observed strings and must be kept as-is, not normalised.
6. **Ambiguous join** = one `childSessionID` on multiple timing rows. Already handled in Task 2 by `split`; here, count it and record it under `disagreements` as `multiCall`. Cost is attributed `sessionCost ÷ nCalls`, which is exact for totals and only approximate per call.
7. **Unmatched timing row** = no `session_v2` row. Record as `unresolved`, keep `costUSD: null`, exclude from cost statistics.

- [ ] **Step 3: Run and check the join integrity**

Run: `bun run docs/superpowers/measurements/2026-11-02-tier-simulation/variants.ts`

Expected:
- `sources.session_v2 + sources.decisions + sources.unspecified` = number of dispatches with a session row.
- `unresolved` equals `join-report.json`'s `unmatched`.
- `tierModelMatrix` contains a row for `heavy` whose model is `openai/gpt-6.1-terra-fast`, variant `xhigh` (observed twice before this plan). If the heavy row is `deepseek/deepseek-flash`, the run used the pre-migration fallback chain — stop and report; the configuration under test is not what dispatched.
- `disagreements.modelDisagreement` is 0 on pre-run data where `timings.model` is not `unknown`; any non-zero value is worth naming in the report.

---

## Task 5: Statistics engine

**Files:**
- Create: `docs/superpowers/measurements/2026-11-02-tier-simulation/stats.ts`
- Output: `data/stats.json`, plus Markdown tables on stdout

**Interfaces:**
- Consumes: `data/dispatches.jsonl`.
- Produces: `stats.json` = `{groups: StatGroup[], decisions:{}}` where each `StatGroup` is
  `{groupBy: "tier"|"modelVariant"|"tierModelVariant", group: string, n, costedN, metrics: {[metric]: {n, total, mean, median, p90, min, max, meanCI95: [lo, hi]}}}`.
- Metrics, exactly: `cost_usd`, `tokens_input`, `tokens_output`, `tokens_reasoning`, `tokens_cache_read`, `tokens_cache_write`, `duration_ms`.
- Task 8 reads `stats.json`; Task 10 renders its tables.

- [ ] **Step 1: Implement the percentile and the group reducer**

```ts
const percentile = (sorted: number[], p: number) => {
  if (sorted.length === 0) return null
  return sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)]
}

const summarise = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b)
  const mean = sorted.reduce((a, v) => a + v, 0) / sorted.length
  return {
    n: sorted.length,
    total: sorted.reduce((a, v) => a + v, 0),
    mean,
    median: percentile(sorted, 0.5),
    p90: percentile(sorted, 0.9),
    min: sorted[0],
    max: sorted[sorted.length - 1],
    meanCI95: bootstrapCI(values, 0.95, 2000),
  }
}
```

`bootstrapCI` resamples `values` with replacement 2000 times and returns the 2.5th and 97.5th percentiles of the resampled means. Seed it with a fixed LCG (`seed = 42`) so reruns are identical.

- [ ] **Step 2: Define the three groupings and the zero handling**

- `tier` — every dispatch with `costUSD !== null`, grouped by `tier`.
- `modelVariant` — grouped by `` `${provider}/${model}#${variant}` ``.
- `tierModelVariant` — grouped by `` `${tier} | ${provider}/${model}#${variant}` ``.

`costedN` = group size after removing `costUSD === 0`. `n` includes them. Both are printed. A zero-cost model (`reflection/beam-free`) must not vanish from the sample count, and must not drag the cost mean down.

Excluded from every grouping: `costUSD === null` (`unmatched`). Their count is printed once as `excludedUnmatched`.

- [ ] **Step 3: Print tables with this exact column order**

```
group | metric | n | costed_n | total | mean | median | p90 | min | max | ci95_low | ci95_high
```

One row per (group, metric). Number formatting: cost to 6 dp, tokens as integers, duration in ms to 1 dp.

- [ ] **Step 4: Dry-run on pre-run traffic**

Run: `bun run docs/superpowers/measurements/2026-11-02-tier-simulation/stats.ts`

Expected:
- Three tables print, plus `excludedUnmatched`.
- Every `tier` group present in `dispatches.jsonl` appears.
- For `heavy`, `mean < p90 ≤ max` and `meanCI95` is wider than for `fast` (n=2 vs n=50). If `meanCI95` is zero-width, the bootstrap is broken.
- Running twice produces byte-identical `stats.json`.

- [ ] **Step 5: Commit**

```
git add docs/superpowers/measurements/2026-11-02-tier-simulation
git commit -m "feat(measurement): variant join and cost statistics"
```

---

## Task 6: Reconciliation and spend-split harness

**Files:**
- Create: `docs/superpowers/measurements/2026-11-02-tier-simulation/reconcile.ts`
- Create: `docs/superpowers/measurements/2026-11-02-tier-simulation/spend.ts`
- Output: `data/reconcile.json`

**Interfaces:**
- Consumes: `data/00-billing-baseline.json`, `data/99-billing-final.json`, `data/stats.json`, `data/sessions.jsonl`, `data/classification.json`.
- Produces: `reconcile.json` = `{window, localUSD, billedUSD, deltaUSD, deltaPct, impliedMultiplier:{[model]:{n,mean,cv,perRow[]}}, verdict, split:{tierUSD, tierShare, topLevelUSD, topLevelShare, nonTierChildUSD}, projection:{}}`. Task 9 reads `verdict`, `impliedMultiplier`, `projection`; Task 10 renders all of it.
- `spend.ts` signature: `bun run spend.ts <from> [to]` → prints `{window, spend, requests, byTierAgent}`. Used by the stop rule in Task 7. Its whole body is one query, so write it directly:

```ts
import { Database } from "bun:sqlite"
import path from "node:path"

const from = Number(process.argv[2])
const to = Number(process.argv[3] ?? Date.now())
if (!from) throw new Error("usage: bun run spend.ts <fromEpochMs> [toEpochMs]")

const db = new Database(
  path.join(process.env.USERPROFILE!, ".local/share/opencode/opencode.db"),
  { readonly: true },
)

console.log(
  JSON.stringify(
    {
      window: { from, to },
      spend: db.query("select round(sum(cost), 6) v from session_v2 where time_created between ? and ?").get(from, to),
      requests: db.query("select count(*) v from session_v2 where time_created between ? and ?").get(from, to),
      byTierAgent: db.query(
        `select case when parent_id is null then 'top' else coalesce(agent, 'unknown') end k,
                count(*) n, round(sum(cost), 6) cost
         from session_v2 where time_created between ? and ?
         group by k order by cost desc`,
      ).all(from, to),
    },
    null,
    2,
  ),
)
```

- [ ] **Step 1: Encode the catalog hypothesis as constants**

```ts
const CATALOG = {
  "minimax/minimax-m3.1-flash":        { input: 0.15, output: 0.60, cacheRead: 0.015, cacheWrite: 0.15 },
  "deepseek/deepseek-v4.1-flash-1017": { input: 0.30, output: 1.20, cacheRead: 0.007, cacheWrite: 0.30 },
  "openai/gpt-6.1-terra-fast":         { input: 1.00, output: 5.00, cacheRead: 0.05,  cacheWrite: 1.00 },
  "openai/gpt-6.1-terra":              { input: 1.00, output: 5.00, cacheRead: 0.05,  cacheWrite: 1.00 },
}
```

These are the *hypothesis under test*, not truth. `cacheWrite` has no published figure in the spec, so it is set equal to `input` — that assumption is exactly what `impliedMultiplier` measures.

- [ ] **Step 2: Compute the implied multiplier instead of five unknowns**

With 1–3 rows per model, five unit prices are underdetermined. A single scalar is testable:

```
catalogUSD(row) = (input·p_in + output·p_out + reasoning·p_out + cacheRead·p_rd + cacheWrite·p_wr) / 1e6
k(row)          = costUSD / catalogUSD(row)
```

Report `k` per model: `n`, `mean`, `cv = stdev/mean`, and every `perRow` value. Interpretation:
- `cv < 0.05` → one uniform effective multiplier explains the model. Report it and multiply the projection by it.
- `cv ≥ 0.05` → the mismatch is not a unit-price offset; report as unexplained, do not adjust the projection.
- `catalogUSD === 0` (all-zero tokens) → skip, count in `n`, not in `mean`.

- [ ] **Step 3: Compute the billing delta and the verdict**

```
localUSD  = sum(sessions.cost) for sessions with timeCreated in [from, to]
billedUSD = 99-billing-final.billedUSD − 00-billing-baseline.billedUSD
deltaPct  = (localUSD − billedUSD) / billedUSD × 100
```

Verdict bands, stated in the report verbatim:
- `|deltaPct| ≤ 15` → `catalog-confirmed`. Token accounting and cache rates are trustworthy; the local projection stands.
- `deltaPct < −15` → `local-overstates`. Local prices exceed billed; the projection is an upper bound. Say which model's `k` explains it.
- `deltaPct > 15` → `local-understates`. Billed exceeds local; requests are missing from `session_v2` (failed, retried, or non-session calls). The projection is a lower bound and the gap must be named.
- `billedUSD ≤ 0` → `inconclusive`, because the dashboard was not re-read or the window straddles the reporting period.

The window must sit inside one dashboard reporting period. If the dashboard reports by UTC day and the run crosses midnight, split the run at the boundary or extend the dashboard period; do not compare a partial period.

- [ ] **Step 4: Compute the spend split**

```
tierUSD        = sum over tiers of classification.tiers[*].cost
nonTierChildUSD = classification.nonTierChildren.cost
topLevelUSD    = classification.topLevel.cost
totalUSD       = tierUSD + nonTierChildUSD + topLevelUSD
tierShare      = tierUSD / totalUSD
```

Also report `topLevelGatewayUSD` separately: on the 2026-11-02 baseline, top-level sessions held $3.0371 against $0.8538 for child sessions (78% of total), and only the gateway portion of that is comparable to tier spend, because non-gateway models are free.

`topLevel` during the run includes sessions that existed before the window, whose `cost` is cumulative and not separable. Report `topLevelSessionsCreatedInWindow` alongside `topLevelUSD` and flag the difference in Section 11 of the report.

- [ ] **Step 5: Encode the projection**

```
heavyMean   = stats.groups[tierModelVariant where tier=heavy].metrics.cost_usd.mean
multiplier  = impliedMultiplier[heavyModel].cv < 0.05 ? impliedMultiplier[heavyModel].mean : 1
adjusted    = multiplier !== 1 ? "adjusted" : "unadjusted"
monthlyMean = heavyMean * multiplier * 9 * 30
monthlyP90  = p90       * multiplier * 9 * 30
band        = monthlyMean < 100 ? "keep-terra-xhigh" : monthlyMean > 200 ? "drop-to-deepseek-max" : "operator-call"
```

Task 9 re-derives this from the run window and is authoritative; this step exists only so the band is computed by the same arithmetic in both places. If the multiplier is not applied (`cv ≥ 0.05`), mark the projection `unadjusted` and say in the report that the heavy figure is therefore a lower bound.

- [ ] **Step 6: Run both scripts and check**

Run: `bun run docs/superpowers/measurements/2026-11-02-tier-simulation/reconcile.ts`

Expected on pre-run data: `verdict` is `inconclusive` (no `99-billing-final.json` yet). `impliedMultiplier["openai/gpt-6.1-terra-fast"].mean` is between 2.0 and 3.0 with `cv < 0.05` (observed k ≈ 2.55 and 2.62). `impliedMultiplier` for both DeepSeek and MiniMax is 1.00 ± 0.01. If Terra's `k` comes out near 1.0, the earlier discrepancy was a transient pricing error — record that, since it changes the heavy projection by 2.5×.

Run: `bun run docs/superpowers/measurements/2026-11-02-tier-simulation/spend.ts <baselineTakenAt>`

Expected: `spend` ≈ `00-baseline.json` totals (nothing dispatched since). `requests` ≥ 1.

- [ ] **Step 7: Commit**

```
git add docs/superpowers/measurements/2026-11-02-tier-simulation
git commit -m "feat(measurement): reconciliation and spend split"
```

---

## Task 7: Run the simulated day

**Files:**
- Output: `data/07-run-log.md` — one line per dispatch: `seq | tier | agent | sessionID | promptFamily | variantOfSubject | startedAt`
- Output: `data/07-stop-checks.json`

**Interfaces:**
- Consumes: `spend.ts` from Task 6.
- Produces: `07-run-log.md` session IDs, which Task 8 cross-checks against `dispatches.jsonl`.
- Produces: `run-window.json` = `{from, to, startTakenAt, endTakenAt, planned:{fast,medium,heavy}, executed:{...}}`. Task 8 uses this window.

- [ ] **Step 1: Set the window and confirm headroom**

Run: `bun run docs/superpowers/measurements/2026-11-02-tier-simulation/spend.ts <baselineTakenAt>`

Expected: `spend` unchanged since Task 1. Write `run-window.json` with `from = 00-baseline.json.takenAt` and `planned = {fast: 45, medium: 39, heavy: 9}`.

Projected cost of the plan: `45×$0.0072 + 39×$0.0074 + 9×$0.053 ≈ $1.09`. Headroom under the $10 cap is ~8.9×. Record that arithmetic in `run-window.json`; it is the justification for the stop thresholds.

- [ ] **Step 2: Run the fast block — 45 dispatches, 9 families × 5**

Each dispatch: `subagent(agent="fast", ...)` with the background default. `agent="fast"` is what sets `timings.tier`; do not substitute `explore` or `general`, which are non-tier children and would be misclassified in Task 3.

Families, 5 repetitions each, varying only `{symbol}`, `{glob}`, `{path}`, `{package}`, `{table}` between repetitions so cache reuse is realistic rather than pathological:

1. `Locate every caller of {symbol} and list file:line.`
2. `List files matching {glob} with line counts.`
3. `Where is the experimental route group registered? Name the file and the identifier pattern.`
4. `Dump pragma table_info for {table} and summarise the columns.`
5. `Read {path} and report its section headings verbatim.`
6. `Count occurrences of {symbol} across packages and show the top 3 files.`
7. `Show the last 20 lines of {path} and summarise what failed, if anything.`
8. `Report the package.json scripts for {package}.`
9. `Find the tests covering {symbol}.`

Subjects (use each once, then repeat the family with the next subject): `SessionExecution.wake`, `*.fixture.tsx`, `sqliteMaster`, `session_v2`, `docs/local-development.md`, `experimental.`, `logs/`, `packages/util`, `derivePercentile`.

Expected: 45 lines in `07-run-log.md`, all `tier=fast`.

- [ ] **Step 3: Stop check, then the medium block — 39 dispatches**

Run: `bun run docs/superpowers/measurements/2026-11-02-tier-simulation/spend.ts <from>`

Expected: `spend` ≤ $4.00. If it exceeds $4.00, stop the run entirely and go to Task 8 with what exists; record `stoppedEarly: "budget"` in `run-window.json`.

Medium families (5,5,5,5,5,5,5,4 = 39), all writing only inside `data/sandbox/`:

1. `Add a pure helper {name} to data/sandbox/{n}/helper.ts with a bun test.`
2. `Replace a forbidden type assertion with a type guard in data/sandbox/{n}/guard.ts.`
3. `Write three bun tests for the existing function in data/sandbox/{n}/target.ts.`
4. `Rename a local symbol within data/sandbox/{n}/rename.ts only.`
5. `Add a JSDoc block to the exported function in data/sandbox/{n}/doc.ts.`
6. `Add a one-line default to the config object in data/sandbox/{n}/config.ts.`
7. `Fix the type error reported in data/sandbox/{n}/broken.ts.`
8. `Implement a small schema for {shape} and one round-trip test.`

Prepare the sandbox files before the block: for each `n` in 1..8, create the target file with a trivial `export const target = (x: number) => x` so the task is small but real. A prompt with nothing to edit produces a one-token reply and an unrealistically cheap sample.

- [ ] **Step 4: Stop check, then the heavy block — 9 dispatches**

Run: `bun run docs/superpowers/measurements/2026-11-02-tier-simulation/spend.ts <from>`

Expected: ≤ $4.00 before starting. All nine heavy tasks are **read-only analysis**; none may modify product files:

1. `Diagnose why a test that passes locally fails on CI, given these artifacts: {paste 40 lines}. Rank causes by likelihood.`
2. `Compare two designs for {decision} and recommend one, with the cost of being wrong.`
3. `Audit the input handler in {path} for injection and path-traversal risk.`
4. `Root-cause analysis: this check failed with {error}; give the causal chain and the minimal fix.`
5. `Propose a migration strategy for renaming a column without downtime.`
6. `Write a profiling plan for a slow query over session_v2, with the measurements that would identify the bottleneck.`
7. `Review this diff for correctness across five files: {paste diff}.`
8. `Design the integration between two subsystems and name the failure modes.`
9. `Assess the trade-offs of the sampling plan in this document and identify what its statistics cannot prove.`

Vary the subject per dispatch so that context is genuinely large and different each time. Identical heavy prompts would measure a warm cache, not a heavy dispatch.

- [ ] **Step 5: Close the window and record**

Run: `bun run docs/superpowers/measurements/2026-11-02-tier-simulation/snapshot.ts`, then save its output as `data/99-final.json` and set `run-window.json.to` from its `takenAt`.

Expected: `timings.rows` grew by ≥ the number of dispatches. `executed` counts match the lines in `07-run-log.md`. `99-final.json.gateway.n` grew.

- [ ] **Step 6: Read the dashboard and record the billed total**

Write `data/99-billing-final.json` in the same shape as `00-billing-baseline.json`, from the dashboard, covering the same period.

Expected: `billedUSD` − baseline `billedUSD` is between $0.50 and $10.00. A figure outside that range means the window or the period label is wrong — do not proceed to Task 9 with a mismatched period.

- [ ] **Step 7: Commit**

```
git add docs/superpowers/measurements/2026-11-02-tier-simulation
git commit -m "chore(measurement): run simulated day of tier traffic"
```

---

## Task 8: Compute statistics for the run

**Files:**
- Output: `data/dispatches.jsonl`, `data/sessions.jsonl`, `data/join-report.json`, `data/classification.json`, `data/variants.json`, `data/stats.json` — all regenerated over the run window
- Modify: `data/07-run-log.md` (annotate coverage)

**Interfaces:**
- Consumes: `run-window.json`.
- Produces: the five data files Tasks 9 and 10 read.

- [ ] **Step 1: Regenerate extraction over the run window only**

Run: `bun run docs/superpowers/measurements/2026-11-02-tier-simulation/extract.ts <run-window.from> <run-window.to>`

Expected: `timingsRows` ≥ 93. `unmatched` ≤ 10% of `timingsRows`. `tierUnknown` ≤ 5% of `timingsRows`.

- [ ] **Step 2: Run classification, variants and stats**

Run, in order: `classify.ts`, `variants.ts`, `stats.ts`.

Expected:
- `classification.checks.tierDispatchSessions` ≥ 93.
- `variants.sources.unspecified` = 0, because every gateway dispatch records a variant. Any non-zero value means a session row lacks `variant` — name those session IDs in the report.
- `stats.json` has `tier` groups `fast`, `medium`, `heavy` with `n` of 45, 39, 9 (±2 each; extra dispatches from failed first attempts are counted, not discarded).
- `excludedUnmatched` printed and non-silent.

- [ ] **Step 3: Cross-check the run log against the extracted sample**

For each line in `07-run-log.md`, assert its `sessionID` appears in `dispatches.jsonl`. Produce the diff:

```powershell
bun -e "const {readFileSync}=require('fs');const d='docs/superpowers/measurements/2026-11-02-tier-simulation/data';const log=readFileSync(d+'/07-run-log.md','utf8').trim().split('\n').slice(2);const ids=new Set(log.map(l=>l.split('|')[3]?.trim()).filter(Boolean));const ex=new Set(readFileSync(d+'/dispatches.jsonl','utf8').trim().split('\n').map(JSON.parse).map(r=>r.sessionID));const missing=[...ids].filter(id=>!ex.has(id));console.log({logged:ids.size,extracted:ex.size,missingFromExtraction:missing.length,sample:missing.slice(0,5)})"
```

Expected: `missingFromExtraction` is 0. A non-zero value means those dispatches have no `session_v2` row — the same failure mode as `unmatched`, and it caps how much of the spend can be attributed.

- [ ] **Step 4: Record coverage in the run log**

Append a summary line: `coverage: logged=<n> extracted=<n> unmatched=<n> spend_from_sessions=$<x>`.

Expected: printed values consistent with `join-report.json` and `spend.ts`.

---

## Task 9: Apply the decision rule

**Files:**
- Output: `data/reconcile.json` (regenerated), `data/decision.json`

**Interfaces:**
- Consumes: `stats.json`, `classification.json`, `99-billing-final.json`.
- Produces: `decision.json` = `{heavyMean, heavyMedian, heavyP90, heavyN, multiplier, multiplierCV, monthlyMean, monthlyP90, monthlyCI95, band, verdict, deltaPct, tierShare, rationale}`. Task 10 renders it verbatim.

- [ ] **Step 1: Run the reconciliation over the run window**

Run: `bun run docs/superpowers/measurements/2026-11-02-tier-simulation/reconcile.ts`

Expected: `billedUSD > 0`, `deltaPct` a number, and `verdict` one of the four bands. `impliedMultiplier` includes a `heavy` model entry with `n = 9`.

- [ ] **Step 2: Compute the monthly projection with the multiplier applied**

```
monthlyMean = heavyMean × multiplier × 9 × 30
monthlyP90  = heavyP90  × multiplier × 9 × 30
```

Write both, plus `monthlyCI95` from the bootstrap interval, into `decision.json`.

Expected: `monthlyMean < monthlyP90`, and `monthlyCI95[0] < monthlyMean < monthlyCI95[1]`.

- [ ] **Step 3: Assign the band and write the rationale**

```
band = monthlyMean < 100 ? "keep-terra-xhigh"
     : monthlyMean > 200 ? "drop-to-deepseek-max"
     : "operator-call"
```

Expected: `rationale` names (a) the measured heavy mean and its n, (b) the multiplier and its `cv`, (c) whether the projection is adjusted or unadjusted, and (d) the p90 scenario. If `band` is `operator-call`, the rationale must state the two options with their monthly costs and recommend one; it may not stop at "it depends".

- [ ] **Step 4: State the sample-size limit in the decision file**

Add `smallSample: {heavyN: 9, p90IsOrderStatistic: true, note: "..."}`.

Expected: if `heavyN < 20`, the note says the p90 is the second-largest observation, not an estimated 90th percentile, and that the CI, not the point estimate, carries the decision.

---

## Task 10: Write the report

**Files:**
- Create: `docs/superpowers/measurements/2026-11-02-tier-simulation/report.md`

**Interfaces:**
- Consumes: `00-baseline.json`, `99-final.json`, `join-report.json`, `classification.json`, `variants.json`, `stats.json`, `reconcile.json`, `decision.json`, both billing files.
- Produces: the human-readable result. No later task depends on it.

- [ ] **Step 1: Write the report with exactly these headings**

```markdown
# Tier Usage Simulation — 2026-11-02

## 1. Run summary
## 2. Method and join integrity
## 3. Baseline vs final totals
## 4. Per-tier cost distribution
## 5. Per-variant cost distribution
## 6. Token composition
## 7. Local vs billed reconciliation
## 8. Tier spend vs main-session spend
## 9. Monthly projection and decision
## 10. Assumptions still unverified
## 11. What this data cannot tell you
```

- [ ] **Step 2: Fill sections 4–6 from `stats.json` without re-deriving numbers**

Sections 4 and 5 each contain one table with the exact Task 5 columns: `group | metric | n | costed_n | total | mean | median | p90 | min | max | ci95_low | ci95_high`, and one row per metric. Section 6 is a per-model table: `model | variant | input | output | reasoning | cache_read | cache_write | cost | dominant_term`, where `dominant_term` names whichever token class contributes the most cost.

Expected: every number in those sections is traceable to a row in `stats.json`. No hand arithmetic.

- [ ] **Step 3: Write section 7 with the delta and its meaning**

Include `localUSD`, `billedUSD`, `deltaPct`, `verdict`, and the `impliedMultiplier` table with `cv`. State the consequence in one sentence per band, using the Task 6 wording.

Expected: if `|deltaPct| > 15`, the section names the model whose `k` explains most of the gap, and says explicitly whether the monthly projection is an upper or lower bound as a result.

- [ ] **Step 4: Write section 8 with the split and its caveat**

Include `tierUSD`, `nonTierChildUSD`, `topLevelUSD`, `tierShare`, `topLevelGatewayUSD`, and `topLevelSessionsCreatedInWindow`.

Expected: the caveat states that `session_v2.cost` is cumulative per session, so top-level spend in the window can only be bounded, not isolated, and that the numbers are therefore a range rather than exact.

- [ ] **Step 5: Write sections 10 and 11 as explicit lists**

Section 10 (assumptions still unverified):
- `cacheWrite` unit price; measured only as a per-model multiplier.
- Whether the billed model id is `gpt-6.1-terra-fast` or `gpt-6.1-terra`.
- Whether gateway prices equal the catalog figures quoted in the spec.
- Whether a 9-dispatch heavy day is representative of a real day.
- Whether simulated task difficulty matches real dispatch difficulty.

Section 11 (what this data cannot tell you):
- Which reasoning effort actually ran, beyond the `variant` string.
- Cost of dispatches with no `session_v2` row (unmatched).
- Cost of a long-lived top-level session attributable to any one window.
- Per-request billed cost: the dashboard total is period-level, not request-level.
- Whether the same task would cost less on the alternative model; no A/B was run.

Expected: both sections are lists of specific claims, each with the reason it is unavailable. No entry reads "not applicable".

- [ ] **Step 6: State the headline and the band in section 9 in the first sentence**

Expected: the first sentence of section 9 gives `monthlyMean`, the band, and the recommendation. The supporting table (mean, median, p90, CI, multiplier, adjusted values) follows it.

- [ ] **Step 7: Verify the report's numbers against the data files**

Run:

```powershell
bun -e "const {readFileSync}=require('fs');const d='docs/superpowers/measurements/2026-11-02-tier-simulation/data';const s=JSON.parse(readFileSync(d+'/stats.json','utf8'));const r=JSON.parse(readFileSync(d+'/reconcile.json','utf8'));const dec=JSON.parse(readFileSync(d+'/decision.json','utf8'));const heavy=s.groups.find(g=>g.groupBy==='tier'&&g.group==='heavy');console.log({heavyMean:heavy.metrics.cost_usd.mean,heavyP90:heavy.metrics.cost_usd.p90,deltaPct:r.deltaPct,monthly:dec.monthlyMean,band:dec.band})"
```

Expected: all five values appear verbatim in section 9 of `report.md`. Any mismatch means the report was hand-edited after the data changed — fix the report, not the data.

- [ ] **Step 8: Commit**

```
git add docs/superpowers/measurements/2026-11-02-tier-simulation
git commit -m "docs(measurement): report tier simulation results"
```

---

## Coverage of the ten required deliverables

| # | Deliverable | Task |
| --- | --- | --- |
| 1 | Baseline from all three local sources and the dashboard | 1 |
| 2 | Reproducible, non-mutating extraction harness | 2 |
| 3 | Session classification by `parent_id` and `agent` | 3 |
| 4 | Variant gap reconciled, precedence stated | 4 |
| 5 | Simulated day at real traffic counts | 7 |
| 6 | Per-tier and per-variant distributions, not means | 5, 8 |
| 7 | Billing cross-check with a percentage delta | 6, 9 |
| 8 | Tier spend versus main-session spend | 6, 10 |
| 9 | Prior decision rule applied | 9 |
| 10 | Written findings with limits | 10 |

## Self-review notes

- **Join key changed from the brief.** The brief proposed joining `timings.startedAt` to `session_v2.time_created`. `timings.childSessionID` equals `session_v2.id` directly for 97 of 106 rows, so identity, not time, is the join. Time bounds the window only. A `callID` join was also considered and is impossible: `session_part` is empty.
- **A third source exists.** `decisions.jsonl` carries `variant` and was not in the brief. It is used as a fallback only, because `childSessionID` is `null` in shadow mode.
- **Grain mismatch is the main arithmetic risk.** Duration lives per timing row, cost per session. Task 2 splits cost across calls and Task 2 Step 5 asserts the split sums to session truth.
- **Terra's price is already known to disagree with catalog math** by ~2.6×. Task 6 measures the multiplier rather than assuming either figure, and Task 9 applies it. Without this, the heavy projection would be understated by roughly 2.6×.
