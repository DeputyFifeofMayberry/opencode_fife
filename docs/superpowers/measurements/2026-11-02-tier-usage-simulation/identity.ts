import { readFileSync, writeFileSync, existsSync } from "node:fs"
import path from "node:path"

const dataDir = path.join(import.meta.dir, "data")
const readJsonlAbs = (file: string) =>
  readFileSync(file, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line))

const INTENDED: Record<string, string> = {
  fast: "vercel/minimax/minimax-m3.1-flash#medium",
  medium: "vercel/deepseek/deepseek-v4.1-flash-1017#max",
  heavy: "vercel/openai/gpt-6.1-terra#xhigh",
}

const steps = readJsonlAbs(path.join(dataDir, "steps.jsonl")) as Array<any>
const dispatches = readJsonlAbs(path.join(dataDir, "dispatches.jsonl")) as Array<any>

const cohortPath = path.join(dataDir, "cohort.json")
const cohort = existsSync(cohortPath) ? JSON.parse(readFileSync(cohortPath, "utf8")) : null
const cohortSet = new Set<string>(cohort?.dispatchingSessionIDs ?? [])

const identityOf = (s: { provider: string; model: string; variant: string }) =>
  `${s.provider}/${s.model}#${s.variant}`

// byKey is descriptive over every step; byTierKey is statistical over the cohort only.
const byKey: Record<string, { steps: number; costUSD: number }> = {}
for (const step of steps) {
  const key = identityOf(step)
  const row = byKey[key] ?? { steps: 0, costUSD: 0 }
  row.steps += 1
  row.costUSD += step.costUSD
  byKey[key] = row
}
for (const row of Object.values(byKey)) row.costUSD = Number(row.costUSD.toFixed(6))

const cohortDispatches = dispatches.filter((d) => cohortSet.has(d.sessionID))

const byTierKey: Record<string, { n: number; costUSD: number; steps: number }> = {}
for (const d of cohortDispatches) {
  const key = `${d.tier} | ${identityOf(d)}`
  const row = byTierKey[key] ?? { n: 0, costUSD: 0, steps: 0 }
  row.n += 1
  row.costUSD += d.costUSD ?? 0
  row.steps += d.steps ?? 0
  byTierKey[key] = row
}
for (const row of Object.values(byTierKey)) row.costUSD = Number(row.costUSD.toFixed(6))

const stepsBySession = new Map<string, Array<any>>()
for (const step of steps) {
  const list = stepsBySession.get(step.sessionID) ?? []
  list.push(step)
  stepsBySession.set(step.sessionID, list)
}

const mixedSessions = cohortDispatches
  .filter((d) => (d.modelMix?.length ?? 0) > 1)
  .map((d) => {
    const split: Record<string, number> = {}
    for (const step of stepsBySession.get(d.sessionID) ?? []) {
      const key = identityOf(step)
      split[key] = Number(((split[key] ?? 0) + step.costUSD).toFixed(6))
    }
    return { sessionID: d.sessionID, tier: d.tier, modelMix: d.modelMix, split }
  })

const fallbacks = cohortDispatches
  .filter((d) => (d.modelMix?.length ?? 0) === 1 && identityOf(d) !== INTENDED[d.tier])
  .map((d) => ({ sessionID: d.sessionID, tier: d.tier, actual: identityOf(d), intended: INTENDED[d.tier] }))

const provenance: Record<string, { steps: number; costUSD: number }> = {}
for (const step of steps) {
  const row = provenance[step.provenance] ?? { steps: 0, costUSD: 0 }
  row.steps += 1
  row.costUSD += step.costUSD
  provenance[step.provenance] = row
}
for (const row of Object.values(provenance)) row.costUSD = Number(row.costUSD.toFixed(6))

const report = {
  intended: INTENDED,
  byKey,
  byTierKey,
  mixedSessions,
  fallbacks,
  provenance,
  cohortSize: cohortSet.size,
}

writeFileSync(path.join(dataDir, "identity.json"), JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
