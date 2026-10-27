export * as EffortBenchmark from "./benchmark.js"

import { createHash } from "node:crypto"
import { Schema } from "effect"
import { PositiveInt } from "@opencode/schema/schema"
import { Model } from "@opencode/schema/model"
import type { Session } from "@opencode/schema/session"
import { EffortAdapter } from "./adapter.js"
import { resolveLevelEffort } from "./policy/levels.js"
import type { EffortLevel } from "./policy/types.js"
import { SessionUsageReport } from "../session/usage-report.js"

const Policies = ["efficiency", "balanced", "quality"] as const
export type Policy = (typeof Policies)[number]

/** The static E/B/Q mapping to the existing base levels; fixed by the plan, never configurable. */
const ArmBase: Record<Policy, EffortLevel> = { efficiency: "low", balanced: "standard", quality: "deep" }

const Arm = Schema.Struct({ policy: Schema.Literals(Policies) }).annotate({
  identifier: "EffortBenchmark.Arm",
})

const StageId = Schema.Literals(["smoke", "screening", "confirmatory"])

const CacheCondition = Schema.Literals(["cold", "warm"])

const Stage = Schema.Struct({
  stage: StageId,
  /** Enforced admission limit for the stage's total estimated spend; in-flight requests can overshoot it. */
  ceiling_usd: Schema.Finite.check(Schema.isGreaterThan(0)),
  run_ceiling_usd: Schema.Finite.check(Schema.isGreaterThan(0)),
  approved: Schema.Boolean,
}).annotate({ identifier: "EffortBenchmark.Stage" })

export const Task = Schema.Struct({
  id: Schema.String,
  class: Schema.Literals(["implementation", "planning", "review", "discovery"]),
  prompt: Schema.String,
}).annotate({ identifier: "EffortBenchmark.Task" })

export interface Suite extends Schema.Schema.Type<typeof Suite> {}
export const Suite = Schema.Struct({
  version: Schema.Literal(1),
  provider: Schema.String,
  model: Schema.String,
  seed: Schema.String,
  repetitions: PositiveInt,
  arms: Schema.Array(Arm),
  cache_conditions: Schema.Array(CacheCondition).pipe(Schema.optional),
  stages: Schema.Array(Stage),
  tasks: Schema.Array(Task),
}).annotate({ identifier: "EffortBenchmark.Suite" })

export interface RunSpec {
  stage: (typeof StageId.Type)[number]
  task_id: string
  policy: Policy
  base: EffortLevel
  cache_condition: "cold" | "warm"
  repetition: number
  /** Deterministic function of the suite seed and the run's coordinates; not randomness at run time. */
  seed: string
}

/** Parses a suite manifest: stage ceilings, arms, and the task corpus. */
export function parseManifest(text: string) {
  const decoded = Schema.decodeUnknownSync(Suite)(Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Unknown))(text))
  if (decoded.arms.length === 0) throw new Error("suite declares no arms")
  if (decoded.tasks.length === 0) throw new Error("suite declares no tasks")
  const seen = new Set<string>()
  for (const arm of decoded.arms) {
    if (seen.has(arm.policy)) throw new Error(`duplicate arm ${arm.policy}`)
    seen.add(arm.policy)
  }
  return decoded
}

/** Parses the model info JSON used for offline preflight. */
export function parseModelInfo(text: string): Model.Info {
  return Schema.decodeUnknownSync(Model.Info)(Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Unknown))(text))
}

/** Parses a task corpus file: `{ "tasks": [...] }`. */
export function parseTasks(text: string) {
  return Schema.decodeUnknownSync(Schema.Struct({ tasks: Schema.Array(Task) }))(
    Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Unknown))(text),
  ).tasks
}

export interface RunInput {
  spec: RunSpec
  root: Session.ID
  /** The provider-visible tier preflight resolved for this arm; the base level labels it when unresolved. */
  resolved?: string | null
  correctness?: "pass" | "fail" | "blocked" | "timeout"
  provider_requests?: number
  wall_ms?: number
  attribution_share?: number
  auxiliary_scope?: { title: boolean; warming: boolean }
}

/** Assembles the ledger manifest entry for one executed run. */
export function runEntry(input: RunInput): SessionUsageReport.Run {
  return SessionUsageReport.Run.make({
    task_id: input.spec.task_id,
    policy: input.spec.policy,
    root_session_id: input.root,
    correctness: input.correctness,
    cache_condition: input.spec.cache_condition,
    repetition: input.spec.repetition,
    requested_variant: input.resolved ?? input.spec.base,
    provider_requests: input.provider_requests,
    wall_ms: input.wall_ms,
    attribution_share: input.attribution_share,
    auxiliary_scope: input.auxiliary_scope,
  })
}

