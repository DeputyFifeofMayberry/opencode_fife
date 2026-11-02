import { Database } from "bun:sqlite"
import { readFileSync } from "node:fs"
import path from "node:path"

const dataDir = path.join(import.meta.dir, "data")
const opencodeDir = path.join(process.env.USERPROFILE!, ".local/share/opencode")
const db = () => new Database(path.join(opencodeDir, "opencode.db"), { readonly: true })
const readJsonlAbs = (file: string) =>
  readFileSync(file, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line))

const mode = process.argv[2]

if (mode === "schema") {
  const required = [
    "id",
    "parent_id",
    "agent",
    "model",
    "cost",
    "tokens_input",
    "tokens_output",
    "tokens_reasoning",
    "tokens_cache_read",
    "tokens_cache_write",
    "time_created",
    "project_id",
  ]
  const rows = db().query("select name from pragma_table_info('session_v2')").all() as Array<{ name: string }>
  const present = new Set(rows.map((r) => r.name))
  const missing = required.filter((c) => !present.has(c))
  const stepCols = db().query("select name from pragma_table_info('session_message')").all() as Array<{
    name: string
  }>
  const stepMissing = ["session_id", "type", "data", "time_created"].filter(
    (c) => !stepCols.some((r) => r.name === c),
  )
  console.log(JSON.stringify({ sessionMissing: missing, messageMissing: stepMissing }, null, 2))
  process.exit(missing.length === 0 && stepMissing.length === 0 ? 0 : 1)
}

if (mode === "config") {
  // Runtime proof: read the model recorded on the most recent assistant step of a known dispatch.
  const target = process.argv[3]
  if (!target) throw new Error("usage: bun run check.ts config <sessionID>")
  const step = db()
    .query(
      `select json_extract(data,'$.model.providerID') provider,
              json_extract(data,'$.model.id') model,
              json_extract(data,'$.model.variant') variant,
              json_extract(data,'$.costProvenance') provenance
       from session_message
       where session_id = ? and type = 'assistant'
       order by time_created limit 1`,
    )
    .get(target)
  console.log(JSON.stringify({ sessionID: target, step }, null, 2))
  process.exit(step ? 0 : 1)
}

console.error(`unknown mode: ${mode ?? "(none)"}`)
process.exit(2)
