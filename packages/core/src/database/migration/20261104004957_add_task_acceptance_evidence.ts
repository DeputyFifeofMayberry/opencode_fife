import { Effect } from "effect"
import type { DatabaseMigration } from "../migration.js"

const migration: DatabaseMigration.Migration = {
  id: "20261104004957_add_task_acceptance_evidence",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`ALTER TABLE \`task_acceptance\` ADD \`evidence_kind\` text;`)
      yield* tx.run(`ALTER TABLE \`task_acceptance\` ADD \`evidence_reference\` text;`)
      yield* tx.run(`ALTER TABLE \`task_acceptance\` ADD \`evidence_result\` text;`)
      yield* tx.run(`ALTER TABLE \`task_acceptance\` ADD \`evidence_executed\` integer;`)
      yield* tx.run(`ALTER TABLE \`task_acceptance\` ADD \`evidence_duration_ms\` integer;`)
    })
  },
}

export default migration
