export * as EffortBenchmarkRunner from "./benchmark-runner.js"

import type { Model } from "@opencode/schema/model"
import type { Session } from "@opencode/schema/session"
import { EffortBenchmark } from "./benchmark.js"
import type { Policy, RunSpec, Suite } from "./benchmark.js"
import { SessionUsageReport } from "../session/usage-report.js"

/** One executed run, exported before any revert. Correctness comes from external verification, never the model. */
export interface Outcome {
  root: Session.ID
  exportJson: string
  wall_ms: number
  /** The tier the backend observed on the wire, when it could observe one. */
  resolved?: string | null
  provider_requests?: number
  correctness?: "pass" | "fail" | "blocked" | "timeout"
}

export interface Errored {
  task_id: string
  policy: Policy
  cache_condition: string
  repetition: number
}

export interface NotStarted {
  task_id: string
  policy: Policy
  reason: "stage-ceiling-exceeded" | "run-ceiling-exceeded"
}

export interface RunnerResult {
  preflight: EffortBenchmark.Preflight
  entries: SessionUsageReport.Run[]
  exports: ReadonlyArray<SessionUsageReport.Export>
  report: ReturnType<typeof SessionUsageReport.build>
  not_started: NotStarted[]
  errored: Errored[]
}

/**
 * Runs one stage: preflight gate, admission per run, execution in seeded order, and ledger assembly.
 * A run the budget refuses is reported as not started; a backend crash is reported as errored.
 * Neither is silently dropped from the manifest.
 */
export function execute(input: {
  suite: Suite
  stage: "smoke" | "screening" | "confirmatory"
  model: Model.Info
  observed?: ReadonlyMap<Policy, string>
  run: (spec: RunSpec) => Promise<Outcome>
}): Promise<RunnerResult> {
  return (async () => {
    const preflight = EffortBenchmark.preflight(
      input.model,
      input.suite.arms.map((arm) => arm.policy),
      input.observed,
    )
    if (!preflight.valid) throw new Error("preflight found fewer than two distinct arms; refusing to start")
    const declared = input.suite.stages.find((entry) => entry.stage === input.stage)
    if (!declared) throw new Error(`stage ${input.stage} is not declared by the suite`)
    if (!declared.approved) throw new Error("stage ceiling is not approved; refusing to start")
    const guard = EffortBenchmark.budget(declared)

    const entries: SessionUsageReport.Run[] = []
    const exports: SessionUsageReport.Export[] = []
    const not_started: NotStarted[] = []
    const errored: Errored[] = []
    for (const spec of EffortBenchmark.expand(input.suite, input.stage)) {
      const key = `${spec.task_id}:${spec.policy}:${spec.cache_condition}:${spec.repetition}`
      const admission = guard.admit(key, declared.run_ceiling_usd)
      if (!admission.admitted) {
        not_started.push({
          task_id: spec.task_id,
          policy: spec.policy,
          reason: admission.reason === "stage-ceiling-exceeded" ? "stage-ceiling-exceeded" : "run-ceiling-exceeded",
        })
        continue
      }
      let completed: Outcome
      try {
        completed = await input.run(spec)
      } catch {
        errored.push({
          task_id: spec.task_id,
          policy: spec.policy,
          cache_condition: spec.cache_condition,
          repetition: spec.repetition,
        })
        continue
      }
      entries.push(
        EffortBenchmark.runEntry({
          spec,
          root: completed.root,
          resolved: completed.resolved,
          correctness: completed.correctness,
          provider_requests: completed.provider_requests,
          wall_ms: completed.wall_ms,
        }),
      )
      exports.push(...SessionUsageReport.parseExports(completed.exportJson))
    }
    return {
      preflight,
      entries,
      exports,
      report: SessionUsageReport.build({ runs: entries, exports }),
      not_started,
      errored,
    }
  })()
}
