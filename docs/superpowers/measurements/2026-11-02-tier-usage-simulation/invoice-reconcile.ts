import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"

const dataDir = path.join(import.meta.dir, "data")
const gateway = JSON.parse(
  readFileSync(path.join(dataDir, "gateway-inference-requests.json"), "utf8"),
) as Array<Record<string, any>>
const window = JSON.parse(readFileSync(path.join(dataDir, "run-window.json"), "utf8"))
const reconcile = JSON.parse(readFileSync(path.join(dataDir, "reconcile.json"), "utf8"))

const asStamp = (ms: number) => new Date(ms).toISOString().replace("T", " ").slice(0, 19)
const from = asStamp(window.runStartMs)
const to = asStamp(window.runEndMs)

const inWindow = gateway.filter((r) => String(r.time) >= from && String(r.time) <= to)
const sumCost = (rows: Array<Record<string, any>>) =>
  Number(rows.reduce((a, r) => a + Number(r.totalCost ?? 0), 0).toFixed(6))

const RATES: Record<string, { in: number; out: number; read: number; write: number }> = {
  "openai/gpt-6.1-terra": { in: 1.0, out: 5.0, read: 0.05, write: 1.25 },
  "openai/gpt-6.1-terra-fast": { in: 2.0, out: 10.0, read: 0.1, write: 2.5 },
  "deepseek/deepseek-v4.1-flash-1017": { in: 0.3, out: 1.2, read: 0.007, write: 0.3 },
  "minimax/minimax-m3.1-flash": { in: 0.15, out: 0.6, read: 0.015, write: 0.15 },
  "reflection/beam": { in: 0, out: 0, read: 0, write: 0 },
}

const reconstruct = (rows: Array<Record<string, any>>) =>
  Number(
    rows
      .reduce((a, r) => {
        const p = RATES[String(r.model)]
        if (!p) return a
        const v =
          (Number(r.inputTokens ?? 0) * p.in +
            (Number(r.outputTokens ?? 0) + Number(r.reasoningTokens ?? 0)) * p.out +
            Number(r.cacheReadTokens ?? 0) * p.read +
            Number(r.cacheWriteTokens ?? 0) * p.write) /
          1e6
        return a + v
      }, 0)
      .toFixed(6),
  )

const allBilled = sumCost(gateway)
const allLocal = reconstruct(gateway)
const winBilled = sumCost(inWindow)
const winLocal = reconstruct(inWindow)
const cohortUSD = reconcile.split?.cohortUSD ?? null
const nonGatewayUSD =
  cohortUSD !== null && reconcile.localUSD !== null
    ? Number((reconcile.localUSD - cohortUSD).toFixed(6))
    : null

const pctOf = (a: number | null, b: number | null) =>
  a === null || b === null || b === 0 ? null : Number((((a - b) / b) * 100).toFixed(2))

const result = {
  source: "data/gateway-inference-requests.json",
  requests: gateway.length,
  window: { from, to, requests: inWindow.length },
  rateValidation: {
    scope: "all 218 requests",
    billed: allBilled,
    reconstructedFromLocalRates: allLocal,
    deltaUSD: Number((allBilled - allLocal).toFixed(6)),
    deltaPct: pctOf(allBilled, allLocal),
  },
  cohortComparison: {
    billedInWindow: winBilled,
    cohortLocalUSD: cohortUSD,
    deltaUSD: cohortUSD === null ? null : Number((winBilled - cohortUSD).toFixed(6)),
    deltaPct: pctOf(winBilled, cohortUSD),
    note: "The gateway invoice covers Vercel-routed requests, which are the tier dispatches. The cohort is the right comparator.",
  },
  allSessionComparison: {
    billedInWindow: winBilled,
    localPeriodDelta: reconcile.localUSD,
    deltaUSD: cohortUSD === null ? null : Number((winBilled - reconcile.localUSD).toFixed(6)),
    deltaPct: pctOf(winBilled, reconcile.localUSD),
    nonGatewaySpendUSD: nonGatewayUSD,
    note: "The all-session period delta includes direct-provider traffic (the orchestrating session runs on deepseek-flash, not on the gateway), so it must exceed the Vercel invoice. The gap is expected, not an error.",
  },
  localReconstructionInWindow: winLocal,
}

writeFileSync(path.join(dataDir, "invoice-reconcile.json"), JSON.stringify(result, null, 2))
console.log(JSON.stringify(result, null, 2))
