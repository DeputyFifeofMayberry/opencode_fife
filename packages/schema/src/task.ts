export * as Task from "./task.js"

import { Schema } from "effect"
import { DateTimeUtcFromMillis, NonNegativeInt, optional } from "./schema.js"
import { SessionID } from "./session-id.js"
import { TokenUsage } from "./token-usage.js"

/**
 * A task groups one root Session and every Session descended from it, and carries the
 * only measurement the runtime cannot derive: an explicit acceptance outcome.
 *
 * Session completion never implies acceptance. `unverified` is the default and the
 * honest answer until a person or an independent check records otherwise.
 */
export const ID = Schema.String.check(Schema.isStartingWith("tsk")).pipe(
  Schema.brand("TaskID"),
  Schema.annotate({ identifier: "Task.ID" }),
)
export type ID = typeof ID.Type

export const Outcome = Schema.Literals(["accepted", "rejected", "unverified"]).annotate({
  identifier: "Task.Outcome",
})
export type Outcome = typeof Outcome.Type

/** Who asserted the outcome. `test` means an independent check, never the agent's own report. */
export const Source = Schema.Literals(["user", "command", "test"]).annotate({
  identifier: "Task.Source",
})
export type Source = typeof Source.Type

export const ExecutionOutcome = Schema.Literals(["succeeded", "failed", "interrupted"]).annotate({
  identifier: "Task.ExecutionOutcome",
})
export type ExecutionOutcome = typeof ExecutionOutcome.Type

/** How the evidence was produced. Only `command` can be executed by this subsystem. */
export const EvidenceKind = Schema.Literals(["command", "artifact", "report", "user"]).annotate({
  identifier: "Task.EvidenceKind",
})
export type EvidenceKind = typeof EvidenceKind.Type

export const EvidenceResult = Schema.Literals(["passed", "failed", "unknown"]).annotate({
  identifier: "Task.EvidenceResult",
})
export type EvidenceResult = typeof EvidenceResult.Type

/** Derived from evidence, never from `source` alone, so a legacy row cannot claim verification. */
export const Verification = Schema.Literals([
  "verified",
  "executed",
  "declared",
  "attested",
  "unverified",
]).annotate({
  identifier: "Task.Verification",
})
export type Verification = typeof Verification.Type

export interface Evidence extends Schema.Schema.Type<typeof Evidence> {}
export const Evidence = Schema.Struct({
  kind: EvidenceKind,
  /** A command line, artifact path, report path, or a person's statement, depending on `kind`. */
  reference: Schema.String.check(Schema.isMinLength(1)),
  result: EvidenceResult,
  /** True only when the recorder ran the check itself; a claimed result is not execution. */
  executed: Schema.Boolean,
  duration_ms: NonNegativeInt.pipe(optional),
}).annotate({ identifier: "Task.Evidence" })

export interface Acceptance extends Schema.Schema.Type<typeof Acceptance> {}
export const Acceptance = Schema.Struct({
  outcome: Outcome,
  source: Source,
  note: Schema.String.pipe(optional),
  evidence: Evidence.pipe(optional),
  verification: Verification,
  time_created: DateTimeUtcFromMillis,
}).annotate({ identifier: "Task.Acceptance" })

export interface Info extends Schema.Schema.Type<typeof Info> {}
export const Info = Schema.Struct({
  id: ID,
  root_session_id: SessionID,
  label: Schema.String.pipe(optional),
  /** Free-form grouping key, mirroring the usage ledger's `policy` column. */
  policy: Schema.String.pipe(optional),
  time_created: DateTimeUtcFromMillis,
  time_updated: DateTimeUtcFromMillis,
}).annotate({ identifier: "Task.Info" })

export interface SessionSummary extends Schema.Schema.Type<typeof SessionSummary> {}
export const SessionSummary = Schema.Struct({
  id: SessionID,
  parent_id: SessionID.pipe(optional),
  /** Last execution outcome the runtime recorded, absent until a run reaches a terminal transition. */
  outcome: ExecutionOutcome.pipe(optional),
  /** Durable count of claim recoveries; a resumed execution increments this. */
  resume_attempts: NonNegativeInt,
  turns: Schema.Struct({
    total: NonNegativeInt,
    succeeded: NonNegativeInt,
    failed: NonNegativeInt,
    interrupted: NonNegativeInt,
  }),
  time: Schema.Struct({
    created: DateTimeUtcFromMillis,
    updated: DateTimeUtcFromMillis,
    busy: DateTimeUtcFromMillis.pipe(optional),
    idle: DateTimeUtcFromMillis.pipe(optional),
  }),
}).annotate({ identifier: "Task.SessionSummary" })

