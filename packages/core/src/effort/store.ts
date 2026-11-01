export * as EffortStore from "./store.js"

import { and, eq, sql } from "drizzle-orm"
import { Context, Effect, Layer } from "effect"
import { makeGlobalNode } from "@opencode/util/effect/app-node"
import type { SessionSchema } from "../session/schema.js"
import { SessionEffortTable, SessionTable } from "../session/sql.js"
import { Database } from "../database/database.js"
import type { EffortLevel } from "./policy/types.js"

/** The unresolved failure keeping the level raised; mirrors the decision core. */
export interface OpenFailure {
  readonly verifier: string
  readonly sequence: number
  readonly revision: number
}

/** Durable per-session policy state. The policy is its only writer. */
export interface Info {
  readonly sessionID: SessionSchema.ID
  readonly baseLevel: EffortLevel
  readonly openFailure?: OpenFailure
  readonly revision: number
  /** The variant the policy last wrote through `Session.switchModel`, when it did. */
  readonly lastAppliedVariant?: string
  /** Adaptive mode: the durable controller level; absent in static sessions. */
  readonly level?: EffortLevel
  /** Consecutive qualifying clean passes toward the next step-down. */
  readonly cleanPasses?: number
  /** Revision at the last harness-initiated verdict; absent until one records. */
  readonly verdictRevision?: number
  /** Workspace digest at the last harness-initiated verdict; absent outside repositories. */
  readonly verdictDigest?: string
}

export interface Interface {
  readonly get: (sessionID: SessionSchema.ID) => Effect.Effect<Info | undefined>
  readonly set: (info: Info) => Effect.Effect<void>
  /** Records a policy-owned selection without overwriting concurrently updated evidence. */
  readonly recordSelection: (info: Info) => Effect.Effect<void>
  /**
   * Claims the next observation order for this session.
   *
   * Runs inside the caller's transaction so the claim and the evidence write commit
   * together. Absent when the expected revision no longer matches, so a stale settlement
   * consumes no number, and absent when the session has no effort row yet — in which case
   * nothing is recorded, matching the behavior before this store existed.
   */
  readonly claimSequence: (
    sessionID: SessionSchema.ID,
    expectedRevision?: number,
  ) => Effect.Effect<number | undefined>
  /** Writes one observation's policy output in a single statement; the revision column is untouched. */
  readonly recordEvidence: (sessionID: SessionSchema.ID, evidence: EvidenceWrite) => Effect.Effect<void>
  /** Records the workspace state a harness-initiated verdict observed; the revision column is untouched. */
  readonly setVerdict: (sessionID: SessionSchema.ID, verdict: { revision: number; digest?: string }) => Effect.Effect<void>
  /** Invalidates effort evidence for sessions in the same working directory. */
  readonly bumpWorkspaceRevision: (sessionID: SessionSchema.ID) => Effect.Effect<void>
}

/** The policy's output for one observation. Absent adaptive fields leave those columns untouched. */
export interface EvidenceWrite {
  /** Required: absent clears the failure. Optional would let a partial write erase evidence. */
  readonly openFailure: OpenFailure | undefined
  readonly level?: EffortLevel
  readonly cleanPasses?: number
}

