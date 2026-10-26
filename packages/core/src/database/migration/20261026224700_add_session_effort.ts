import { Effect } from "effect"
import type { DatabaseMigration } from "../migration.js"

const migration: DatabaseMigration.Migration = {
  id: "20261026224700_add_session_effort",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`
        CREATE TABLE \`session_effort\` (
          \`session_id\` text PRIMARY KEY,
          \`base_level\` text NOT NULL,
          \`open_failure\` text,
          \`revision\` integer DEFAULT 0 NOT NULL,
          \`last_applied_variant\` text,
          CONSTRAINT \`fk_session_effort_session_id_session_v2_id_fk\` FOREIGN KEY (\`session_id\`) REFERENCES \`session_v2\`(\`id\`) ON DELETE CASCADE
        );
      `)
    })
  },
}

export default migration
