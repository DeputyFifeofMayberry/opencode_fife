import { existsSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"

const dataDir = path.join(import.meta.dir, "data")
const readJson = (file: string) => JSON.parse(readFileSync(path.join(dataDir, file), "utf8"))

const stats = readJson("stats.json")
const reconcile = readJson("reconcile.json")
const identity = readJson("identity.json")
const cohort = readJson("cohort.json")
const runWindow = readJson("run-window.json")

const HEAVY_KEY = "heavy | vercel/openai/gpt-6.1-terra#xhigh"
const heavyGroup = stats.groups.find((g: any) => g.groupBy === "tierIdentity" && g.group === HEAVY_KEY)
if (!heavyGroup) throw new Error(`no heavy group for ${HEAVY_KEY}`)

const cost = heavyGroup.metrics.cost_usd
const heavyN = heavyGroup.n
const heavyMean = cost.mean
const heavyMedian = cost.median
const heavyP90 = cost.p90
const heavyCI95 = cost.meanCI95
const p90IsMax = heavyN < 10

const validationFactor = reconcile.validationStatus === "applied" ? reconcile.validationFactor : 1
const validationStatus = reconcile.validationStatus

const monthlyRaw = Number((heavyMean * 9 * 30).toFixed(4))
const monthlyMean = Number((heavyMean * validationFactor * 9 * 30).toFixed(4))
const monthlyP90 = Number((heavyP90 * validationFactor * 9 * 30).toFixed(4))
const monthlyCI95 =
  heavyCI95 === null
    ? null
    : [
        Number((heavyCI95[0] * validationFactor * 9 * 30).toFixed(4)),
        Number((heavyCI95[1] * validationFactor * 9 * 30).toFixed(4)),
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
const bandCertain = bandResult !== "inconclusive-band"

const scenarios = [3, 6, 9, 18].map((perDay) => ({
  perDay,
  atMean: Number((heavyMean * validationFactor * perDay * 30).toFixed(4)),
  atMedian: Number((heavyMedian * validationFactor * perDay * 30).toFixed(4)),
  atMax: Number((cost.max * validationFactor * perDay * 30).toFixed(4)),
}))

const fastMean = stats.groups.find((g: any) => g.groupBy === "tier" && g.group === "fast")?.metrics.cost_usd
const fastMonthly = fastMean ? Number((fastMean.mean * 45 * 30).toFixed(4)) : null

const decision = {
  heavyN,
  heavyKey: HEAVY_KEY,
  heavyMean: Number(heavyMean.toFixed(6)),
  heavyMedian: Number(heavyMedian.toFixed(6)),
  heavyP90: Number(heavyP90.toFixed(6)),
  heavyMax: Number(cost.max.toFixed(6)),
  heavyCI95,
  p90IsMax,
  validationFactor,
  validationStatus,
  monthlyRaw,
  monthlyMean,
  monthlyP90,
  monthlyCI95,
  band: bandResult,
  bandCertain,
  scenarios,
  fastMonthly,
  fastMonthlyBasis: "cohort fast tier mean x 45/day x 30",
  state: runWindow.state,
  scopeReduced: {
    planned: runWindow.planned,
    original: runWindow.plannedOriginal,
    approvedBy: runWindow.scopeApprovedBy,
  },
  fallbacks: identity.fallbacks.length,
  mixedSessions: identity.mixedSessions.length,
  cohortSize: cohort.checks.cohortSize,
  rationale: [
    `Heavy measured on ${heavyN} dispatches of ${HEAVY_KEY} at a mean of $${heavyMean.toFixed(6)} (median $${heavyMedian.toFixed(6)}).`,
    `Validation factor is ${validationFactor} because validationStatus is "${validationStatus}": no invoice was available, so the projection is the unadjusted local estimate.`,
    `p90 is ${p90IsMax ? "the maximum observation (n<10), not a 90th percentile" : "the 10th of 11 or higher"}.`,
    `Fast costs about $${fastMonthly}/month at 45/day, which the spec assumed was free.`,
    bandResult === "between-thresholds"
      ? "The band falls between the thresholds: Terra xhigh vs DeepSeek max is the operator's call; DeepSeek heavy cost is unmeasured."
      : `The band is ${bandResult} on the interval ${JSON.stringify(monthlyCI95)}, not on the point estimate.`,
    `Scope was reduced to 15/15/9 from 45/39/9 by explicit approval; heavy kept its n because it is the decision input.`,
  ],
  smallSample: {
    heavyN,
    p90IsOrderStatistic: p90IsMax,
    note: p90IsMax
      ? "With n<10 the p90 is the largest observation. The interval, not the point estimate, carries the band."
      : "p90 is an order statistic and remains unstable at this n.",
  },
}

writeFileSync(path.join(dataDir, "decision.json"), JSON.stringify(decision, null, 2))
console.log(JSON.stringify(decision, null, 2))
