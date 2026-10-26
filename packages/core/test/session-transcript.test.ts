import { describe, expect } from "bun:test"
import { eq, sql } from "drizzle-orm"
import { DateTime, Effect, Schema } from "effect"
import { Bus } from "@opencode/core/bus"
import { Database } from "@opencode/core/database/database"
import { DatabaseFts } from "@opencode/core/database/fts"
import { AppNodeBuilder } from "@opencode/core/effect/app-node-builder"
import { ProjectTable } from "@opencode/core/project/sql"
import { SessionProjector } from "@opencode/core/session/projector"
import { SessionMessageTable, SessionMessageTextTable, SessionTable } from "@opencode/core/session/sql"
import { SessionTranscript } from "@opencode/core/session/transcript"
import { Agent } from "@opencode/schema/agent"
import { Model } from "@opencode/schema/model"
import { Project } from "@opencode/schema/project"
import { Provider } from "@opencode/schema/provider"
import { AbsolutePath } from "@opencode/schema/schema"
import { Session } from "@opencode/schema/session"
import { SessionEvent } from "@opencode/schema/session-event"
import { SessionMessage } from "@opencode/schema/session-message"
import { Shell } from "@opencode/schema/shell"
import { LayerNode } from "@opencode/util/effect/layer-node"
import { testEffect } from "./lib/effect"

const encode = Schema.encodeSync(SessionMessage.Info)
const first = Session.ID.make("ses_transcript")
const second = Session.ID.make("ses_transcript_other")
const created = DateTime.makeUnsafe(Date.UTC(2026, 0, 1, 12))

const it = testEffect(AppNodeBuilder.build(LayerNode.group([Database.node])))

const row = (
  sessionID: Session.ID,
  seq: number,
  message: SessionMessage.Info,
): typeof SessionMessageTable.$inferInsert => {
  const encoded = encode(message)
  const { id, type, ...data } = encoded
  return {
    id: SessionMessage.ID.make(id),
    session_id: sessionID,
    type,
    seq,
    time_created: encoded.time.created,
    data,
  }
}

const user = (text: string, id = `msg_${Math.random().toString(36).slice(2)}`) =>
  SessionMessage.User.make({ id: SessionMessage.ID.make(id), type: "user", text, time: { created } })

const assistant = (text: string, done: boolean, id = `msg_${Math.random().toString(36).slice(2)}`) =>
  SessionMessage.Assistant.make({
    id: SessionMessage.ID.make(id),
    type: "assistant",
    agent: Agent.ID.make("build"),
    model: { id: Model.ID.make("claude"), providerID: Provider.ID.make("anthropic") },
    content: [SessionMessage.AssistantText.make({ type: "text", text })],
    time: done ? { created, completed: created } : { created },
  })

const shell = (command: string, output: string) =>
  SessionMessage.Shell.make({
    id: SessionMessage.ID.make(`msg_${Math.random().toString(36).slice(2)}`),
    type: "shell",
    shellID: Shell.ID.make("sh_transcript"),
    command,
    status: "exited",
    output: { output, cursor: output.length, size: output.length, truncated: false },
    time: { created, completed: created },
  })

const seed = Effect.gen(function* () {
  const db = (yield* Database.Service).db
  yield* db
    .insert(ProjectTable)
    .values({ id: Project.ID.global, worktree: AbsolutePath.make("/project"), sandboxes: [] })
    .run()
  yield* db
    .insert(SessionTable)
    .values([
      {
        id: first,
        project_id: Project.ID.global,
        slug: "transcript",
        directory: "/project",
        title: "transcript",
        version: "test",
      },
      {
        id: second,
        project_id: Project.ID.global,
        slug: "transcript-other",
        directory: "/project",
        title: "transcript other",
        version: "test",
      },
    ])
    .run()
  return db
})

