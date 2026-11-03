import { existsSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { verdictFor } from "./lib/verdict"

const dataDir = path.join(import.meta.dir, "data")
const readJson = (file: string) => JSON.parse(readFileSync(path.join(dataDir, file), "utf8"))
const readJsonlAbs = (file: string) =>
  readFileSync(file, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line))

const TERRA = { input: 1.0, output: 5.0, read: 0.05, write: 1.25 }

const steps = readJsonlAbs(path.join(dataDir, "steps.jsonl")) as Array<any>
const dispatches = readJsonlAbs(path.join(dataDir, "dispatches.jsonl")) as Array<any>
const cohort = readJson("cohort.json")
const cohortSet = new Set<string>(cohort.dispatchingSessionIDs ?? [])

// --- rate derivation -------------------------------------------------------
const solve4 = (A: number[][], b: number[]) => {
  // Gaussian elimination with partial pivoting; returns null if singular.
  const n = 4
  const M = A.map((row, i) => [...row, b[i]])
  let rank = 0
  for (let col = 0; col < n; col++) {
    let pivot = -1
    for (let row = rank; row < M.length; row++) {
      if (Math.abs(M[row][col]) > 1e-9) {
        pivot = row
        break
      }
    }
    if (pivot === -1) continue
    ;[M[rank], M[pivot]] = [M[pivot], M[rank]]
    const scale = M[rank][col]
    for (let c = col; c <= n; c++) M[rank][c] /= scale
    for (let row = 0; row < M.length; row++) {
      if (row === rank) continue
      const factor = M[row][col]
      if (Math.abs(factor) < 1e-12) continue
      for (let c = col; c <= n; c++) M[row][c] -= factor * M[rank][c]
    }
    rank += 1
  }
  if (rank < n) return { rank, solution: null as number[] | null }
  const solution = new Array(n).fill(0)
  for (let row = 0; row < n; row++) {
    const col = M[row].slice(0, n).findIndex((v) => Math.abs(v - 1) < 1e-9)
    solution[col] = M[row][n]
  }
  return { rank, solution }
}

const derivedRates: Record<string, any> = {}
const identities = [...new Set(steps.map((s) => `${s.provider}/${s.model}#${s.variant}`))]
for (const identity of identities) {
  const rows = steps.filter((s) => `${s.provider}/${s.model}#${s.variant}` === identity)
  const equations = rows.filter((r) => r.costUSD > 0)
  if (equations.length === 0) continue
  const A = equations.map((r) => [
    r.tokens.input / 1e6,
    (r.tokens.output + r.tokens.reasoning) / 1e6,
    r.tokens.cacheRead / 1e6,
    r.tokens.cacheWrite / 1e6,
  ])
  const b = equations.map((r) => r.costUSD)
  const { rank, solution } = solve4(A, b)

  if (solution) {
    const predicted = A.reduce(
      (a, row, i) =>
        a + row[0] * solution[0] + row[1] * solution[1] + row[2] * solution[2] + row[3] * solution[3],
      0,
    )
    const actual = b.reduce((a, v) => a + v, 0)
    const perStep = A.map(
      (row, i) =>
        row[0] * solution[0] + row[1] * solution[1] + row[2] * solution[2] + row[3] * solution[3] - b[i],
    )
    const absStep = perStep.map(Math.abs)
    derivedRates[identity] = {
      status: "solved",
      rank,
      equations: equations.length,
      rates: {
        input: solution[0],
        output: solution[1],
        cacheRead: solution[2],
        cacheWrite: solution[3],
      },
      residual: Math.abs(predicted - actual),
      // Aggregate residual can cancel opposing per-step errors; report the worst step too.
      maxStepResidual: Number(Math.max(...absStep).toFixed(9)),
      maxStepRelativeResidual: Number(
        Math.max(...absStep.map((e, i) => (b[i] > 0 ? e / b[i] : 0))).toFixed(6),
      ),
    }
    continue
  }

  // Scale-only is meaningful only inside the terra family, where the assumed rates are
  // the verified ones. For any other identity a rank-deficient fit is simply unresolved;
  // publishing a scale against terra's rates would be a fabricated number.
  const terraFamily = identity.includes("gpt-6.1-terra")
  if (!terraFamily) {
    derivedRates[identity] = {
      status: "underdetermined",
      rank,
      equations: equations.length,
      note: "rank-deficient and not in the terra family; no rate is reported",
    }
    continue
  }

  const catalog = equations.reduce(
    (a, r) =>
      a +
      (r.tokens.input * TERRA.input +
        (r.tokens.output + r.tokens.reasoning) * TERRA.output +
        r.tokens.cacheRead * TERRA.read +
        r.tokens.cacheWrite * TERRA.write) /
        1e6,
    0,
  )
  const actual = b.reduce((a, v) => a + v, 0)
  derivedRates[identity] = {
    status: catalog > 0 ? "scale-only" : "underdetermined",
    rank,
    equations: equations.length,
    scale: catalog > 0 ? actual / catalog : null,
    assumedTerraRates: TERRA,
  }
}

// --- billing reconciliation -------------------------------------------------
const hasStart = existsSync(path.join(dataDir, "00-sessions.json"))
const hasEnd = existsSync(path.join(dataDir, "99-sessions.json"))
if (!hasStart && hasEnd) {
  console.error("99-sessions.json present but 00-sessions.json missing: half a snapshot pair")
  process.exit(1)
}

