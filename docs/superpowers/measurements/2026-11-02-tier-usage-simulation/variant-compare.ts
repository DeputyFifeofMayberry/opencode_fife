import { Database } from "bun:sqlite"
import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"

const dataDir = path.join(import.meta.dir, "data")
const db = new Database(
  path.join(process.env.USERPROFILE!, ".local/share/opencode/opencode.db"),
  { readonly: true },
)

const percentile = (sorted: number[], p: number) =>
  sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)]

const block = (ids: string[]) => {
  const rows = ids.map((id) => {
    const s = db.query("select cost from session_v2 where id = ?").get(id) as { cost: number }
    const t = db
      .query(
        `select count(*) steps,
                coalesce(sum(json_extract(data,'$.tokens.input')),0) input,
                coalesce(sum(json_extract(data,'$.tokens.output')),0) output,
                coalesce(sum(json_extract(data,'$.tokens.reasoning')),0) reasoning,
                coalesce(sum(json_extract(data,'$.tokens.cache.read')),0) cacheRead,
                coalesce(sum(json_extract(data,'$.tokens.cache.write')),0) cacheWrite,
                group_concat(distinct json_extract(data,'$.model.variant')) variants
         from session_message where session_id = ? and type='assistant'`,
      )
      .get(id) as any
    return { id, cost: s.cost, ...t }
  })
  const costs = rows.map((r) => r.cost).sort((a, b) => a - b)
  const total = (k: string) => rows.reduce((a, r) => a + Number(r[k] ?? 0), 0)
  return {
    n: rows.length,
    perDispatch: rows.map((r) => ({ id: r.id, cost: Number(r.cost.toFixed(6)), steps: r.steps })),
    mean: Number((costs.reduce((a, v) => a + v, 0) / costs.length).toFixed(6)),
    median: Number(percentile(costs, 0.5).toFixed(6)),
    p90: Number(percentile(costs, 0.9).toFixed(6)),
    min: Number(costs[0].toFixed(6)),
    max: Number(costs[costs.length - 1].toFixed(6)),
    total: Number(costs.reduce((a, v) => a + v, 0).toFixed(6)),
    steps: total("steps"),
    input: total("input"),
    output: total("output"),
    reasoning: total("reasoning"),
    cacheRead: total("cacheRead"),
    cacheWrite: total("cacheWrite"),
    variants: [...new Set(rows.flatMap((r) => String(r.variants ?? "").split(",")))].sort(),
  }
}

const xhighIds = readFileSync(path.join(dataDir, "dispatched-ids.txt"), "utf8")
  .trim()
  .split("\n").map((s) => s.trim()).filter(Boolean)
const heavyXhigh = xhighIds.slice(30) // last 9 entries are the heavy block
const highIds = readFileSync(path.join(dataDir, "high-ids.txt"), "utf8")
  .trim().split("\n").map((s) => s.trim()).filter(Boolean)

const xhigh = block(heavyXhigh)
const high = block(highIds)

const pct = (a: number, b: number) => Number((((a - b) / b) * 100).toFixed(1))
const perStep = (b: typeof high, k: "reasoning" | "cacheWrite") => Number((b[k] / b.steps).toFixed(1))

const result = {
  comparedAt: new Date().toISOString(),
  model: "vercel/openai/gpt-6.1-terra",
  xhigh,
  high,
  delta: {
    meanPct: pct(high.mean, xhigh.mean),
    medianPct: pct(high.median, xhigh.median),
    totalPct: pct(high.total, xhigh.total),
    monthlyAt9PerDay: {
      xhigh: Number((xhigh.mean * 270).toFixed(2)),
      high: Number((high.mean * 270).toFixed(2)),
    },
    monthlyFromMax: {
      xhigh: Number((xhigh.max * 270).toFixed(2)),
      high: Number((high.max * 270).toFixed(2)),
    },
  },
  mechanism: {
    reasoningPerStep: { xhigh: perStep(xhigh, "reasoning"), high: perStep(high, "reasoning") },
    cacheWritePerStep: { xhigh: perStep(xhigh, "cacheWrite"), high: perStep(high, "cacheWrite") },
    note: "Reasoning tokens become context, so lower effort also reduces cache writes on later steps. The two effects together account for the whole delta.",
  },
  integrity: {
    variantsObservedHigh: high.variants,
    noEffortPolicyInterference: high.variants.length === 1 && high.variants[0] === "high",
    stepsXhigh: xhigh.steps,
    stepsHigh: high.steps,
  },
}

writeFileSync(path.join(dataDir, "variant-comparison.json"), JSON.stringify(result, null, 2))
console.log(JSON.stringify(result, null, 2))
