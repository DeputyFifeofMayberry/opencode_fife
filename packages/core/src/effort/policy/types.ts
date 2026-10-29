/**
 * Portable effort-policy vocabulary: the values that cross the boundary between
 * the decision core and any adapter, including a future non-Cordis host.
 * @module @mayberry/effort-policy-core/types
 */

/**
 * Version of the decision data that crosses the core boundary. A host refuses
 * a core whose version it does not know, and a change to level rules, operation
 * minimums, or decision fields increments it.
 */
export const EFFORT_POLICY_PROTOCOL_VERSION = 2

/** Automatic effort levels, ordered from least to most expensive. */
export type EffortLevel = 'low' | 'standard' | 'deep'

/** What a delegated child is being asked to do; it fixes the child's start level. */
export type DelegationOperation = 'general' | 'explore' | 'implement' | 'plan' | 'review' | 'mechanical'

/** Adapter-owned effort vocabulary for one exact route. */
export interface EffortCapability {
  /** Advertised efforts, ordered from least to most expensive. */
  readonly efforts: readonly string[]
  /** The effort the adapter uses when a request names none. */
  readonly defaultEffort?: string
}

/** Which rule produced a decision; recorded so every request is auditable. */
export type DecisionRule =
  | 'exact-base'
  | 'mode-pin'
  | 'base'
  | 'step-down'
  | 'escalated'
  | 'untouched'

/** One observed verification outcome, correlated to a verifier and a work revision. */
export interface EvidenceObservation {
  /** Outcome class; infrastructure failures never change the level. */
  readonly kind: 'verification-failure' | 'verification-pass' | 'infrastructure'
  /** Verifier identity: tool, normalized arguments, and working directory. */
  readonly verifier: string
  /** Monotonic observation order within the session. */
  readonly sequence: number
  /** Workspace mutation counter when the observation was made. */
  readonly revision: number
}

/** Observed state the policy decides from. Pure data; no host types. */
export interface EffortState {
  /** The configured or user-selected base level. */
  readonly base: EffortLevel
  /** A user-selected exact effort, which the policy writes verbatim and never escalates. */
  readonly exact?: string
  /** A level raised by session mode, such as plan mode. */
  readonly pin?: EffortLevel
  /**
   * The durable adaptive level. Its presence switches the evidence loop to
   * hysteresis: failures raise it one step, consecutive clean passes decay it
   * toward the base. Absent means the static policy derives the level from the
   * base and the open failure.
   */
  readonly level?: EffortLevel
  /** Consecutive qualifying clean passes observed since the last raise or step-down. */
  readonly cleanPasses?: number
  /** Clean passes required before one step-down; absent means counting without stepping. */
  readonly cleanPassesNeeded?: number
  /** The unresolved failure that keeps the level raised. */
  readonly openFailure?: {
    /** Verifier identity that failed. */
    readonly verifier: string
    /** Observation order of the failure. */
    readonly sequence: number
    /** Workspace revision at the failure. */
    readonly revision: number
  }
}

/** The policy's answer for one request. */
export interface Decision {
  /** Rule that produced this answer. */
  readonly rule: DecisionRule
  /** Automatic level, absent for an exact base or an untouched route. */
  readonly level?: EffortLevel
  /** Exact effort to write; absent means leave the request untouched. */
  readonly effort?: string
}