export class Service extends Context.Service<Service, Interface>()("@opencode/EffortStore") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const { db } = yield* Database.Service

    const fromRow = (row: typeof SessionEffortTable.$inferSelect): Info => ({
      sessionID: row.session_id,
      baseLevel: row.base_level,
      openFailure: row.open_failure ?? undefined,
      revision: row.revision,
      lastAppliedVariant: row.last_applied_variant ?? undefined,
      level: row.level ?? undefined,
      cleanPasses: row.clean_passes,
      verdictRevision: row.verdict_revision ?? undefined,
      verdictDigest: row.verdict_digest ?? undefined,
    })

    return Service.of({
      get: Effect.fnUntraced(function* (sessionID) {
        const row = yield* db
          .select()
          .from(SessionEffortTable)
          .where(eq(SessionEffortTable.session_id, sessionID))
          .get()
          .pipe(Effect.orDie)
        return row ? fromRow(row) : undefined
      }),
      set: Effect.fnUntraced(function* (info) {
        yield* db
          .insert(SessionEffortTable)
          .values({
            session_id: info.sessionID,
            base_level: info.baseLevel,
            open_failure: info.openFailure ?? null,
            revision: info.revision,
            last_applied_variant: info.lastAppliedVariant ?? null,
            level: info.level ?? null,
            clean_passes: info.cleanPasses ?? 0,
          })
          .onConflictDoUpdate({
            target: SessionEffortTable.session_id,
            set: {
              base_level: info.baseLevel,
              open_failure: info.openFailure ?? null,
              revision: info.revision,
              last_applied_variant: info.lastAppliedVariant ?? null,
              level: info.level ?? null,
              clean_passes: info.cleanPasses ?? 0,
            },
          })
          .run()
          .pipe(Effect.orDie)
      }),
      recordSelection: Effect.fnUntraced(function* (info) {
        yield* db
          .insert(SessionEffortTable)
          .values({
            session_id: info.sessionID,
            base_level: info.baseLevel,
            open_failure: info.openFailure ?? null,
            revision: info.revision,
            last_applied_variant: info.lastAppliedVariant ?? null,
            level: info.level ?? null,
            clean_passes: info.cleanPasses ?? 0,
          })
          .onConflictDoUpdate({
            target: SessionEffortTable.session_id,
            set: { last_applied_variant: info.lastAppliedVariant ?? null },
          })
          .run()
          .pipe(Effect.orDie)
      }),
      claimSequence: Effect.fnUntraced(function* (sessionID, expectedRevision) {
        const claimed = yield* db
          .update(SessionEffortTable)
          .set({ evidence_sequence: sql`${SessionEffortTable.evidence_sequence} + 1` })
          .where(
            expectedRevision === undefined
              ? eq(SessionEffortTable.session_id, sessionID)
              : and(eq(SessionEffortTable.session_id, sessionID), eq(SessionEffortTable.revision, expectedRevision)),
          )
          .returning({ sequence: SessionEffortTable.evidence_sequence })
          .get()
          .pipe(Effect.orDie)
        return claimed?.sequence
      }),
      recordEvidence: Effect.fnUntraced(function* (sessionID, evidence) {
        yield* db
          .update(SessionEffortTable)
          .set({
            open_failure: evidence.openFailure ?? null,
            ...(evidence.level === undefined ? {} : { level: evidence.level }),
            ...(evidence.cleanPasses === undefined ? {} : { clean_passes: evidence.cleanPasses }),
          })
          .where(eq(SessionEffortTable.session_id, sessionID))
          .run()
          .pipe(Effect.orDie)
      }),
      setVerdict: Effect.fnUntraced(function* (sessionID, verdict) {
        yield* db
          .update(SessionEffortTable)
          .set({ verdict_revision: verdict.revision, verdict_digest: verdict.digest ?? null })
          .where(eq(SessionEffortTable.session_id, sessionID))
          .run()
          .pipe(Effect.orDie)
      }),
      bumpWorkspaceRevision: Effect.fnUntraced(function* (sessionID) {
        yield* db
          .update(SessionEffortTable)
          .set({ revision: sql`${SessionEffortTable.revision} + 1`, clean_passes: 0 })
          .where(sql`${SessionEffortTable.session_id} in (
            select ${SessionTable.id} from ${SessionTable}
            where ${SessionTable.directory} = (select ${SessionTable.directory} from ${SessionTable} where ${SessionTable.id} = ${sessionID})
          )`)
          .run()
          .pipe(Effect.orDie)
      }),
    })
  }),
)

/** Instance-graph node so the runner layer can require the store. */
export const node = makeGlobalNode({ service: Service, layer, deps: [Database.node] })
