import { describe, expect, test } from "bun:test"
import path from "path"
import { SqliteClient } from "@effect/sql-sqlite-bun"
import { Effect, Layer } from "effect"
import { SqlClient } from "effect/sql"
import { sql } from "drizzle-orm"
import { Database } from "@opencode/core/database/database"
import { EffectDrizzleSqlite } from "@opencode/core/database/drizzle"
import { DatabaseMigration } from "@opencode/core/database/migration"
import addTaskTelemetry from "@opencode/core/database/migration/20261103231716_add_task_telemetry"
import addTaskAcceptanceEvidence from "@opencode/core/database/migration/20261104004957_add_task_acceptance_evidence"
import { TaskStore } from "@opencode/core/telemetry/task"
import { Task } from "@opencode/schema/task"
import { Global } from "@opencode/util/global"

const evidenceColumns = [
  "evidence_kind",
  "evidence_reference",
  "evidence_result",
  "evidence_executed",
  "evidence_duration_ms",
]

const run = <A, E>(effect: Effect.Effect<A, E, SqlClient.SqlClient | Global.Service>) =>
  Effect.runPromise(
    effect.pipe(
      Effect.provideService(Global.Service, Global.make({ data: path.join(process.cwd(), ".test-data") })),
      Effect.provide(SqliteClient.layer({ filename: ":memory:", disableWAL: true })),
      Effect.scoped,
    ),
  )

const makeDb = EffectDrizzleSqlite.makeWithDefaults()

const columnsOf = (db: Effect.Success<typeof makeDb>) =>
  db.all<{ name: string }>(sql`SELECT name FROM pragma_table_info('task_acceptance')`)

describe("Task acceptance evidence migration", () => {
  // Follows test/database-migration.test.ts: `applyOnly` replays a chosen subset, so a
  // database that stopped at the telemetry migration can be upgraded in place. The
  // read-back through TaskStore proves the legacy row still maps to `unverified`.
  test("upgrades a database that already applied the telemetry migration", async () => {
    await run(
      Effect.gen(function* () {
        const db = yield* makeDb
        yield* DatabaseMigration.applyOnly(db, [addTaskTelemetry])
        yield* db.run(sql`
          INSERT INTO task (id, root_session_id, label, policy, time_created, time_updated)
          VALUES ('tsk_legacy', 'ses_legacy', 'legacy', 'test', 1, 1)
        `)
        yield* db.run(sql`
          INSERT INTO task_acceptance (id, task_id, outcome, source, note, time_created, time_updated)
          VALUES ('tac_legacy', 'tsk_legacy', 'accepted', 'test', 'before evidence', 1, 1)
        `)

        yield* DatabaseMigration.applyOnly(db, [addTaskAcceptanceEvidence])
        // Replaying the same migration must not try to add the columns twice.
        yield* DatabaseMigration.applyOnly(db, [addTaskAcceptanceEvidence])

        expect((yield* columnsOf(db)).map((column) => column.name)).toEqual(
          expect.arrayContaining(evidenceColumns),
        )
        expect(
          yield* db.get(sql`
            SELECT id, evidence_kind, evidence_reference, evidence_result, evidence_executed, evidence_duration_ms
            FROM task_acceptance
          `),
        ).toEqual({
          id: "tac_legacy",
          evidence_kind: null,
          evidence_reference: null,
          evidence_result: null,
          evidence_executed: null,
          evidence_duration_ms: null,
        })

        const storeLayer = TaskStore.layer.pipe(
          Layer.provide(Layer.succeed(Database.Service, Database.Service.of({ db }))),
        )
        const history = yield* Effect.gen(function* () {
          const store = yield* TaskStore.Service
          return yield* store.history(Task.ID.make("tsk_legacy"))
        }).pipe(Effect.provide(storeLayer))

        expect(history).toHaveLength(1)
        expect(history[0]).toMatchObject({ outcome: "accepted", source: "test", verification: "unverified" })
      }),
    )
  })

  test("applies every migration to a fresh database and exposes the evidence columns", async () => {
    await run(
      Effect.gen(function* () {
        const db = yield* makeDb
        yield* DatabaseMigration.apply(db)

        expect((yield* columnsOf(db)).map((column) => column.name)).toEqual(
          expect.arrayContaining(evidenceColumns),
        )
        expect(
          yield* db.get(sql`SELECT count(*) AS count FROM migration WHERE id = ${addTaskAcceptanceEvidence.id}`),
        ).toEqual({ count: 1 })
      }),
    )
  })
})
