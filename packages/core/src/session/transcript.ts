export * as SessionTranscript from "./transcript.js"

import { and, asc, desc, eq, gt, lt, notExists, sql } from "drizzle-orm"
import { Clock, DateTime, Effect } from "effect"
import { Database } from "../database/database.js"
import { SessionHistory } from "./history.js"
import { SessionMessage } from "./message.js"
import { SessionRecentText } from "./recent-text.js"
import type { SessionSchema } from "./schema.js"
import { SessionMessageTable, SessionMessageTextTable } from "./sql.js"
import type { SessionStored } from "./stored.js"

type DatabaseShape = Database.Interface["db"]

/** Tool output kept per call. Full outputs stay in `session_message`; the index exists to find the message again. */
const TOOL_OUTPUT_MAX_CHARS = 4_000

/** One searchable message. Summaries and file lists are much larger than excerpts, so cap the stored rendering. */
const MESSAGE_MAX_CHARS = 20_000
const SNIPPET_MAX_CHARS = 400
const NEIGHBOR_MAX_CHARS = 600
const BACKFILL_BATCH = 500

export const DEFAULT_SEARCH_LIMIT = 10
export const MAX_SEARCH_LIMIT = 50
export const MAX_NEIGHBORS = 3

export type SearchInput = {
  readonly sessionID: SessionSchema.ID
  readonly query: string
  readonly type?: SessionMessage.Type
  readonly limit?: number
}

export type SearchHit = {
  readonly messageID: SessionMessage.ID
  readonly seq: number
  readonly type: SessionMessage.Type
  readonly timeCreated: number
  readonly snippet: string
}

export type Neighbor = {
  readonly messageID: SessionMessage.ID
  readonly seq: number
  readonly type: SessionMessage.Type
  readonly timeCreated: number
  readonly text: string
}

export type ReadInput = {
  readonly sessionID: SessionSchema.ID
  readonly messageID: SessionMessage.ID
  readonly before?: number
  readonly after?: number
}

export type ReadResult = {
  readonly message: Neighbor
  readonly before: ReadonlyArray<Neighbor>
  readonly after: ReadonlyArray<Neighbor>
}

/**
 * Add a completed message to the search index. Projection calls this on every write, so incomplete streaming
 * messages return immediately and the completed write replaces their absence.
 */
export const index = (
  db: DatabaseShape,
  input: {
    readonly sessionID: SessionSchema.ID
    readonly seq: number
    readonly message: SessionMessage.Info | SessionStored.User
  },
) => {
  if (!complete(input.message)) return Effect.void
  return write(db, {
    sessionID: input.sessionID,
    seq: input.seq,
    messageID: input.message.id,
    type: input.message.type,
    timeCreated: DateTime.toEpochMillis(input.message.time.created),
    text: SessionRecentText.truncateText(render(input.message), MESSAGE_MAX_CHARS),
  })
}

/** Index completed messages written before this feature existed. Idempotent, and bounded per batch. */
export const ensure = (db: DatabaseShape, sessionID: SessionSchema.ID) =>
  Effect.gen(function* () {
    let messages = 0
    while (true) {
      const rows = yield* db
        .select()
        .from(SessionMessageTable)
        .where(
          and(
            eq(SessionMessageTable.session_id, sessionID),
            completed,
            notExists(
              db
                .select({ messageID: SessionMessageTextTable.message_id })
                .from(SessionMessageTextTable)
                .where(eq(SessionMessageTextTable.message_id, SessionMessageTable.id)),
            ),
          ),
        )
        .orderBy(asc(SessionMessageTable.seq))
        .limit(BACKFILL_BATCH)
        .all()
        .pipe(Effect.orDie)
      if (rows.length === 0) break

      yield* Effect.forEach(
        rows,
        (row) =>
          Effect.gen(function* () {
            const message = yield* Effect.try(() => SessionHistory.decodeMessageRowSync(row)).pipe(
              Effect.orElseSucceed(() => undefined),
            )
            yield* write(db, {
              sessionID,
              seq: row.seq,
              messageID: row.id,
              type: row.type,
              timeCreated: row.time_created,
              // A row that no longer decodes still gets an empty entry so it cannot block later batches.
              text: message ? SessionRecentText.truncateText(render(message), MESSAGE_MAX_CHARS) : "",
            })
          }),
        { discard: true },
      )
      messages += rows.length
      if (rows.length < BACKFILL_BATCH) break
    }
    if (messages > 0) yield* Effect.logInfo("session transcript index", { sessionID, messages })
  })

export const search = (db: DatabaseShape, input: SearchInput) =>
  Effect.gen(function* () {
    const match = toMatch(input.query)
    if (!match) return []
    yield* ensure(db, input.sessionID)
    const startedAt = yield* Clock.currentTimeMillis
    const limit = Math.min(Math.max(input.limit ?? DEFAULT_SEARCH_LIMIT, 1), MAX_SEARCH_LIMIT)
    const rows = yield* db
      .all<{
        message_id: string
        seq: number
        type: string
        time_created: number
        snippet: string
      }>(sql`
        SELECT
          t.message_id AS message_id,
          t.seq AS seq,
          t.type AS type,
          t.time_created AS time_created,
          snippet(\`session_message_fts\`, 0, '>>>', '<<<', '…', 48) AS snippet
        FROM \`session_message_fts\`
        JOIN \`session_message_text\` AS t ON t.rowid = \`session_message_fts\`.rowid
        WHERE \`session_message_fts\` MATCH ${match}
          AND t.session_id = ${input.sessionID}
          ${input.type === undefined ? sql`` : sql`AND t.type = ${input.type}`}
        ORDER BY rank
        LIMIT ${limit}
      `)
      .pipe(Effect.orDie)
    yield* Effect.logInfo("session transcript search", {
      sessionID: input.sessionID,
      matches: rows.length,
      limit,
      durationMs: (yield* Clock.currentTimeMillis) - startedAt,
    })
    return rows.map(
      (row): SearchHit => ({
        messageID: row.message_id as SessionMessage.ID,
        seq: row.seq,
        type: row.type as SessionMessage.Type,
        timeCreated: row.time_created,
        snippet: SessionRecentText.truncateText(row.snippet, SNIPPET_MAX_CHARS),
      }),
    )
  })