export interface Timing extends Schema.Schema.Type<typeof Timing> {}
export const Timing = Schema.Struct({
  /** First Session creation to the last recorded idle or update, across the whole task. */
  wall_ms: NonNegativeInt,
  /** Sum of settled assistant-message spans; excludes queueing, compaction and unsettled steps. */
  active_ms: NonNegativeInt,
  /** Sum of turn spans, measured from one idle marker to the next. Includes tool and provider wait. */
  turn_ms: NonNegativeInt,
}).annotate({ identifier: "Task.Timing" })

export interface Usage extends Schema.Schema.Type<typeof Usage> {}
export const Usage = Schema.Struct({
  requests: Schema.Struct({
    /** Durable assistant message rows. One row is one logical step. */
    observed: NonNegativeInt,
    /** Provider dispatches including retries. Null when the durable event log does not cover every observed step. */
    provider_attempts: Schema.NullOr(NonNegativeInt),
    settled: NonNegativeInt,
    unsettled: NonNegativeInt,
    failed: NonNegativeInt,
    /** Retries come from the event log because a retried attempt reuses its assistant message row. */
    retries: Schema.NullOr(NonNegativeInt),
    /** Provider attempts with no durable row. Null whenever the log is unusable. */
    unreconciled: Schema.NullOr(NonNegativeInt),
  }),
  tokens: TokenUsage.Info,
  gross_tokens: NonNegativeInt,
  /** Session rollup minus the message sum: retry-attempt and title/warming spend land here. */
  unattributed_tokens: NonNegativeInt,
  /** US dollars, split by how each amount was priced. */
  cost: Schema.Struct({
    total: Schema.Finite,
    provider: Schema.Finite,
    estimated: Schema.Finite,
    legacy_unknown: Schema.Finite,
    unattributed: Schema.Finite,
    unpriced_records: NonNegativeInt,
    provenance_mismatches: NonNegativeInt,
  }),
}).annotate({ identifier: "Task.Usage" })

export interface Completeness extends Schema.Schema.Type<typeof Completeness> {}
export const Completeness = Schema.Struct({
  /** False when the session tree hit the depth limit or a session failed to export. */
  sessions: Schema.Boolean,
  /** False when any observed step is unsettled, or the session tree is incomplete. */
  requests: Schema.Boolean,
  /** False when a message or descendant is missing, or a session rollup exceeds its messages. */
  usage: Schema.Boolean,
  /** False when an amount is unpriced or of mixed provenance, activity was reverted, or the tree is incomplete. */
  cost: Schema.Boolean,
  reconciled: Schema.Boolean,
  billing_verified: Schema.Boolean,
  reverted: Schema.Boolean,
  /** False when the ledger observed no steps at all, so an empty task cannot read as complete. */
  measured: Schema.Boolean,
}).annotate({ identifier: "Task.Completeness" })

export interface Summary extends Schema.Schema.Type<typeof Summary> {}
export const Summary = Schema.Struct({
  version: Schema.Literal(2),
  task: Info,
  /** Latest recorded acceptance, absent until one is recorded. */
  acceptance: Acceptance.pipe(optional),
  /** Every recorded acceptance, oldest first, so rework and repeated verification stay visible. */
  history: Schema.Array(Acceptance),
  sessions: Schema.Array(SessionSummary),
  timing: Timing,
  usage: Usage,
  completeness: Completeness,
}).annotate({ identifier: "Task.Summary" })

export const ExportFormat = Schema.Literals(["json", "csv"]).annotate({
  identifier: "Task.ExportFormat",
})
export type ExportFormat = typeof ExportFormat.Type

export interface Export extends Schema.Schema.Type<typeof Export> {}
export const Export = Schema.Struct({
  format: ExportFormat,
  /** Serialized task rows. JSON carries the full summary; CSV carries one row per task. */
  data: Schema.String,
  /** Summaries actually serialized. */
  count: NonNegativeInt,
  /** Task ids whose build failed. Reported instead of dropped silently. */
  skipped: NonNegativeInt,
  /** True when discovery found more eligible roots than this export returned. */
  truncated: Schema.Boolean,
}).annotate({ identifier: "Task.Export" })
