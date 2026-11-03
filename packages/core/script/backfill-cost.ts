import { Database } from "bun:sqlite"
import os from "node:os"
import path from "node:path"
import { reprice, type Catalog, type StoredCost } from "../src/backfill-cost"

/**
 * Reprices estimated step costs with the price windows the catalog carries now.
 *
 * Without `--apply` it only reports. With `--apply` it snapshots every affected
 * row, rewrites the message costs, and recomputes the session totals in one
 * transaction. Provider-reported and unpriced rows are never touched.
 */

const apply = process.argv.includes("--apply")
const dbPath = process.argv.find((value, index) => index > 1 && !value.startsWith("--")) ??
  path.join(os.homedir(), ".local/share/opencode/opencode.db")
const snapshot = (await Bun.file(new URL("../src/models-dev/snapshot.txt", import.meta.url)).json()) as Catalog

const db = new Database(dbPath, { readonly: !apply })
db.exec("pragma busy_timeout = 5000")

type Row = { id: string; sessionID: string; data: string }
const rows = db
  .query(
    `select id, session_id as sessionID, data from session_message
     where type = 'assistant'
       and json_extract(data, '$.costProvenance.estimated') is not null`,
  )
  .all() as Row[]

const skipped = new Map<string, number>()
const updates: { id: string; sessionID: string; data: string; cost: number }[] = []
let scanned = 0
let recorded = 0
let corrected = 0

for (const row of rows) {
  const message = JSON.parse(row.data) as {
    cost?: number
    costProvenance?: StoredCost["costProvenance"]
    tokens?: StoredCost["tokens"]
    model?: { providerID?: string; id?: string }
    time?: { created?: number; completed?: number }
  }
  const tokens = message.tokens
  const providerID = message.model?.providerID
  const modelID = message.model?.id
  const at = message.time?.completed ?? message.time?.created
  if (!tokens || !providerID || !modelID || at === undefined) continue

  scanned += 1
  const stored: StoredCost = {
    providerID,
    modelID,
    tokens,
    at,
    cost: message.cost ?? 0,
    costProvenance: message.costProvenance ?? {},
  }
  const result = reprice(stored, snapshot)
  recorded += stored.cost
  if (result === "skipped") {
    const key = `${providerID}/${modelID}`
    skipped.set(key, (skipped.get(key) ?? 0) + 1)
    corrected += stored.cost
    continue
  }
  corrected += result.cost
  if (!result.changed) continue
  updates.push({
    id: row.id,
    sessionID: row.sessionID,
    cost: result.cost,
    data: JSON.stringify({
      ...message,
      cost: result.cost,
      costProvenance: { ...message.costProvenance, estimated: result.cost },
    }),
  })
}

console.log(`database: ${dbPath}`)
console.log(`estimated rows scanned: ${scanned}`)
console.log(`rows that would change: ${updates.length}`)
console.log(`recorded total: $${recorded.toFixed(4)}`)
console.log(`corrected total: $${corrected.toFixed(4)}`)
console.log(`delta: $${(corrected - recorded).toFixed(4)}`)
if (skipped.size) {
  console.log("skipped by model (left exactly as recorded):")
  for (const [model, count] of [...skipped].sort((a, b) => b[1] - a[1])) console.log(`  ${model}: ${count}`)
}

if (!apply) {
  console.log("dry run: no rows were written. Re-run with --apply to write them.")
  db.close()
  process.exit(0)
}

if (!updates.length) {
  console.log("nothing to write.")
  db.close()
  process.exit(0)
}

const backup = path.join(path.dirname(dbPath), `backfill-cost-backup-${Date.now()}.jsonl`)
await Bun.write(backup, updates.map((row) => JSON.stringify({ id: row.id, data: row.data })).join("\n") + "\n")
console.log(`backup: ${backup} (${updates.length} rows)`)

const affected = [...new Set(updates.map((row) => row.sessionID))]
const write = db.transaction(() => {
  const update = db.prepare("update session_message set data = ? where id = ?")
  for (const row of updates) update.run(row.data, row.id)

  // A session's own total is the sum of its message costs; a parent also carries its children's.
  const own = db
    .query(
      `select session_id as id, sum(coalesce(json_extract(data, '$.cost'), 0)) as cost
       from session_message where type = 'assistant' group by session_id`,
    )
    .all() as { id: string; cost: number }[]
  const totals = new Map(own.map((entry) => [entry.id, entry.cost]))
  const children = db.query("select id, parent_id as parentID from session_v2 where parent_id is not null").all() as {
    id: string
    parentID: string
  }[]
  for (const child of children) {
    totals.set(child.parentID, (totals.get(child.parentID) ?? 0) + (totals.get(child.id) ?? 0))
  }
  const setCost = db.prepare("update session_v2 set cost = ? where id = ?")
  const touched = new Set(affected)
  for (const child of children) if (affected.includes(child.id)) touched.add(child.parentID)
  for (const id of touched) setCost.run(totals.get(id) ?? 0, id)
  return touched.size
})

const sessions = write()
db.close()
console.log(`wrote ${updates.length} message rows and ${sessions} session totals.`)