export const read = (db: DatabaseShape, input: ReadInput) =>
  Effect.gen(function* () {
    yield* ensure(db, input.sessionID)
    const row = yield* db
      .select()
      .from(SessionMessageTextTable)
      .where(
        and(
          eq(SessionMessageTextTable.session_id, input.sessionID),
          eq(SessionMessageTextTable.message_id, input.messageID),
        ),
      )
      .get()
      .pipe(Effect.orDie)
    if (!row) return undefined
    return {
      message: {
        messageID: row.message_id,
        seq: row.seq,
        type: row.type,
        timeCreated: row.time_created,
        text: SessionRecentText.truncateText(row.text, MESSAGE_MAX_CHARS),
      },
      before: yield* neighbors(db, input.sessionID, row.seq, "before", Math.min(input.before ?? 0, MAX_NEIGHBORS)),
      after: yield* neighbors(db, input.sessionID, row.seq, "after", Math.min(input.after ?? 0, MAX_NEIGHBORS)),
    } satisfies ReadResult
  })

/** Strip FTS syntax so arbitrary model text becomes a plain AND of quoted terms and phrases. */
export const toMatch = (query: string) =>
  (query.match(/"[^"]*"|\S+/g) ?? [])
    .map((phrase) => {
      const text = phrase.startsWith('"') && phrase.endsWith('"') ? phrase.slice(1, -1) : phrase
      return `"${text.replaceAll('"', '""')}"`
    })
    .filter((phrase) => phrase.length > 2)
    .join(" ")

const completed = sql`(
  ${SessionMessageTable.type} IN ('user', 'synthetic', 'skill', 'location-switched')
  OR (
    ${SessionMessageTable.type} IN ('assistant', 'shell')
    AND json_extract(${SessionMessageTable.data}, '$.time.completed') IS NOT NULL
  )
  OR (
    ${SessionMessageTable.type} = 'compaction'
    AND json_extract(${SessionMessageTable.data}, '$.status') = 'completed'
  )
)`

const complete = (message: SessionMessage.Info | SessionStored.User) => {
  switch (message.type) {
    case "assistant":
    case "shell":
      return message.time.completed !== undefined
    case "compaction":
      return message.status === "completed"
    // Keep this list in step with the `completed` predicate used by backfill.
    case "user":
    case "synthetic":
    case "skill":
    case "location-switched":
      return true
    default:
      return false
  }
}

const render = (message: SessionMessage.Info | SessionStored.User) => {
  if (message.type === "compaction")
    return message.status === "completed" ? `[Compaction summary]\n${message.summary}` : ""
  return SessionRecentText.messageToText(message, { toolOutputMaxChars: TOOL_OUTPUT_MAX_CHARS })
}

const write = (
  db: DatabaseShape,
  input: {
    readonly sessionID: SessionSchema.ID
    readonly seq: number
    readonly messageID: SessionMessage.ID
    readonly type: SessionMessage.Type
    readonly timeCreated: number
    readonly text: string
  },
) =>
  db
    .insert(SessionMessageTextTable)
    .values({
      message_id: input.messageID,
      session_id: input.sessionID,
      seq: input.seq,
      type: input.type,
      time_created: input.timeCreated,
      text: input.text,
    })
    .onConflictDoUpdate({
      target: SessionMessageTextTable.message_id,
      set: {
        seq: input.seq,
        type: input.type,
        time_created: input.timeCreated,
        text: input.text,
      },
    })
    .run()
    .pipe(Effect.orDie, Effect.asVoid)

const neighbors = (
  db: DatabaseShape,
  sessionID: SessionSchema.ID,
  seq: number,
  direction: "before" | "after",
  count: number,
) =>
  Effect.gen(function* () {
    if (count <= 0) return []
    const rows = yield* db
      .select()
      .from(SessionMessageTextTable)
      .where(
        and(
          eq(SessionMessageTextTable.session_id, sessionID),
          direction === "before" ? lt(SessionMessageTextTable.seq, seq) : gt(SessionMessageTextTable.seq, seq),
        ),
      )
      .orderBy(direction === "before" ? desc(SessionMessageTextTable.seq) : asc(SessionMessageTextTable.seq))
      .limit(count)
      .all()
      .pipe(Effect.orDie)
    return (direction === "before" ? rows.toReversed() : rows).map(toNeighbor)
  })

const toNeighbor = (row: typeof SessionMessageTextTable.$inferSelect): Neighbor => ({
  messageID: row.message_id,
  seq: row.seq,
  type: row.type,
  timeCreated: row.time_created,
  text: SessionRecentText.truncateText(row.text, NEIGHBOR_MAX_CHARS),
})
