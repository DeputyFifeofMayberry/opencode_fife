import { Database } from "bun:sqlite"
import path from "node:path"

const from = Number(process.argv[2])
const to = Number(process.argv[3] ?? Date.now())
if (!from) throw new Error("usage: bun run spend.ts <fromEpochMs> [toEpochMs]")

const db = new Database(
  path.join(process.env.USERPROFILE!, ".local/share/opencode/opencode.db"),
  { readonly: true },
)

console.log(
  JSON.stringify(
    {
      window: { from, to },
      spentSinceFrom: db
        .query("select round(sum(cost),6) v from session_v2 where time_created between ? and ?")
        .get(from, to),
      sessionsSinceFrom: db
        .query("select count(*) v from session_v2 where time_created between ? and ?")
        .get(from, to),
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
