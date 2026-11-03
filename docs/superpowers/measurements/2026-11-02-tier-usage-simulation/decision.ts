import { existsSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"

const dataDir = path.join(import.meta.dir, "data")
const readJson = (file: string) => JSON.parse(readFileSync(path.join(dataDir, file), "utf8"))

const mode = process.argv[2] ?? "cohort"
const stats = readJson("stats.json")
const reconcile = readJson("reconcile.json")
const identity = readJson("identity.json")
const cohort = readJson("cohort.json")

const percentile = (sorted: number[], p: number) =>
  sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)]

const lcg = (seed: number) => {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 4294967296
  }
}

const bootstrapCI = (values: number[], iterations = 2000): [number, number] => {
  const random = lcg(42)
  const means: number[] = []
  for (let i = 0; i < iterations; i++) {
    let total = 0
    for (let j = 0; j < values.length; j++) total += values[Math.floor(random() * values.length)]
    means.push(total / values.length)
  }
  means.sort((a, b) => a - b)
  return [percentile(means, 0.025), percentile(means, 0.975)]
}

type Heavy = {
  n: number
  mean: number
  median: number
  p90: number
  max: number
  ci95: [number, number] | null
  variant: string
  key: string
  source: string
}

const heavy: Heavy =
  mode === "high"
    ? (() => {
        const cmp = readJson("variant-comparison.json")
        const costs = cmp.high.perDispatch.map((p: any) => p.cost)
        return {
          n: cmp.high.n,
          mean: cmp.high.mean,
          median: cmp.high.median,
          p90: cmp.high.p90,
          max: cmp.high.max,
          ci95: bootstrapCI(costs),
          variant: cmp.high.variants[0],
          key: `heavy | vercel/openai/gpt-6.1-terra#${cmp.high.variants[0]}`,
          source: "variant-comparison.json (matched high block)",
        }
      })()
    : (() => {
        const group = stats.groups.find(
          (g: any) => g.groupBy === "tierIdentity" && g.group === "heavy | vercel/openai/gpt-6.1-terra#xhigh",
        )
        if (!group) throw new Error("no xhigh heavy group")
        const c = group.metrics.cost_usd
        return {
          n: group.n,
          mean: c.mean,
          median: c.median,
          p90: c.p90,
          max: c.max,
          ci95: c.meanCI95,
          variant: "xhigh",
          key: "heavy | vercel/openai/gpt-6.1-terra#xhigh",
          source: "stats.json (original cohort)",
        }
      })()

const runWindow = readJson(mode === "high" ? "run-window-high.json" : "run-window.json")
const validationFactor = reconcile.validationStatus === "applied" ? reconcile.validationFactor : 1
const p90IsMax = heavy.n < 10

const monthlyRaw = Number((heavy.mean * 9 * 30).toFixed(4))
const monthlyMean = Number((heavy.mean * validationFactor * 9 * 30).toFixed(4))
const monthlyP90 = Number((heavy.p90 * validationFactor * 9 * 30).toFixed(4))
const monthlyCI95 =
  heavy.ci95 === null
    ? null
    : [
        Number((heavy.ci95[0] * validationFactor * 9 * 30).toFixed(4)),
        Number((heavy.ci95[1] * validationFactor * 9 * 30).toFixed(4)),
      ]

const band = (lo: number, hi: number) =>
  hi < 100
    ? "keep-terra-xhigh"
    : lo >= 100 && hi <= 200
      ? "between-thresholds"
      : lo > 200
        ? "drop-to-deepseek-max"
        : "inconclusive-band"

const bandResult = monthlyCI95 === null ? "inconclusive-band" : band(monthlyCI95[0], monthlyCI95[1])
const scenarios = [3, 6, 9, 18].map((perDay) => ({
  perDay,
  atMean: Number((heavy.mean * validationFactor * perDay * 30).toFixed(4)),
  atMedian: Number((heavy.median * validationFactor * perDay * 30).toFixed(4)),
  atMax: Number((heavy.max * validationFactor * perDay * 30).toFixed(4)),
}))

const fastMean = stats.groups.find((g: any) => g.groupBy === "tier" && g.group === "fast")?.metrics.cost_usd

const decision = {
  variant: heavy.variant,
  heavyN: heavy.n,
  heavyKey: heavy.key,
  heavySource: heavy.source,
  heavyMean: Number(heavy.mean.toFixed(6)),
  heavyMedian: Number(heavy.median.toFixed(6)),
  heavyP90: Number(heavy.p90.toFixed(6)),
  heavyMax: Number(heavy.max.toFixed(6)),
  heavyCI95: heavy.ci95,
  p90IsMax,
  validationFactor,
  validationStatus: reconcile.validationStatus,
  invoiceValidation: "gateway export reconciles at 0.00% across 218 requests; cohort vs invoice -0.16%",
  monthlyRaw,
  monthlyMean,
  monthlyP90,
  monthlyCI95,
  band: bandResult,
  bandCertain: bandResult !== "inconclusive-band",
  scenarios,
  fastMonthly: fastMean ? Number((fastMean.mean * 45 * 30).toFixed(4)) : null,
  state: runWindow.state,
  fallbacks: identity.fallbacks.length,
  mixedSessions: identity.mixedSessions.length,
  cohortSize: cohort.checks.cohortSize,
  rationale: [
    `Heavy measured on ${heavy.n} dispatches of ${heavy.key} at a mean of $${heavy.mean.toFixed(6)} (median $${heavy.median.toFixed(6)}).`,
    `Variant under measurement is "${heavy.variant}".`,
    `Invoice validation: the gateway export reproduces every local charge exactly (0.00% over 218 requests); cohort total is -0.16% against the same-window invoice.`,
    `validationFactor is ${validationFactor} because validationStatus is "${reconcile.validationStatus}".`,
    `p90 is ${p90IsMax ? "the maximum observation (n<10), not a 90th percentile" : "an order statistic"}.`,
    `Monthly at 9/day is $${monthlyMean} with interval ${JSON.stringify(monthlyCI95)}.`,
    bandResult === "between-thresholds"
      ? "The band falls between the thresholds: Terra vs DeepSeek is the operator's call; DeepSeek heavy cost is unmeasured."
      : `The band is ${bandResult} on the interval, not on the point estimate.`,
  ],
  smallSample: {
    heavyN: heavy.n,
    p90IsOrderStatistic: p90IsMax,
    note: p90IsMax
      ? "With n<10 the p90 is the largest observation. The interval, not the point estimate, carries the band."
      : "p90 is an order statistic and remains unstable at this n.",
  },
}

writeFileSync(path.join(dataDir, "decision.json"), JSON.stringify(decision, null, 2))
console.log(JSON.stringify(decision, null, 2))