describe("SessionTranscript", () => {
  it.effect("backfills completed messages and returns bounded snippets", () =>
    Effect.gen(function* () {
      const db = yield* seed
      yield* db
        .insert(SessionMessageTable)
        .values([
          row(first, 1, user("We should use SQLite FTS for transcript retrieval.")),
          row(first, 2, assistant("The checkpoint cache read was only six percent warm.", true, "msg_warm")),
          row(first, 3, user("Unrelated request about formatting.")),
        ])
        .run()

      const matches = yield* SessionTranscript.search(db, { sessionID: first, query: "checkpoint cache" })
      const match = matches[0]!
      expect(match).toMatchObject({ messageID: "msg_warm", seq: 2, type: "assistant" })
      expect(match.snippet).toContain("checkpoint")
      expect(match.snippet.length).toBeLessThanOrEqual(412)

      const indexed = yield* db.select().from(SessionMessageTextTable).all()
      expect(indexed).toHaveLength(3)
      expect(indexed.map((entry) => entry.message_id)).toContain(SessionMessage.ID.make("msg_warm"))
    }),
  )

  it.effect("does not index an incomplete assistant message until it completes", () =>
    Effect.gen(function* () {
      const db = yield* seed
      const partial = assistant("partial detail about the migration", false, "msg_partial")
      yield* db.insert(SessionMessageTable).values(row(first, 1, partial)).run()

      expect(yield* SessionTranscript.search(db, { sessionID: first, query: "migration" })).toEqual([])

      const completed = assistant("partial detail about the migration", true, "msg_partial")
      yield* SessionTranscript.index(db, { sessionID: first, seq: 1, message: completed })
      expect(yield* SessionTranscript.search(db, { sessionID: first, query: "migration" })).toMatchObject([
        { messageID: "msg_partial" },
      ])
    }),
  )

  it.effect("filters by message type and respects the limit", () =>
    Effect.gen(function* () {
      const db = yield* seed
      yield* db
        .insert(SessionMessageTable)
        .values([
          row(first, 1, user("checkpoint cache one")),
          row(first, 2, user("checkpoint cache two")),
          row(first, 3, shell("rg checkpoint", "checkpoint cache three")),
        ])
        .run()

      expect(yield* SessionTranscript.search(db, { sessionID: first, query: "checkpoint", type: "shell" })).toMatchObject(
        [{ type: "shell", seq: 3 }],
      )
      expect(yield* SessionTranscript.search(db, { sessionID: first, query: "checkpoint", limit: 1 })).toHaveLength(1)
    }),
  )

  it.effect("searches only the current session", () =>
    Effect.gen(function* () {
      const db = yield* seed
      yield* db
        .insert(SessionMessageTable)
        .values([
          row(first, 1, user("first session checkpoint")),
          row(second, 1, user("second session checkpoint", "msg_other")),
        ])
        .run()

      const only = yield* SessionTranscript.search(db, { sessionID: first, query: "checkpoint" })
      expect(only).toMatchObject([{ seq: 1 }])
      expect(only.map((match) => match.messageID)).not.toContain("msg_other")
      expect(
        yield* SessionTranscript.read(db, {
          sessionID: first,
          messageID: SessionMessage.ID.make("msg_other"),
        }),
      ).toBeUndefined()
    }),
  )

  it.effect("reads a message in full with bounded neighbors", () =>
    Effect.gen(function* () {
      const db = yield* seed
      yield* db
        .insert(SessionMessageTable)
        .values([
          row(first, 1, user("first")),
          row(first, 2, user("second checkpoint message")),
          row(first, 3, user("third")),
        ])
        .run()

      const found = yield* SessionTranscript.search(db, { sessionID: first, query: "checkpoint" })
      const result = yield* SessionTranscript.read(db, {
        sessionID: first,
        messageID: found[0]!.messageID,
        before: 1,
        after: 1,
      })
      expect(result).toMatchObject({
        message: { seq: 2, text: "[User]: second checkpoint message" },
        before: [{ seq: 1, text: "[User]: first" }],
        after: [{ seq: 3, text: "[User]: third" }],
      })
    }),
  )

  it.effect("truncates long messages and tool output in the index", () =>
    Effect.gen(function* () {
      const db = yield* seed
      const text = `start ${"x".repeat(25_000)} end`
      yield* db.insert(SessionMessageTable).values(row(first, 1, user(text))).run()

      const result = yield* SessionTranscript.read(db, {
        sessionID: first,
        messageID: SessionMessage.ID.make("msg_missing"),
      })
      expect(result).toBeUndefined()

      const found = yield* SessionTranscript.search(db, { sessionID: first, query: "start" })
      const message = yield* SessionTranscript.read(db, { sessionID: first, messageID: found[0]!.messageID })
      expect(message!.message.text).toContain("[truncated]")
      expect(message!.message.text.length).toBeLessThan(20_100)
    }),
  )

  it.effect("replaces the indexed text when a message is updated", () =>
    Effect.gen(function* () {
      const db = yield* seed
      const message = user("checkpoint alpha")
      yield* db.insert(SessionMessageTable).values(row(first, 1, message)).run()
      yield* SessionTranscript.index(db, { sessionID: first, seq: 1, message })
      expect(yield* SessionTranscript.search(db, { sessionID: first, query: "alpha" })).toHaveLength(1)

      yield* SessionTranscript.index(db, {
        sessionID: first,
        seq: 1,
        message: user("checkpoint beta", message.id),
      })
      expect(yield* SessionTranscript.search(db, { sessionID: first, query: "alpha" })).toEqual([])
      expect(yield* SessionTranscript.search(db, { sessionID: first, query: "beta" })).toHaveLength(1)
    }),
  )

  it.effect("removes search entries when a message is deleted", () =>
    Effect.gen(function* () {
      const db = yield* seed
      yield* db.insert(SessionMessageTable).values(row(first, 1, user("temporary checkpoint"))).run()
      const found = yield* SessionTranscript.search(db, { sessionID: first, query: "temporary" })
      expect(found).toHaveLength(1)

      yield* db.delete(SessionMessageTable).where(eq(SessionMessageTable.id, found[0]!.messageID)).run()
      expect(yield* SessionTranscript.search(db, { sessionID: first, query: "temporary" })).toEqual([])
    }),
  )

  it.effect("removes search entries when a session is deleted", () =>
    Effect.gen(function* () {
      const db = yield* seed
      yield* db.insert(SessionMessageTable).values(row(second, 1, user("session cascade checkpoint"))).run()
      expect(yield* SessionTranscript.search(db, { sessionID: second, query: "cascade" })).toHaveLength(1)

      yield* db.delete(SessionTable).where(eq(SessionTable.id, second)).run()
      expect(yield* SessionTranscript.search(db, { sessionID: second, query: "cascade" })).toEqual([])
      expect(yield* db.select().from(SessionMessageTextTable).all()).toEqual([])
    }),
  )

  it.effect("rebuilds the index when the virtual table is recreated", () =>
    Effect.gen(function* () {
      const db = yield* seed
      yield* db.insert(SessionMessageTable).values(row(first, 1, user("rebuild checkpoint"))).run()
      expect(yield* SessionTranscript.search(db, { sessionID: first, query: "rebuild" })).toHaveLength(1)

      yield* db.run(sql`DROP TABLE session_message_fts`)
      yield* DatabaseFts.bootstrap(db)
      expect(yield* SessionTranscript.search(db, { sessionID: first, query: "rebuild" })).toHaveLength(1)
    }),
  )

  it.effect("treats FTS syntax characters as plain search text", () =>
    Effect.gen(function* () {
      const db = yield* seed
      yield* db.insert(SessionMessageTable).values(row(first, 1, user('literal "checkpoint NEAR cache" text'))).run()

      expect(yield* SessionTranscript.search(db, { sessionID: first, query: 'checkpoint "NEAR cache"' })).toHaveLength(1)
      expect(yield* SessionTranscript.search(db, { sessionID: first, query: "checkpoint OR missing" })).toEqual([])
      expect(SessionTranscript.toMatch('cache "checkpoint summary"')).toBe('"cache" "checkpoint summary"')
    }),
  )
})

describe("SessionTranscript projection", () => {
  const projected = testEffect(
    AppNodeBuilder.build(LayerNode.group([Database.node, Bus.node, SessionProjector.node])),
  )

  projected.effect("indexes a projected message as it is written", () =>
    Effect.gen(function* () {
      const db = yield* seed
      const bus = yield* Bus.Service
      yield* bus.publish(SessionEvent.Synthetic, { sessionID: first, text: "projected checkpoint detail" })

      const found = yield* SessionTranscript.search(db, { sessionID: first, query: "projected checkpoint" })
      expect(found).toMatchObject([{ type: "synthetic", seq: 0 }])
    }),
  )
})
