export * as DatabaseFts from "./fts.js"

import { sql } from "drizzle-orm"
import { Effect } from "effect"
import type { EffectDrizzleSqlite } from "./drizzle.js"

type Database = EffectDrizzleSqlite.EffectSQLiteDatabase

/**
 * `session_message_text` keeps the durable rendering; FTS5 indexes it as external content so the text is not
 * stored twice. Drizzle cannot describe virtual tables or triggers, and fresh databases bootstrap from
 * `schema.gen.ts` alone, so every database creates this after migrations.
 */
export function bootstrap(db: Database) {
  return Effect.gen(function* () {
    const existing = yield* db
      .get<{ name: string }>(sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'session_message_fts'`)
      .pipe(Effect.orDie)

    if (!existing)
      yield* db.run(sql`
        CREATE VIRTUAL TABLE session_message_fts USING fts5(
          text,
          content = 'session_message_text',
          content_rowid = 'rowid',
          tokenize = 'unicode61 remove_diacritics 2'
        )
      `)

    // Keep the index in step with inserts, rewrites, and FK cascades from message or session deletes.
    yield* db.run(sql`
      CREATE TRIGGER IF NOT EXISTS session_message_text_fts_insert AFTER INSERT ON session_message_text BEGIN
        INSERT INTO session_message_fts (rowid, text) VALUES (new.rowid, new.text);
      END
    `)
    yield* db.run(sql`
      CREATE TRIGGER IF NOT EXISTS session_message_text_fts_delete AFTER DELETE ON session_message_text BEGIN
        INSERT INTO session_message_fts (session_message_fts, rowid, text)
        VALUES ('delete', old.rowid, old.text);
      END
    `)
    yield* db.run(sql`
      CREATE TRIGGER IF NOT EXISTS session_message_text_fts_update AFTER UPDATE ON session_message_text BEGIN
        INSERT INTO session_message_fts (session_message_fts, rowid, text)
        VALUES ('delete', old.rowid, old.text);
        INSERT INTO session_message_fts (rowid, text) VALUES (new.rowid, new.text);
      END
    `)

    // Rows can exist before their index when a database was written by a build that did not create it yet.
    if (!existing)
      yield* db.run(sql`INSERT INTO session_message_fts (session_message_fts) VALUES ('rebuild')`)
  }).pipe(Effect.orDie)
}
