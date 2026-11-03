import { Database } from "bun:sqlite"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"

const from = Number(process.argv[2])
const to = Number(process.argv[3] ?? Date.now())
if (!from) throw new Error("usage: bun run spend.ts <fromEpochMs> [toEpochMs]")

const db = new Database(
  path.join(process.env.USERPROFILE!, ".local/share/opencode/opencode.db"),
  { readonly: true },
)

// Creation-time filtering misses spend that accrues inside sessions which already existed
// when the window opened. The snapshot delta is the authoritative period figure; the
// since-creation sum is kept only because it is what the plan's gate originally named.
const baselinePath = path.join(import.meta.dir, "data", "00-sessions.json")
const baseline = existsSync(baselinePath)
  ? (JSON.parse(readFileSync(baselinePath, "utf8")) as Record<string, number>)
  : null

const current = db.query("select id, cost from session_v2").all() as Array<{ id: string; cost: number }>
const currentTotal = current.reduce((a, s) => a + s.cost, 0)
const baselineTotal = baseline ? Object.values(baseline).reduce((a, v) => a + v, 0) : null

console.log(
  JSON.stringify(
    {
      window: { from, to },
      spendSinceCreation: db
        .query("select round(sum(cost),6) v from session_v2 where time_created between ? and ?")
        .get(from, to),
      sessionsSinceCreation: db
        .query("select count(*) v from session_v2 where time_created between ? and ?")
        .get(from, to),
      periodDeltaUSD: baseline ? Number((currentTotal - baselineTotal!).toFixed(6)) : null,
      periodDeltaBasis: baseline ? "sum(cost) now minus 00-sessions.json" : "no baseline snapshot",
      byTierAgent: db
        .query(
          `select case when parent_id is null then 'top' else coalesce(agent,'unknown') end k,
                  count(*) n, round(sum(cost),6) cost
           from session_v2 where time_created between ? and ?
           group by k order by cost desc`,
        )
        .all(from, to),
    },
    null,
    2,
  ),
)
