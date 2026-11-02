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

if (mode === "step-sums") {
  // Independent of extract.ts: compares session cost with the sum of the session's
  // own assistant steps, straight from the database.
  const rows = db()
    .query(
      `select s.id, s.cost sessionCost, coalesce(sum(json_extract(m.data,'$.cost')),0) stepCost,
              count(m.id) steps, s.parent_id is not null isChild
       from session_v2 s
       left join session_message m on m.session_id = s.id and m.type = 'assistant'
       group by s.id`,
    )
    .all() as Array<{ id: string; sessionCost: number; stepCost: number; steps: number; isChild: number }>

  const deltas = rows
    .map((r) => ({
      id: r.id,
      child: r.isChild === 1,
      sessionCost: Number(r.sessionCost.toFixed(6)),
      stepCost: Number(r.stepCost.toFixed(6)),
      delta: Number((r.sessionCost - r.stepCost).toFixed(9)),
      steps: r.steps,
    }))
    .filter((r) => Math.abs(r.delta) > 0.000001)

  const childDeltas = deltas.filter((d) => d.child)
  console.log(
    JSON.stringify(
      {
        sessions: rows.length,
        withDelta: deltas.length,
        childWithDelta: childDeltas.length,
        worstDelta: deltas.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 5),
        childProblems: childDeltas.slice(0, 5),
      },
      null,
      2,
    ),
  )
  process.exit(childDeltas.length === 0 ? 0 : 1)
}

if (mode === "classify-truth") {
  const result = db()
    .query(
      `select agent, count(*) n, round(sum(cost),6) cost
       from session_v2 where parent_id is not null
       group by agent order by n desc`,
    )
    .all()
  console.log(JSON.stringify(result, null, 2))
  process.exit(0)
}

if (mode === "cost-sums") {
  const guard = db().query("select round(sum(cost),6) c from session_v2").get() as { c: number }
  const rows = readJsonlAbs(path.join(dataDir, "dispatches.jsonl")) as Array<{
    sessionID: string
    costUSD: number | null
    sessionCostTotal: number | null
  }>
  const costed = rows.filter((r) => r.costUSD !== null)
  const dispatchSum = costed.reduce((a, r) => a + (r.costUSD ?? 0), 0)
  // Dedupe by SESSION ID. Deduping by cost value silently collapses two dispatches
  // that happen to cost the same - which is common at 6 decimal places.
  const bySession = new Map<string, number>()
  for (const r of costed) bySession.set(r.sessionID, r.sessionCostTotal ?? 0)
  const sessionSum = [...bySession.values()].reduce((a, c) => a + c, 0)
  const report = {
    costedDispatches: costed.length,
    distinctSessions: bySession.size,
    dispatchSum: Number(dispatchSum.toFixed(6)),
    sessionSum: Number(sessionSum.toFixed(6)),
    dbAllTime: guard.c,
  }
  console.log(JSON.stringify(report, null, 2))
  process.exit(
    report.dbAllTime > 0 && Math.abs(report.dispatchSum - report.sessionSum) < 1e-9 ? 0 : 1,
  )
}

console.error(`unknown mode: ${mode ?? "(none)"}`)
process.exit(2)
