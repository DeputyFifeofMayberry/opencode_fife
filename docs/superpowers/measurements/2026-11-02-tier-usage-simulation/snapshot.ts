import { Database } from "bun:sqlite"
import { readFileSync, writeFileSync, mkdirSync } from "node:fs"
import path from "node:path"

const dataDir = path.join(import.meta.dir, "data")
mkdirSync(dataDir, { recursive: true })
const prefix = process.argv[2] ?? "00"
const opencodeDir = path.join(process.env.USERPROFILE!, ".local/share/opencode")
const db = new Database(path.join(opencodeDir, "opencode.db"), { readonly: true })
const timings = readFileSync(path.join(opencodeDir, "model-router", "timings.jsonl"), "utf8")
  .trim()
  .split("\n")
  .filter(Boolean)
  .map((line) => JSON.parse(line))

const snapshot = {
  takenAt: Date.now(),
  iso: new Date().toISOString(),
  versions: {
    bun: Bun.version,
    opencode: db.query("select version from session_v2 order by time_created desc limit 1").get(),
  },
  timingsRows: timings.length,
  lastDispatchStartedAt: Math.max(...timings.map((t) => t.startedAt)),
  sessionCount: db.query("select count(*) n from session_v2").get(),
  sessionCost: db.query("select round(sum(cost), 6) c from session_v2").get(),
  byClass: db
    .query(
      "select case when parent_id is null then 'top' else 'child' end k, count(*) n, round(sum(cost),6) c from session_v2 group by k",
    )
    .all(),
  byAgent: db
    .query("select agent, count(*) n, round(sum(cost),6) c from session_v2 group by agent order by n desc")
    .all(),
  byModel: db
    .query("select model, count(*) n, round(sum(cost),6) c from session_v2 group by model order by n desc")
    .all(),
}

// Per-session cost snapshot. Two of these - before and after the run - let the
// reconciliation compute exact period spend, including cost accrued inside a
// session that already existed when the window opened.
const sessions = db.query("select id, cost from session_v2").all() as Array<{ id: string; cost: number }>

writeFileSync(path.join(dataDir, `${prefix}-baseline.json`), JSON.stringify(snapshot, null, 2))
writeFileSync(
  path.join(dataDir, `${prefix}-sessions.json`),
  JSON.stringify(Object.fromEntries(sessions.map((s) => [s.id, s.cost])), null, 2),
)
console.log(JSON.stringify({ ...snapshot, sessionsWritten: sessions.length }, null, 2))