/** Expands one stage into its run specs, ordered by a shuffle seeded from the suite seed. */
export function expand(suite: Suite, stage: (typeof StageId.Type)[number]): RunSpec[] {
  const declared = suite.stages.find((entry) => entry.stage === stage)
  if (!declared) throw new Error(`stage ${stage} is not declared by the suite`)
  const runs = suite.tasks.flatMap((task) =>
    suite.arms.flatMap((arm) =>
      (suite.cache_conditions ?? ["cold"]).flatMap((cache_condition) =>
        Array.from({ length: suite.repetitions }, (_, index) => ({
          stage,
          task_id: task.id,
          policy: arm.policy,
          base: ArmBase[arm.policy],
          cache_condition,
          repetition: index + 1,
          seed: seed(suite.seed, stage, task.id, arm.policy, cache_condition, index + 1),
        })),
      ),
    ),
  )
  return shuffle(runs, seed(suite.seed, stage))
}

export interface PreflightArm {
  policy: Policy
  base: EffortLevel
  /** The provider-visible effort the base resolves to on this route, or null when the route has no knob. */
  resolved: string | null
  status: "distinct" | "converged" | "unavailable"
}

export interface Preflight {
  arms: PreflightArm[]
  /** The largest valid comparison: every arm with a distinct resolution. Empty when fewer than two are valid. */
  comparison: PreflightArm[]
  valid: boolean
}

/**
 * Classifies which arms resolve to distinct provider-visible efforts before any spend. The static
 * comparison runs only over `comparison`; converged arms are reported, never dropped silently. When
 * Stage 0 wire measurements alias providers' effective tiers, pass them as `observed`; an observed
 * tier overrides the route's written effort for that arm.
 */
export function preflight(
  model: Model.Info,
  arms: ReadonlyArray<Policy>,
  observed?: ReadonlyMap<Policy, string>,
): Preflight {
  const capability = EffortAdapter.capability(model)
  const resolved = arms.map((policy) => ({
    policy,
    base: ArmBase[policy],
    resolved: observed?.get(policy) ?? resolveLevelEffort(capability, ArmBase[policy]),
  }))
  const counts = new Map<string, number>()
  const firstWithValue = new Map<string, string>()
  for (const arm of resolved) {
    if (arm.resolved === undefined) continue
    counts.set(arm.resolved, (counts.get(arm.resolved) ?? 0) + 1)
    if (!firstWithValue.has(arm.resolved)) firstWithValue.set(arm.resolved, arm.policy)
  }
  const classified: PreflightArm[] = resolved.map((arm) => ({
    policy: arm.policy,
    base: arm.base,
    resolved: arm.resolved ?? null,
    status: armStatus(arm.resolved, counts.get(arm.resolved ?? ""), arm.policy, firstWithValue),
  }))
  const comparison = classified.filter((arm) => arm.status === "distinct")
  return { arms: classified, comparison, valid: comparison.length >= 2 }
}

function armStatus(
  resolved: string | undefined,
  count: number | undefined,
  policy: string,
  firstWithValue: Map<string, string>,
): PreflightArm["status"] {
  if (resolved === undefined || count === undefined) return "unavailable"
  if (count === 1) return "distinct"
  return firstWithValue.get(resolved) === policy ? "distinct" : "converged"
}

export interface Ceiling {
  ceiling_usd: number
  run_ceiling_usd: number
  approved: boolean
}

export interface Admission {
  admitted: true
}
export interface Refusal {
  admitted: false
  reason: "ceiling-not-approved" | "run-ceiling-exceeded" | "stage-ceiling-exceeded"
}

/**
 * Enforced admission limits for one stage. An admission is not a spend guarantee: requests already
 * in flight when the ceiling trips still complete, so actuals can overshoot `total`.
 */
export function budget(ceiling: Ceiling) {
  const open = ceiling.approved && ceiling.ceiling_usd > 0 && ceiling.run_ceiling_usd > 0
  const admitted = new Set<string>()
  let total = 0
  return {
    admit(runId: string, estimateUsd: number): Admission | Refusal {
      if (!open) return { admitted: false, reason: "ceiling-not-approved" }
      if (admitted.has(runId)) return { admitted: true }
      if (estimateUsd > ceiling.run_ceiling_usd) return { admitted: false, reason: "run-ceiling-exceeded" }
      if (usd(total + estimateUsd) > ceiling.ceiling_usd) {
        return { admitted: false, reason: "stage-ceiling-exceeded" }
      }
      admitted.add(runId)
      total = usd(total + estimateUsd)
      return { admitted: true }
    },
    get total() {
      return total
    },
  }
}

function seed(...parts: ReadonlyArray<unknown>) {
  return createHash("sha256").update(parts.join("\n")).digest("hex").slice(0, 16)
}

/** Fisher-Yates over a mulberry32 stream; same seed, same order, no hidden global state. */
function shuffle<T>(items: T[], seedHex: string): T[] {
  const values = [...items]
  let state = Number.parseInt(seedHex.slice(0, 8), 16)
  const next = () => {
    state = (state + 0x6d2b79f5) | 0
    let mix = Math.imul(state ^ (state >>> 15), 1 | state)
    mix = (mix + Math.imul(mix ^ (mix >>> 7), 61 | mix)) ^ mix
    return ((mix ^ (mix >>> 14)) >>> 0) / 4294967296
  }
  for (let index = values.length - 1; index > 0; index--) {
    const swap = Math.floor(next() * (index + 1))
    ;[values[index], values[swap]] = [values[swap]!, values[index]!]
  }
  return values
}

function usd(value: number) {
  return Math.round(value * 1e8) / 1e8
}
