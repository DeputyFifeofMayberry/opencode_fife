import { Effect } from "effect"
import type { DatabaseMigration } from "../migration.js"

const migration: DatabaseMigration.Migration = {
  id: "20261029214951_add_session_effort_verdict",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`ALTER TABLE \`session_effort\` ADD \`verdict_revision\` integer;`)
      yield* tx.run(`ALTER TABLE \`session_effort\` ADD \`verdict_digest\` text;`)
    })
  },
}

export default migration
