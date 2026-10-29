export * as EffortTransition from "./transition.js"

import { Effect } from "effect"
import { Model } from "@opencode/schema/model"
import type { SessionSchema } from "../session/schema.js"
import type { SessionRunnerModel } from "../session/runner/model.js"
import { SessionStore } from "../session/store.js"
import { SessionEvent } from "../session/event.js"
import { Bus } from "../bus.js"
import { Config } from "../config.js"
import { Model as ModelService } from "../model.js"
import { EffortAdapter } from "./adapter.js"
import { EffortStore } from "./store.js"

/**
 * Applies the effort policy at a prepared step and writes transitions through
 * the same durable `ModelSelected` event the public API publishes, so prompt
 * cache markers, projections, and TUI reconciliation behave exactly like a
 * manual switch.
 *
 * The policy's own writes are recognized through the store's
 * `last_applied_variant`: a session variant matching it is a policy echo and
 * never becomes an exact pick, while any other variant is the user's and wins
 * verbatim from then on.
 */
export interface Input {
  readonly sessionID: SessionSchema.ID
  readonly agent: string
  readonly resolved: SessionRunnerModel.Resolved
}

export interface Deps {
  readonly bus: Bus.Interface
  readonly store: SessionStore.Interface
  readonly efforts: EffortStore.Interface
  readonly config: Config.Interface
  readonly models: ModelService.Interface
}

/**
 * Decides for one prepared step and applies a transition when the decided
 * variant differs from the session's. Returns whether the session changed, so
 * the caller can reload context before building the request.
 */
export const apply = Effect.fn("EffortTransition.apply")(function* (deps: Deps, input: Input) {
  const session = yield* deps.store.get(input.sessionID)
  if (!session) return false
  const row = yield* deps.efforts.get(input.sessionID)
  const policy = Config.latest(yield* deps.config.entries(), "effort_policy")
  // "default" is the store's read representation of no explicit pick (session/info.ts); the policy treats it as unset.
  const variant = session.model?.variant === "default" ? undefined : session.model?.variant
  // The policy's own echo is not a user pick; anything else is exact and wins verbatim.
  const exact = variant !== undefined && variant !== row?.lastAppliedVariant ? variant : undefined

  const info = yield* deps.models.get(input.resolved.ref.providerID, input.resolved.ref.id)
  if (!info) return false
  // The row's base is the durable source; config only seeds sessions without a row.
  const baseLevel = row?.baseLevel ?? policy?.base_level ?? "standard"
  const decision = EffortAdapter.decideFor(info, {
    variant: exact,
    baseLevel,
    agent: input.agent,
    openFailure: row?.openFailure,
  })

  if (decision.rule === "untouched" || decision.rule === "exact-base") {
    // A user pick replaces a policy write as the session's baseline; the echo
    // case already filtered out, so this write happens once per pick.
    if (exact !== undefined && row?.lastAppliedVariant !== undefined)
      yield* deps.efforts.set({
        sessionID: input.sessionID,
        baseLevel: row.baseLevel,
        openFailure: row.openFailure,
        revision: row.revision,
      })
    return false
  }

  const target = decision.effort
  if (target === variant) return false

  const model = Model.Ref.make({
    providerID: input.resolved.ref.providerID,
    id: input.resolved.ref.id,
    ...(target === undefined ? {} : { variant: Model.VariantID.make(target) }),
  })
  // The metadata marks the write as policy-driven so timeline notices can say why the variant moved.
  yield* deps.bus.publish(
    SessionEvent.ModelSelected,
    {
      sessionID: input.sessionID,
      model,
      previous: session.model,
    },
    { metadata: { source: "effort-policy", rule: decision.rule, level: decision.level! } },
  )
  yield* deps.efforts.set({
    sessionID: input.sessionID,
    baseLevel,
    openFailure: row?.openFailure,
    revision: row?.revision ?? 0,
    lastAppliedVariant: target,
  })
  yield* deps.bus.publish(SessionEvent.EffortTransitioned, {
    sessionID: input.sessionID,
    decision: {
      rule: decision.rule,
      level: decision.level!,
      ...(decision.effort === undefined ? {} : { effort: decision.effort }),
    },
  })
  return true
})
