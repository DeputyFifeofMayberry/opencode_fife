/**
 * The effort decision itself: precedence, evidence transitions, and the
 * operation table. Pure functions over plain data; no host types, no I/O.
 * @module @mayberry/effort-policy-core/policy
 */

import { higherLevel, higherOf, resolveLevelEffort } from './levels.js'
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
 * A failure opens an escalation. An infrastructure observation changes nothing.
 * A pass clears the open failure only when it is the same verifier, observed
 * later, and taken at a revision that is not older than the failing one; every
 * other pass is stale.
 *
 * @param state - current state.
 * @param observation - the observed outcome.
 * @returns the next state, or the same state when the observation changes nothing.
 */
export function applyEvidence(state: EffortState, observation: EvidenceObservation): EffortState {
  if (observation.kind === 'infrastructure') return state
  if (observation.kind === 'verification-failure') {
    return {
      ...state,
      openFailure: {
        verifier: observation.verifier,
        sequence: observation.sequence,
        revision: observation.revision,
      },
    }
  }
  const open = state.openFailure
  if (open === undefined) return state
  if (open.verifier !== observation.verifier) return state
  if (observation.sequence <= open.sequence) return state
  if (observation.revision < open.revision) return state
  const { openFailure: _cleared, ...rest } = state
  return rest
}

/**
 * Decide the effort for one request.
 *
 * An exact base wins verbatim. Otherwise the level is the effective base, raised
 * one step while a failure is unresolved. Nothing is written when the level is
 * already the adapter's default or the route advertises no reasoning, because a
 * written default is a different durable fact from an adapter default.
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
  const base = effectiveBase(state)
  const escalated = state.openFailure !== undefined
  const level = escalated ? higherLevel(base) : base
  const rule: DecisionRule = escalated
    ? 'escalated'
    : state.pin !== undefined && higherOf(state.base, state.pin) !== state.base
      ? 'mode-pin'
      : 'base'
  const effort = resolveLevelEffort(capability, level)
  if (effort === undefined) return { rule: 'untouched' }
  if (effort === capability.defaultEffort) return { rule, level }
  return { rule, level, effort }
}