const billingStart = readJson("00-billing-baseline.json")
const billingEndPath = path.join(dataDir, "99-billing-final.json")
const billingEnd = existsSync(billingEndPath) ? JSON.parse(readFileSync(billingEndPath, "utf8")) : null

const localUSD =
  hasStart && hasEnd
    ? (() => {
        const start = readJson("00-sessions.json") as Record<string, number>
        const end = readJson("99-sessions.json") as Record<string, number>
        let total = 0
        for (const [id, cost] of Object.entries(end)) total += cost - (start[id] ?? 0)
        return Number(total.toFixed(6))
      })()
    : null

const billedUSD =
  billingEnd && typeof billingEnd.billedToDateUSD === "number" && typeof billingStart.billedToDateUSD === "number"
    ? Number((billingEnd.billedToDateUSD - billingStart.billedToDateUSD).toFixed(6))
    : null

const deltaUSD = localUSD !== null && billedUSD !== null ? Number((localUSD - billedUSD).toFixed(6)) : null
const deltaPct = deltaUSD !== null && billedUSD ? Number(((deltaUSD / billedUSD) * 100).toFixed(2)) : null

const verdict = verdictFor(deltaPct, billedUSD)

// --- validation factor ------------------------------------------------------
const heavyInWindow = dispatches.filter((d) => d.tier === "heavy" && d.costUSD !== null)
const localHeavy = Number(
  heavyInWindow.filter((d) => cohortSet.has(d.sessionID)).reduce((a, d) => a + d.costUSD, 0).toFixed(6),
)
const heavyOutsideCohort = heavyInWindow.filter((d) => !cohortSet.has(d.sessionID)).length
const localNonHeavy = localUSD !== null ? Number((localUSD - localHeavy).toFixed(6)) : null

let validationStatus = "not-needed"
let validationFactor = 1
if (verdict === "local-overstates" || verdict === "local-understates") {
  if (heavyOutsideCohort > 0) {
    validationStatus = "invalid"
  } else if (localHeavy <= 0 || localNonHeavy === null) {
    validationStatus = "inconclusive"
  } else {
    const factor = (billedUSD! - localNonHeavy) / localHeavy
    if (factor <= 0 || factor > 5) validationStatus = "invalid"
    else {
      validationFactor = Number(factor.toFixed(6))
      validationStatus = "applied"
    }
  }
}

// --- split ------------------------------------------------------------------
const sessions = readJsonlAbs(path.join(dataDir, "sessions.jsonl")) as Array<any>
const cohortSessions = sessions.filter((s: any) => cohortSet.has(s.id))
const nonTierChildren = sessions.filter(
  (s: any) => s.sessionClass === "child" && !["fast", "medium", "heavy"].includes(s.agent ?? ""),
)
const topLevel = sessions.filter((s: any) => s.sessionClass === "top")

const runWindowPath = path.join(dataDir, "run-window.json")
const runWindow = existsSync(runWindowPath) ? JSON.parse(readFileSync(runWindowPath, "utf8")) : null

const statsPath = path.join(dataDir, "stats.json")
const stats = existsSync(statsPath) ? JSON.parse(readFileSync(statsPath, "utf8")) : null
const fastGroup =
  stats?.groups?.find(
    (g: any) => g.groupBy === "identity" && g.group === "vercel/minimax/minimax-m3.1-flash#medium",
  ) ?? null
const fastTierGroup = stats?.groups?.find((g: any) => g.groupBy === "tier" && g.group === "fast") ?? null

const cohortUSD = Number(cohortSessions.reduce((a: number, s: any) => a + s.cost, 0).toFixed(6))
const totalUSD = Number(sessions.reduce((a: number, s: any) => a + s.cost, 0).toFixed(6))

const report = {
  window: runWindow,
  localUSD,
  billedUSD,
  deltaUSD,
  deltaPct,
  verdict,
  derivedRates,
  localHeavy,
  localNonHeavy,
  heavyOutsideCohort,
  validationFactor,
  validationStatus,
  split: {
    cohortUSD,
    nonTierChildUSD: Number(nonTierChildren.reduce((a: number, s: any) => a + s.cost, 0).toFixed(6)),
    topLevelUSD: Number(topLevel.reduce((a: number, s: any) => a + s.cost, 0).toFixed(6)),
    topLevelCreatedAfterRunStart: runWindow
      ? topLevel.filter((s: any) => s.timeCreated >= runWindow.runStartMs).length
      : null,
    totalUSD,
    tierShare: totalUSD > 0 ? Number((cohortUSD / totalUSD).toFixed(4)) : null,
  },
  fastMonthly:
    fastGroup && fastGroup.metrics?.cost_usd?.mean != null
      ? Number((fastGroup.metrics.cost_usd.mean * 45 * 30).toFixed(4))
      : null,
  fastMonthlyStatus: fastGroup ? "measured" : "pending-run",
  allFastMeanMonthly:
    fastTierGroup && fastTierGroup.metrics?.cost_usd?.mean != null
      ? Number((fastTierGroup.metrics.cost_usd.mean * 45 * 30).toFixed(4))
      : null,
  fastMeanBasis: "intended identity vercel/minimax/minimax-m3.1-flash#medium",
}

writeFileSync(path.join(dataDir, "reconcile.json"), JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
