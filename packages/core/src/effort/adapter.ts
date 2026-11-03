export * as EffortAdapter from "./adapter.js"

import { ReasoningEfforts } from "@opencode/ai/effect"
import type { Model } from "@opencode/schema/model"
import type { ConfigEffort } from "@opencode/schema/config/effort"
import { EFFORT_POLICY_PROTOCOL_VERSION, decide } from "./policy/index.js"
import type { Decision, EffortCapability, EffortLevel, EffortState } from "./policy/types.js"
import { operationFor, sessionSeed } from "./delegation.js"
import type { EffortStore } from "./store.js"

/** The protocol version this host was built against; a different core is refused. */
export const SUPPORTED_PROTOCOL_VERSION = 3

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
  /** Adaptive mode: the durable controller level, seeded from the base on first decision. */
  readonly level?: EffortLevel
  /** Adaptive mode: clean passes counted toward the next step-down. */
  readonly cleanPasses?: number
  /** Adaptive mode: qualifying clean passes required before one step-down. */
  readonly cleanPassesNeeded?: number
  /** Frozen mode: hold the effective base and ignore evidence. */
  readonly frozen?: boolean
}

/** Assembles the decision core's state from host observations. */
export function stateFor(input: Inputs): EffortState {
  return {
    base: input.baseLevel,
    ...(input.variant !== undefined ? { exact: input.variant } : {}),
    ...(input.agent === "plan" ? { pin: "deep" as const } : {}),
    ...(input.openFailure !== undefined ? { openFailure: input.openFailure } : {}),
    ...(input.level !== undefined ? { level: input.level } : {}),
    ...(input.cleanPasses !== undefined ? { cleanPasses: input.cleanPasses } : {}),
    ...(input.cleanPassesNeeded !== undefined ? { cleanPassesNeeded: input.cleanPassesNeeded } : {}),
    ...(input.frozen === true ? { frozen: true } : {}),
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

/** Everything one resolution produced, for callers that act or report. */
export interface Resolution {
  /** Policy mode; absent config means static. */
  readonly mode: "static" | "adaptive" | "frozen"
  /** The effective base level: durable row, else adaptive ladder seed, else configured base, else standard. */
  readonly baseLevel: EffortLevel
  /** The session's selected variant with the "default" sentinel removed; absent means Auto. */
  readonly selectedVariant?: Model.VariantID
  /** The user's exact pick after removing the policy's own echo; absent means the policy decides. */
  readonly exact?: Model.VariantID
  /** Route support, from the resolved model's advertised efforts. */
  readonly support: "unknown" | "unsupported" | "supported"
  /** The decision for this snapshot; absent only when the model is unknown. */
  readonly decision?: Decision
}

/**
 * The single input assembly for the effort policy, shared by the transition
 * and status paths: the same validated inputs must decide the same thing
 * wherever they are consumed. Pure; reads no state and performs no I/O.
 *
 * `"default"` on the selection is the store's read representation of no
 * explicit pick (session/info.ts), and a variant matching the row's
 * `lastAppliedVariant` is the policy's own echo, never a user pick.
 */
export function resolve(input: {
  readonly policy?: ConfigEffort.Info
  readonly state?: EffortStore.Info
  readonly agent: string
  readonly model?: Model.Info
  readonly selection?: Model.Ref
}): Resolution {
  const mode = input.policy?.mode ?? "static"
  const selectedVariant = input.selection?.variant === "default" ? undefined : input.selection?.variant
  const exact = selectedVariant !== undefined && selectedVariant !== input.state?.lastAppliedVariant ? selectedVariant : undefined
  const baseLevel = input.state?.baseLevel
    ?? (mode === "adaptive" ? sessionSeed(operationFor(input.agent, input.policy?.agent_operations)) : (input.policy?.base_level ?? "standard"))
  const support = input.model === undefined
    ? "unknown" as const
    : capability(input.model).efforts.length === 0 ? "unsupported" as const : "supported" as const
  const decision = input.model === undefined
    ? undefined
    : decideFor(input.model, {
      variant: exact,
      baseLevel,
      agent: input.agent,
      openFailure: input.state?.openFailure,
      frozen: mode === "frozen",
      ...(mode === "adaptive"
        ? {
            level: input.state?.level ?? baseLevel,
            cleanPasses: input.state?.cleanPasses ?? 0,
            cleanPassesNeeded: input.policy?.clean_passes ?? 2,
          }
        : {}),
    })
  return {
    mode,
    baseLevel,
    ...(selectedVariant !== undefined ? { selectedVariant } : {}),
    ...(exact !== undefined ? { exact } : {}),
    support,
    ...(decision !== undefined ? { decision } : {}),
  }
}
