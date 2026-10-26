export * as EffortStore from "./store.js"

import { eq, sql } from "drizzle-orm"
import { Context, Effect, Layer } from "effect"
import { makeGlobalNode } from "@opencode/util/effect/app-node"
import type { SessionSchema } from "../session/schema.js"
import { SessionEffortTable } from "../session/sql.js"
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
}

export interface Interface {
  readonly get: (sessionID: SessionSchema.ID) => Effect.Effect<Info | undefined>
  readonly set: (info: Info) => Effect.Effect<void>
  /** Replaces only the open failure; the revision column is untouched, so concurrent bumps never race this write. */
  readonly setOpenFailure: (sessionID: SessionSchema.ID, openFailure: OpenFailure | undefined) => Effect.Effect<void>
  /** Advances the workspace revision by one; atomic, so concurrent bumps all land. */
  readonly bumpRevision: (sessionID: SessionSchema.ID) => Effect.Effect<void>
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
          })
          .onConflictDoUpdate({
            target: SessionEffortTable.session_id,
            set: {
              base_level: info.baseLevel,
              open_failure: info.openFailure ?? null,
              revision: info.revision,
              last_applied_variant: info.lastAppliedVariant ?? null,
            },
          })
          .run()
          .pipe(Effect.orDie)
      }),
      setOpenFailure: Effect.fnUntraced(function* (sessionID, openFailure) {
        yield* db
          .update(SessionEffortTable)
          .set({ open_failure: openFailure ?? null })
          .where(eq(SessionEffortTable.session_id, sessionID))
          .run()
          .pipe(Effect.orDie)
      }),
      bumpRevision: Effect.fnUntraced(function* (sessionID) {
        yield* db
          .update(SessionEffortTable)
          .set({ revision: sql`${SessionEffortTable.revision} + 1` })
          .where(eq(SessionEffortTable.session_id, sessionID))
          .run()
          .pipe(Effect.orDie)
      }),
    })
  }),
)

/** Instance-graph node so the runner layer can require the store. */
export const node = makeGlobalNode({ service: Service, layer, deps: [Database.node] })
