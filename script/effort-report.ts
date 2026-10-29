#!/usr/bin/env bun

// Effort-policy evidence report: reads a session database read-only and renders what the
// effort loop actually did — durable per-session state, attributed transitions, and the
// governed-vs-ungoverned split. Evidence for the question "is the loop working", not a
// substitute for it.
//
// Usage: bun script/effort-report.ts --db <session.db> [--out <report.md>] [--since <ISO date>]

import { parseArgs } from "node:util"
import { Database } from "bun:sqlite"

const args = parseArgs({
  args: process.argv.slice(2),
  options: {
    db: { type: "string" },
    out: { type: "string" },
    since: { type: "string" },
  },
})

if (!args.values.db) {
  console.error("usage: bun script/effort-report.ts --db <session.db> [--out <report.md>] [--since <ISO>]")
  process.exit(2)
}

const db = new Database(args.values.db, { readonly: true })
const sinceMs = args.values.since ? Date.parse(args.values.since) : undefined
if (args.values.since && Number.isNaN(sinceMs)) {
  console.error(`--since is not an ISO date: ${args.values.since}`)
  process.exit(2)
}

interface SessionRow {
  id: string
  slug: string
  directory: string
  time_updated: number | null
}

interface EffortRow {
  session_id: string
  base_level: string
  open_failure: string | null
  revision: number
  level: string | null
  clean_passes: number
  verdict_revision: number | null
  verdict_digest: string | null
}

const sessions = (db.query("SELECT id, slug, directory, time_updated FROM session_v2 ORDER BY time_updated").all() as SessionRow[]).filter(
  (session) => sinceMs === undefined || (session.time_updated ?? 0) > sinceMs,
)
const effortRows = db.query("SELECT * FROM session_effort").all() as EffortRow[]
const effortBySession = new Map(effortRows.map((row) => [row.session_id, row]))

interface Transition {
  sessionID: string
  rule: string | null
  level: string | null
  effort: string | null
  at: number
}

// Attributed transitions carry `metadata.source: "effort-policy"`; the deciding rule and
// level name the why. Everything else mentioning the string is prose, not a transition.
const transitions: Transition[] = []
const messageRows = db
  .query(
    "SELECT session_id, time_created, data FROM session_message WHERE data LIKE '%effort-policy%' ORDER BY time_created",
  )
  .all() as { session_id: string; time_created: number | null; data: string }[]
for (const row of messageRows) {
  if (sinceMs !== undefined && (row.time_created ?? 0) <= sinceMs) continue
  let parsed: unknown
  try {
    parsed = JSON.parse(row.data)
  } catch {
    continue
  }
  if (typeof parsed !== "object" || parsed === null) continue
  const metadata = (parsed as { metadata?: unknown }).metadata
  if (typeof metadata !== "object" || metadata === null) continue
  const source = (metadata as { source?: unknown }).source
  if (source !== "effort-policy") continue
  const record = metadata as { rule?: unknown; level?: unknown; effort?: unknown }
  transitions.push({
    sessionID: row.session_id,
    rule: typeof record.rule === "string" ? record.rule : null,
    level: typeof record.level === "string" ? record.level : null,
    effort: typeof record.effort === "string" ? record.effort : null,
    at: row.time_created ?? 0,
  })
}

const byRule = new Map<string, number>()
for (const transition of transitions) {
  const key = transition.rule ?? "unknown"
  byRule.set(key, (byRule.get(key) ?? 0) + 1)
}

const slugOf = (sessionID: string) => sessions.find((session) => session.id === sessionID)?.slug ?? sessionID
const iso = (ms: number | null | undefined) => (ms ? new Date(ms).toISOString() : "n/a")

const lines: string[] = []
lines.push(`# Effort policy report`)
lines.push("")
lines.push(`- database: \`${args.values.db}\``)
lines.push(`- generated: ${new Date().toISOString()}`)
if (sinceMs !== undefined) lines.push(`- since: ${args.values.since}`)
lines.push("")
lines.push(`## Loop activity`)
lines.push("")
lines.push(`| metric | value |`)
lines.push(`| --- | --- |`)
lines.push(`| sessions (window) | ${sessions.length} |`)
lines.push(`| sessions with durable effort state | ${effortRows.length} |`)
lines.push(`| attributed transitions | ${transitions.length} |`)
for (const [rule, count] of [...byRule.entries()].sort((a, b) => b[1] - a[1])) {
  lines.push(`| transitions · ${rule} | ${count} |`)
}
lines.push("")

lines.push(`## Durable state`)
lines.push("")
if (effortRows.length === 0) {
  lines.push("_No `session_effort` rows: no governed session has recorded state in this database yet._")
  lines.push("")
}
for (const row of effortRows) {
  const session = sessions.find((entry) => entry.id === row.session_id)
  const open = row.open_failure ? `open (${JSON.parse(row.open_failure).verifier ?? "unknown"})` : "none"
  const level = row.level ?? "(unset)"
  lines.push(
    `- **${slugOf(row.session_id)}** — base \`${row.base_level}\`, level \`${level}\`, failure: ${open}, clean passes: ${row.clean_passes}, revision: ${row.revision}, verdict: ${row.verdict_revision === null ? "never" : `rev ${row.verdict_revision}${row.verdict_digest ? ` digest ${row.verdict_digest}` : ""}`}, updated: ${iso(session?.time_updated)}`,
  )
}
if (effortRows.length > 0) lines.push("")

lines.push(`## Attributed transitions`)
lines.push("")
if (transitions.length === 0) {
  lines.push("_No policy-authored transitions: the loop has not moved any session's variant yet._")
  lines.push("")
}
for (const transition of transitions.slice(-40)) {
  lines.push(
    `- ${iso(transition.at)} **${slugOf(transition.sessionID)}** — rule \`${transition.rule ?? "?"}\` → \`${transition.effort ?? transition.level ?? "default"}\``,
  )
}

const report = `${lines.join("\n")}\n`
if (args.values.out) {
  await Bun.write(args.values.out, report)
  console.log(`report: ${args.values.out}`)
} else {
  process.stdout.write(report)
}
