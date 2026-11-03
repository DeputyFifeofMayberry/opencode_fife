import { Database } from "bun:sqlite"
import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"

const TIER_AGENTS = new Set(["fast", "medium", "heavy"])
const dataDir = path.join(import.meta.dir, "data")

const [fromArg, toArg] = process.argv.slice(2)
if (!fromArg || !toArg) throw new Error("usage: bun run extract.ts <fromEpochMs> <toEpochMs>")
const from = Number(fromArg)
const to = Number(toArg)

const opencodeDir = path.join(process.env.USERPROFILE!, ".local/share/opencode")
const db = new Database(path.join(opencodeDir, "opencode.db"), { readonly: true })
const readJsonl = (file: string) =>
  readFileSync(path.join(opencodeDir, "model-router", file), "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line))

// Step grain is the source of truth for model, variant, cost and tokens.
const stepRows = db
  .query(
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
  )
  .all(from, to) as Array<Record<string, any>>

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
      input: row.tIn ?? 0,
      output: row.tOut ?? 0,
      reasoning: row.tReason ?? 0,
      cacheRead: row.tRead ?? 0,
      cacheWrite: row.tWrite ?? 0,
    },
  }
})

const sessionRows = db
  .query(
    `select id, parent_id, agent, cost, tokens_input, tokens_output, tokens_reasoning,
            tokens_cache_read, tokens_cache_write, time_created, time_updated, idle_outcome, project_id
     from session_v2 where time_created between ? and ? order by time_created`,
  )
  .all(from, to) as Array<Record<string, any>>

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

const zero = { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0 }

const dispatched: any[] = []
for (const [sessionID, calls] of timingGroups) {
  const session = sessionByID.get(sessionID)
  const first = calls[0]
  if (!session) {
    dispatched.push({
      sessionID,
      parentSessionID: first.parentSessionID,
      tier: first.tier,
      tierSource: "timings",
      agent: "unknown",
      provider: "unknown",
      model: "unknown",
      variant: "unknown",
      modelMix: [],
      costUSD: null,
      steps: 0,
      tokens: null,
      durationMs: first.durationMs,
      outcome: first.outcome,
      joinStatus: "unmatched",
      nCalls: calls.length,
      sessionCostTotal: null,
    })
    continue
  }
  const own = stepsBySession.get(sessionID) ?? []
  const identities = [...new Set(own.map((s) => `${s.provider}/${s.model}#${s.variant}`))]
  const last = own.at(-1)
  const agentIsTier = TIER_AGENTS.has(session.agent)
  // A session that changed model mid-run has no single identity. Label it "mixed" so it can
  // never be folded into a real model's mean; modelMix still carries the detail.
  const mixed = identities.length > 1
  dispatched.push({
    sessionID,
    parentSessionID: first.parentSessionID,
    tier: first.tier !== "unknown" ? first.tier : agentIsTier ? session.agent : "unknown",
    tierSource: first.tier !== "unknown" ? "timings" : agentIsTier ? "session_agent" : "unknown",
    agent: session.agent,
    provider: mixed ? "mixed" : (last?.provider ?? "unknown"),
    model: mixed ? "mixed" : (last?.model ?? "unknown"),
    variant: mixed ? "mixed" : (last?.variant ?? "unspecified"),
    modelMix: identities,
    costUSD: session.cost,
    steps: own.length,
    tokens: own.reduce(
      (acc, s) => ({
        input: acc.input + s.tokens.input,
        output: acc.output + s.tokens.output,
        reasoning: acc.reasoning + s.tokens.reasoning,
        cacheRead: acc.cacheRead + s.tokens.cacheRead,
        cacheWrite: acc.cacheWrite + s.tokens.cacheWrite,
      }),
      { ...zero },
    ),
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
    sessionID: row.id,
    parentSessionID: row.parent_id,
    tier: row.agent,
    tierSource: "session_agent",
    agent: row.agent,
    provider: last?.provider ?? "unknown",
    model: last?.model ?? "unknown",
    variant: last?.variant ?? "unspecified",
    modelMix: [...new Set(own.map((s) => `${s.provider}/${s.model}#${s.variant}`))],
    costUSD: row.cost,
    steps: own.length,
    tokens: null,
    durationMs: null,
    outcome: row.idle_outcome,
    joinStatus: "untimed",
    nCalls: 0,
    sessionCostTotal: row.cost,
  })
}

const sessions = sessionRows.map((row) => {
  const own = stepsBySession.get(row.id) ?? []
  return {
    id: row.id,
    parentID: row.parent_id,
    sessionClass: row.parent_id === null ? "top" : "child",
    agent: row.agent,
    cost: row.cost,
    stepCost: own.reduce((a, s) => a + s.costUSD, 0),
    steps: own.length,
    timeCreated: row.time_created,
    projectID: row.project_id,
  }
})

const count = (status: string) => dispatched.filter((d) => d.joinStatus === status).length
const report = {
  window: { from, to },
  timingsRows: timings.length,
  uniqueChildSessions: timingGroups.size,
  exact: count("exact"),
  split: count("split"),
  untimed: count("untimed"),
  unmatched: count("unmatched"),
  tierUnknown: dispatched.filter((d) => d.tier === "unknown").length,
  modelMixSessions: dispatched.filter((d) => d.modelMix.length > 1).length,
  costDeltaSessions: sessions.filter((s) => Math.abs(s.cost - s.stepCost) > 0.000001).length,
}

writeFileSync(path.join(dataDir, "steps.jsonl"), steps.map((s) => JSON.stringify(s)).join("\n") + "\n")
writeFileSync(
  path.join(dataDir, "dispatches.jsonl"),
  dispatched.map((d) => JSON.stringify(d)).join("\n") + "\n",
)
writeFileSync(
  path.join(dataDir, "sessions.jsonl"),
  sessions.map((s) => JSON.stringify(s)).join("\n") + "\n",
)
writeFileSync(path.join(dataDir, "join-report.json"), JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
