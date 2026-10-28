export * as EffortAdapter from "./adapter.js"

import { ReasoningEfforts } from "@opencode/ai/effect"
import type { Model } from "@opencode/schema/model"
import { EFFORT_POLICY_PROTOCOL_VERSION, decide } from "./policy/index.js"
import type { Decision, EffortCapability, EffortLevel, EffortState } from "./policy/types.js"

/** The protocol version this host was built against; a different core is refused. */
export const SUPPORTED_PROTOCOL_VERSION = 1

/**
 * The route's effort vocabulary, least expensive first.
 *
 * Non-effort variants ("thinking") are not the policy's knob. A phantom
 * `standard` entry stands in for the model default — opencode's default state
 * is an unset variant, and the decision core needs an advertised default effort
 * to resolve the standard level; it never writes that entry (a default-effort
 * write is stripped by design), so the host reads "at standard" as "clear the
 * variant". It sits after the cheapest real effort so low and deep always
 * resolve to a real variant. Routes with fewer than two real efforts have a
 * degenerate knob and stay untouched in every state.
 */
export function capability(model: Model.Info): EffortCapability {
  const efforts = ReasoningEfforts.filter(
    (effort) => effort !== "none" && model.variants.some((variant) => variant.id === effort),
  )
  if (efforts.length < 2) return { efforts: [] }
  return {
    efforts: [efforts[0]!, DEFAULT_EFFORT, ...efforts.slice(1)],
    defaultEffort: DEFAULT_EFFORT,
  }
}

/** Never a real variant id; see {@link capability}. */
const DEFAULT_EFFORT = "standard"

/** Everything the policy decides from, in host terms. */
export interface Inputs {
  /** The session's selected variant: an exact pick the policy writes verbatim and never escalates. */
  readonly variant?: string
  /** The configured base level for sessions without an exact pick (default: standard). */
  readonly baseLevel: EffortLevel
  /** The session's agent id; plan-mode sessions pin the effective base to deep. */
  readonly agent?: string
  /** The unresolved verifier failure, when one is open. */
  readonly openFailure?: EffortState["openFailure"]
}

/** Assembles the decision core's state from host observations. */
export function stateFor(input: Inputs): EffortState {
  return {
    base: input.baseLevel,
    ...(input.variant !== undefined ? { exact: input.variant } : {}),
    ...(input.agent === "plan" ? { pin: "deep" as const } : {}),
    ...(input.openFailure !== undefined ? { openFailure: input.openFailure } : {}),
  }
}

/**
 * Decides the effort for one request.
 *
 * `Decision.effort` is the variant id to write through `Session.switchModel`.
 * An absent effort with a level — standard — means the model default: the
 * host's default state is an unset variant, so reaching standard means clearing
 * the variant, never writing a default effort. Only `untouched` and
 * `exact-base` leave the session exactly as it is.
 */
export function decideFor(model: Model.Info, input: Inputs): Decision {
  if (EFFORT_POLICY_PROTOCOL_VERSION !== SUPPORTED_PROTOCOL_VERSION)
    throw new Error(
      `effort policy protocol version ${EFFORT_POLICY_PROTOCOL_VERSION} is not supported (expected ${SUPPORTED_PROTOCOL_VERSION})`,
    )
  return decide(capability(model), stateFor(input))
}
