/**
 * The effort decision itself: precedence, evidence transitions, and the
 * operation table. Pure functions over plain data; no host types, no I/O.
 * @module @mayberry/effort-policy-core/policy
 */

import { higherLevel, higherOf, lowerLevel, resolveLevelEffort } from './levels.js'
import type {
  Decision,
  DecisionRule,
  DelegationOperation,
  EffortCapability,
  EffortLevel,
  EffortState,
  EvidenceObservation,
} from './types.js'

/**
 * The level a session runs at before escalation: the base, raised by a mode pin.
 * @param state - observed state.
 * @returns the effective base level.
 */
export function effectiveBase(state: EffortState): EffortLevel {
  return state.pin === undefined ? state.base : higherOf(state.base, state.pin)
}

/**
 * The level a delegated child starts at for its operation.
 * @param operation - the delegation's declared operation.
 * @returns the starting level.
 */
export function operationStart(operation: DelegationOperation): EffortLevel {
  switch (operation) {
    case 'plan':
    case 'review':
      return 'deep'
    case 'mechanical':
      return 'low'
    case 'general':
    case 'explore':
    case 'implement':
      return 'standard'
  }
}

/**
 * The lowest level a delegation may request for its operation. It constrains a
 * model-facing `reasoning_effort` only; it never floors a session base or an
 * inherited level.
 * @param operation - the delegation's declared operation.
 * @returns the minimum level.
 */
export function operationMinimum(operation: DelegationOperation): EffortLevel {
  return operationStart(operation)
}

/**
 * Apply one observation to the durable state.
 *
 * A failure opens an escalation; in an adaptive session it also raises the
 * durable level one step and resets the clean-pass counter. An infrastructure
 * observation changes nothing.
 *
 * A pass clears the open failure only when it is the same verifier, observed
 * later, and taken at a revision that is not older than the failing one; every
 * other pass is stale and changes nothing. Qualifying clean passes count
 * toward a step-down in adaptive sessions: once `cleanPassesNeeded` consecutive
 * qualifying passes are seen, the durable level decays one step toward the
 * base, and the counter restarts. Static sessions carry no level and are
 * unchanged by passes.
 *
 * @param state - current state.
 * @param observation - the observed outcome.
 * @returns the next state, or the same state when the observation changes nothing.
 */
export function applyEvidence(state: EffortState, observation: EvidenceObservation): EffortState {
  if (observation.kind === 'infrastructure') return state
  if (observation.kind === 'verification-failure') {
    const opened: EffortState = {
      ...state,
      openFailure: {
        verifier: observation.verifier,
        sequence: observation.sequence,
        revision: observation.revision,
      },
    }
    if (state.level === undefined) return opened
    return { ...opened, level: higherLevel(state.level), cleanPasses: 0 }
  }
  const open = state.openFailure
  if (open !== undefined) {
    if (open.verifier !== observation.verifier) return state
    if (observation.sequence <= open.sequence) return state
    if (observation.revision < open.revision) return state
    const { openFailure: _cleared, ...rest } = state
    return countCleanPass(rest, 1)
  }
  return countCleanPass(state, (state.cleanPasses ?? 0) + 1)
}

/**
 * Record one qualifying clean pass in an adaptive session and step the durable
 * level down when enough have accumulated. The base is the decay floor.
 */
function countCleanPass(state: EffortState, passes: number): EffortState {
  if (state.level === undefined) return state
  const needed = state.cleanPassesNeeded
  if (needed === undefined || passes < needed) return { ...state, cleanPasses: passes }
  if (state.level === state.base) return { ...state, cleanPasses: 0 }
  return { ...state, level: lowerLevel(state.level, state.base), cleanPasses: 0 }
}

/**
 * Decide the effort for one request.
 *
 * An exact base wins verbatim. Static sessions derive the level from the
 * effective base, raised one step while a failure is unresolved. Adaptive
 * sessions decide from their durable level, raised by the session pin; the
 * open failure holds the raise the evidence loop already applied, and a level
 * still above the base after the failure cleared is a step-down in progress.
 *
 * Nothing is written when the level is already the adapter's default or the
 * route advertises no reasoning, because a written default is a different
 * durable fact from an adapter default.
 *
 * @param capability - the exact route's advertised efforts.
 * @param state - observed state.
 * @returns the decision, including the rule that produced it.
 */
export function decide(capability: EffortCapability, state: EffortState): Decision {
  if (state.exact !== undefined) {
    return capability.efforts.includes(state.exact)
      ? { rule: 'exact-base', effort: state.exact }
      : { rule: 'untouched' }
  }
  const adaptive = state.level !== undefined
  const held = adaptive
    ? state.pin !== undefined
      ? higherOf(state.level, state.pin)
      : state.level
    : effectiveBase(state)
  const escalated = state.openFailure !== undefined
  const level = escalated && !adaptive ? higherLevel(held) : held
  const rule: DecisionRule = escalated
    ? 'escalated'
    : state.pin !== undefined && higherOf(state.base, state.pin) !== state.base
      ? 'mode-pin'
      : adaptive && held !== state.base
        ? 'step-down'
        : 'base'
  const effort = resolveLevelEffort(capability, level)
  if (effort === undefined) return { rule: 'untouched' }
  if (effort === capability.defaultEffort) return { rule, level }
  return { rule, level, effort }
}
