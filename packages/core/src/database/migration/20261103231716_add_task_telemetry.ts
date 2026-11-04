import { Effect } from "effect"
import type { DatabaseMigration } from "../migration.js"

const migration: DatabaseMigration.Migration = {
  id: "20261103231716_add_task_telemetry",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`
        CREATE TABLE \`task_acceptance\` (
          \`id\` text PRIMARY KEY,
          \`task_id\` text NOT NULL,
          \`outcome\` text NOT NULL,
          \`source\` text NOT NULL,
          \`note\` text,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          CONSTRAINT \`fk_task_acceptance_task_id_task_id_fk\` FOREIGN KEY (\`task_id\`) REFERENCES \`task\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`task\` (
          \`id\` text PRIMARY KEY,
          \`root_session_id\` text NOT NULL,
          \`label\` text,
          \`policy\` text,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          CONSTRAINT \`fk_task_root_session_id_session_v2_id_fk\` FOREIGN KEY (\`root_session_id\`) REFERENCES \`session_v2\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(
        `CREATE INDEX \`task_acceptance_task_idx\` ON \`task_acceptance\` (\`task_id\`,\`time_created\`,\`id\`);`,
      )
      yield* tx.run(`CREATE UNIQUE INDEX \`task_root_session_idx\` ON \`task\` (\`root_session_id\`);`)
      yield* tx.run(`CREATE INDEX \`task_time_created_idx\` ON \`task\` (\`time_created\`);`)
    })
  },
}

export default migration
