import { existsSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"

const dataDir = path.join(import.meta.dir, "data")
const readJsonlAbs = (file: string) =>
  readFileSync(file, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line))

const TIER_AGENTS = new Set(["fast", "medium", "heavy"])

const dispatches = readJsonlAbs(path.join(dataDir, "dispatches.jsonl")) as Array<any>
const sessions = readJsonlAbs(path.join(dataDir, "sessions.jsonl")) as Array<any>

const runWindowPath = path.join(dataDir, "run-window.json")
const runWindow = existsSync(runWindowPath) ? JSON.parse(readFileSync(runWindowPath, "utf8")) : null

const logPath = path.join(dataDir, "07-run-log.md")
const logged: string[] = []
let logState = "absent"
if (existsSync(logPath)) {
  const lines = readFileSync(logPath, "utf8")
    .trim()
    .split("\n")
    .filter((line) => /^\d+\s*\|/.test(line))
  for (const line of lines) {
    const id = line.split("|")[3]?.trim()
    if (id) logged.push(id)
  }
  logState = logged.length > 0 ? "present" : "present-empty"
}
const cohortSet = new Set(logged)

const inCohort = dispatches.filter((d) => cohortSet.has(d.sessionID))

const byTier: Record<string, { n: number; costUSD: number; steps: number }> = {}
for (const d of inCohort) {
  const tier = d.tier ?? "unknown"
  const row = byTier[tier] ?? { n: 0, costUSD: 0, steps: 0 }
  row.n += 1
  row.costUSD += d.costUSD ?? 0
  row.steps += d.steps ?? 0
  byTier[tier] = row
}
for (const row of Object.values(byTier)) row.costUSD = Number(row.costUSD.toFixed(6))

const nonTierChildren = sessions.filter(
  (s) => s.sessionClass === "child" && !TIER_AGENTS.has(s.agent ?? ""),
)
const topLevel = sessions.filter((s) => s.sessionClass === "top")
const cohortSessions = sessions.filter((s) => cohortSet.has(s.id))

const report = {
  logState,
  runWindow,
  dispatchingSessionIDs: [...cohortSet],
  byTier,
  nonTierChildren: {
    n: nonTierChildren.length,
    cost: Number(nonTierChildren.reduce((a, s) => a + s.cost, 0).toFixed(6)),
    agents: [...new Set(nonTierChildren.map((s) => s.agent))].sort(),
  },
  topLevel: {
    n: topLevel.length,
    cost: Number(topLevel.reduce((a, s) => a + s.cost, 0).toFixed(6)),
    createdAfterRunStart: runWindow?.runStartMs
      ? topLevel.filter((s) => s.timeCreated >= runWindow.runStartMs).length
      : null,
  },
  totals: {
    sessionCount: sessions.length,
    sessionCost: Number(sessions.reduce((a, s) => a + s.cost, 0).toFixed(6)),
  },
  checks: {
    cohortSize: cohortSet.size,
    dispatchRowsForCohort: inCohort.length,
    cohortWithoutDispatchRow: [...cohortSet].filter(
      (id) => !dispatches.some((d) => d.sessionID === id),
    ).length,
    dispatchRowsOutsideCohort: dispatches.length - inCohort.length,
    projectIDs: [...new Set(cohortSessions.map((s) => s.projectID))],
  },
}

writeFileSync(path.join(dataDir, "cohort.json"), JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
if (logState === "absent") console.error("no run log; cohort empty")
