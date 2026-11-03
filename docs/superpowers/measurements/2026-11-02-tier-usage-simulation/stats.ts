import { existsSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"

const dataDir = path.join(import.meta.dir, "data")
const readJsonlAbs = (file: string) =>
  readFileSync(file, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line))

const percentile = (sorted: number[], p: number) => {
  if (sorted.length === 0) return null
  return sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)]
}

// Deterministic LCG so reruns are byte-identical.
const lcg = (seed: number) => {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 4294967296
  }
}

const bootstrapCI = (values: number[], iterations: number): [number, number] | null => {
  if (values.length < 2) return null
  const random = lcg(42)
  const means: number[] = []
  for (let i = 0; i < iterations; i++) {
    let total = 0
    for (let j = 0; j < values.length; j++) total += values[Math.floor(random() * values.length)]
    means.push(total / values.length)
  }
  means.sort((a, b) => a - b)
  return [percentile(means, 0.025)!, percentile(means, 0.975)!]
}

const summarise = (values: number[]) => {
  const clean = values.filter((v) => typeof v === "number" && Number.isFinite(v))
  if (clean.length === 0) return null
  const sorted = [...clean].sort((a, b) => a - b)
  const total = sorted.reduce((a, v) => a + v, 0)
  return {
    n: sorted.length,
    total,
    mean: total / sorted.length,
    median: percentile(sorted, 0.5),
    p90: percentile(sorted, 0.9),
    min: sorted[0],
    max: sorted[sorted.length - 1],
    meanCI95: bootstrapCI(clean, 2000),
  }
}

const dispatches = readJsonlAbs(path.join(dataDir, "dispatches.jsonl")) as Array<any>

const cohortPath = path.join(dataDir, "cohort.json")
const cohort = existsSync(cohortPath) ? JSON.parse(readFileSync(cohortPath, "utf8")) : null
const cohortSize = cohort?.checks?.cohortSize ?? 0
const cohortSet = new Set<string>(cohort?.dispatchingSessionIDs ?? [])
const runWindowPath = path.join(dataDir, "run-window.json")
const runWindow = existsSync(runWindowPath) ? JSON.parse(readFileSync(runWindowPath, "utf8")) : null
if (cohort && cohortSize === 0 && runWindow?.state === "completed") {
  console.error("completed run with an empty cohort: refusing to fall back to all dispatches")
  process.exit(1)
}
const scoped = cohortSize > 0 ? dispatches.filter((d) => cohortSet.has(d.sessionID)) : dispatches

const excludedUnmatched = scoped.filter((d) => d.costUSD === null).length
const usable = scoped.filter((d) => d.costUSD !== null)

const zeroCost = usable
  .filter((d) => d.costUSD === 0)
  .map((d) => ({
    sessionID: d.sessionID,
    provider: d.provider,
    model: d.model,
    variant: d.variant,
    classification: /-free$|-free\//.test(String(d.model)) || String(d.model).includes("free")
      ? "verified_free"
      : "unresolved_zero",
  }))

const METRICS: Array<{ key: string; pick: (d: any) => number | null | undefined }> = [
  { key: "cost_usd", pick: (d) => d.costUSD },
  { key: "steps_per_dispatch", pick: (d) => d.steps },
  { key: "tokens_input", pick: (d) => d.tokens?.input },
  { key: "tokens_output", pick: (d) => d.tokens?.output },
  { key: "tokens_reasoning", pick: (d) => d.tokens?.reasoning },
  { key: "tokens_cache_read", pick: (d) => d.tokens?.cacheRead },
  { key: "tokens_cache_write", pick: (d) => d.tokens?.cacheWrite },
  { key: "duration_ms", pick: (d) => d.durationMs },
]

type Grouping = { groupBy: string; key: (d: any) => string }

const GROUPINGS: Grouping[] = [
  { groupBy: "tier", key: (d) => d.tier ?? "unknown" },
  { groupBy: "identity", key: (d) => `${d.provider}/${d.model}#${d.variant}` },
  { groupBy: "tierIdentity", key: (d) => `${d.tier} | ${d.provider}/${d.model}#${d.variant}` },
]

const groups: any[] = []
for (const grouping of GROUPINGS) {
  const buckets = new Map<string, any[]>()
  for (const d of usable) {
    const key = grouping.key(d)
    const list = buckets.get(key) ?? []
    list.push(d)
    buckets.set(key, list)
  }
  for (const [group, rows] of [...buckets.entries()].sort()) {
    const metrics: Record<string, any> = {}
    for (const metric of METRICS) {
      const values = rows.map((r) => metric.pick(r)) as Array<number | null | undefined>
      const stats = summarise(values as number[])
      if (stats) metrics[metric.key] = stats
    }
    groups.push({
      groupBy: grouping.groupBy,
      group,
      n: rows.length,
      costedN: rows.filter((r) => (r.costUSD ?? 0) > 0).length,
      metrics,
    })
  }
}

const result = {
  scope: cohortSize > 0 ? "cohort" : "all-dispatches (pre-run dry run)",
  cohortSize,
  excludedUnmatched,
  zeroCost,
  p90Method: "nearest-rank",
  p90Note: "nearest-rank: at n=9 the p90 equals the maximum observation, not the 90th percentile",
  groups,
}

writeFileSync(path.join(dataDir, "stats.json"), JSON.stringify(result, null, 2))

const fmt = (metric: string, value: number | null) => {
  if (value === null || value === undefined) return "-"
  if (metric === "cost_usd") return value.toFixed(6)
  if (metric === "duration_ms") return value.toFixed(1)
  return String(Math.round(value))
}

console.log(`scope: ${result.scope} (cohortSize ${cohortSize}), excludedUnmatched: ${excludedUnmatched}`)
for (const grouping of GROUPINGS) {
  const rows = groups.filter((g) => g.groupBy === grouping.groupBy)
  if (rows.length === 0) continue
  console.log(`\n### ${grouping.groupBy}`)
  console.log(
    "group | metric | n | costed_n | total | mean | median | p90 | min | max | ci95_low | ci95_high",
  )
  console.log("--- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---")
  for (const row of rows) {
    for (const metric of METRICS) {
      const s = row.metrics[metric.key]
      if (!s) continue
      console.log(
        [
          row.group,
          metric.key,
          s.n,
          row.costedN,
          fmt(metric.key, s.total),
          fmt(metric.key, s.mean),
          fmt(metric.key, s.median),
          fmt(metric.key, s.p90),
          fmt(metric.key, s.min),
          fmt(metric.key, s.max),
          fmt(metric.key, s.meanCI95?.[0] ?? null),
          fmt(metric.key, s.meanCI95?.[1] ?? null),
        ].join(" | "),
      )
    }
  }
}
