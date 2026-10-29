import { Effect } from "effect"
import type { DatabaseMigration } from "../migration.js"

const migration: DatabaseMigration.Migration = {
  id: "20261029205453_add_session_effort_adaptive",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`ALTER TABLE \`session_effort\` ADD \`level\` text;`)
      yield* tx.run(`ALTER TABLE \`session_effort\` ADD \`clean_passes\` integer DEFAULT 0 NOT NULL;`)
    })
  },
}

export default migration
