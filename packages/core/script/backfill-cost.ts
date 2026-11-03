import { Database } from "bun:sqlite"
import os from "node:os"
import path from "node:path"
import { reprice, type Catalog, type StoredCost } from "../src/backfill-cost"

/**
 * Dry-run report for the price-window backfill. Writing to the database is a
 * separate, explicitly approved step; this script never mutates it.
 */

const dbPath = process.argv[2] ?? path.join(os.homedir(), ".local/share/opencode/opencode.db")
const snapshot = (await Bun.file(new URL("../src/models-dev/snapshot.txt", import.meta.url)).json()) as Catalog

const db = new Database(dbPath, { readonly: true })
const rows = db
  .query(
    `select data from session_message
     where type = 'assistant'
       and json_extract(data, '$.costProvenance.estimated') is not null`,
  )
  .all() as { data: string }[]
db.close()

const skipped = new Map<string, number>()
let scanned = 0
let changed = 0
let recorded = 0
let corrected = 0

for (const { data } of rows) {
  const message = JSON.parse(data) as {
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
  if (result.changed) changed += 1
}

console.log(`database: ${dbPath}`)
console.log(`estimated rows scanned: ${scanned}`)
console.log(`rows that would change: ${changed}`)
console.log(`recorded total: $${recorded.toFixed(4)}`)
console.log(`corrected total: $${corrected.toFixed(4)}`)
console.log(`delta: $${(corrected - recorded).toFixed(4)}`)
if (skipped.size) {
  console.log("skipped by model (left exactly as recorded):")
  for (const [model, count] of [...skipped].sort((a, b) => b[1] - a[1])) console.log(`  ${model}: ${count}`)
}
console.log("no rows were written; this script is read-only.")
