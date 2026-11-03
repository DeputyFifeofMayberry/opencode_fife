import { Database } from "bun:sqlite"
import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"

const dataDir =
  "Y:/CodingProjects/opencode_fife/docs/superpowers/measurements/2026-11-02-tier-usage-simulation/data"
const window = JSON.parse(readFileSync(path.join(dataDir, "run-window.json"), "utf8"))
const from = window.runStartMs
const to = window.runEndMs ?? Date.now()

const db = new Database(
  path.join(process.env.USERPROFILE!, ".local/share/opencode/opencode.db"),
  { readonly: true },
)

// Authoritative: every tier-agent child session created inside the run window.
const rows = db
  .query(
    `select s.id, s.agent, s.cost, s.time_created,
            (select count(*) from session_message m where m.session_id = s.id and m.type='assistant') steps,
            (select json_extract(m.data,'$.model.id') from session_message m
              where m.session_id = s.id and m.type='assistant' order by m.time_created limit 1) model
     from session_v2 s
     where s.parent_id is not null
       and s.agent in ('fast','medium','heavy')
       and s.time_created between ? and ?
     order by s.time_created`,
  )
  .all(from, to) as Array<{
  id: string
  agent: string
  cost: number
  time_created: number
  steps: number
  model: string | null
}>

// First assistant step's prompt is not stored, so family is derived from the tier only.
const lines = [
  "seq | tier | agent | sessionID | family | subject | startedAt | costUSD | steps",
  ...rows.map(
    (r, i) =>
      `${i + 1} | ${r.agent} | ${r.agent} | ${r.id} | ${r.agent}-task | ${r.model ?? "-"} | ${r.time_created} | ${r.cost.toFixed(6)} | ${r.steps}`,
  ),
]

writeFileSync(path.join(dataDir, "07-run-log.md"), lines.join("\n") + "\n")

const byTier: Record<string, { n: number; cost: number }> = {}
for (const r of rows) {
  const row = byTier[r.agent] ?? { n: 0, cost: 0 }
  row.n += 1
  row.cost += r.cost
  byTier[r.agent] = row
}
for (const row of Object.values(byTier)) row.cost = Number(row.cost.toFixed(6))

const spend = Number(rows.reduce((a, r) => a + r.cost, 0).toFixed(6))
console.log(JSON.stringify({ rows: rows.length, spend, byTier }, null, 2))

writeFileSync(
  path.join(dataDir, "run-window.json"),
  JSON.stringify(
    {
      ...window,
      executed: {
        fast: byTier.fast?.n ?? 0,
        medium: byTier.medium?.n ?? 0,
        heavy: byTier.heavy?.n ?? 0,
      },
      measured: { spendUSD: spend },
    },
    null,
    2,
  ),
)
