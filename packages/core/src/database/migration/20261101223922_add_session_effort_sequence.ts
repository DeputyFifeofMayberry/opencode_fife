import { Effect } from "effect"
import type { DatabaseMigration } from "../migration.js"

/**
 * Give existing sessions an observation order at or above any open failure they already
 * carry, so a single qualifying pass can still clear it. The old counter was
 * `latest event sequence + 1`, so the session's latest event sequence is a safe floor.
 */
export const backfillEvidenceSequence = `UPDATE \`session_effort\`
SET \`evidence_sequence\` = max(0, coalesce(
  (SELECT \`seq\` FROM \`event_sequence\` WHERE \`aggregate_id\` = \`session_effort\`.\`session_id\`), -1))`

const migration: DatabaseMigration.Migration = {
  id: "20261101223922_add_session_effort_sequence",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`ALTER TABLE \`session_effort\` ADD \`evidence_sequence\` integer DEFAULT 0 NOT NULL;`)
      yield* tx.run(backfillEvidenceSequence)
    })
  },
}

export default migration
