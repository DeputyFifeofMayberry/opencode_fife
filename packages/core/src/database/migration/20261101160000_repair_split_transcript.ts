import { Effect } from "effect"
import type { DatabaseMigration } from "../migration.js"

const migration: DatabaseMigration.Migration = {
  id: "20261101160000_repair_split_transcript",
  up(tx) {
    return Effect.gen(function* () {
      // Older backfills rendered split assistant rows without loading their parts.
      // Remove only their empty index entries so the next search rebuilds them.
      yield* tx.run(`
        DELETE FROM session_message_text
        WHERE type = 'assistant' AND text = ''
          AND EXISTS (SELECT 1 FROM session_part WHERE session_part.message_id = session_message_text.message_id)
      `)
    })
  },
}

export default migration
