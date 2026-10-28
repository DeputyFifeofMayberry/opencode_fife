#!/usr/bin/env bun

import { parseArgs } from "util"

import { resolveRepo } from "./repo.ts"
import { sweepStaleIssues, type StaleIssueItem } from "./stale-issues.ts"

const days = 60
const msg = `To stay organized issues are automatically closed after ${days} days of no activity. If the issue is still relevant please open a new one.`

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    execute: { type: "boolean", default: false },
    "dry-run": { type: "boolean", default: false },
    repo: { type: "string" },
    help: { type: "boolean", short: "h", default: false },
  },
})

if (values.help) {
  console.log(`
Usage: bun script/github/close-issues.ts [options]

Dry-run is the default. The script only comments and closes issues when --execute is passed.

Criteria:
  - Open issues with no activity for ${days} days are closed as not planned
  - Issues authored by the agent bot, team members, or OWNER/MEMBER associations are exempt
  - Pull requests returned by the issues endpoint are never touched

Options:
  --execute              Comment and close matching issues
  --dry-run              Explicitly run without changing anything
  --repo <owner/repo>    Repository to clean up (default: GITHUB_REPOSITORY)
  -h, --help             Show this help message

Examples:
  bun script/github/close-issues.ts
  bun script/github/close-issues.ts --dry-run
  bun script/github/close-issues.ts --execute
`)
  process.exit(0)
}

if (values.execute && values["dry-run"]) {
  console.error("Use either --execute or --dry-run, not both")
  process.exit(1)
}

const execute = values.execute
const token = process.env.GITHUB_TOKEN
if (!token) {
  console.error("GITHUB_TOKEN environment variable is required")
  process.exit(1)
}

const repo = resolveRepo(values.repo ?? process.env.GITHUB_REPOSITORY)
const headers = {
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
}
const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
const teamMembers = new Set(
  (await Bun.file(new URL("../../.github/TEAM_MEMBERS", import.meta.url)).text())
    .split("\n")
    .map((line) => line.trim().toLowerCase())
    .filter(Boolean),
)

async function fetchPage(page: number): Promise<StaleIssueItem[]> {
  const res = await fetch(
    `https://api.github.com/repos/${repo.owner}/${repo.name}/issues?state=open&sort=updated&direction=asc&per_page=100&page=${page}`,
    { headers },
  )
  if (!res.ok) throw new Error(res.statusText)
  return (await res.json()) as StaleIssueItem[]
}

async function closeIssue(number: number) {
  if (!execute) {
    console.log(`[dry-run] Would close https://github.com/${repo.owner}/${repo.name}/issues/${number}`)
    return
  }

  const comment = await fetch(`https://api.github.com/repos/${repo.owner}/${repo.name}/issues/${number}/comments`, {
    method: "POST",
    headers,
    body: JSON.stringify({ body: msg }),
  })
  if (!comment.ok) throw new Error(`Failed to comment #${number}: ${comment.status} ${comment.statusText}`)

  const patch = await fetch(`https://api.github.com/repos/${repo.owner}/${repo.name}/issues/${number}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ state: "closed", state_reason: "not_planned" }),
  })
  if (!patch.ok) throw new Error(`Failed to close #${number}: ${patch.status} ${patch.statusText}`)

  console.log(`Closed https://github.com/${repo.owner}/${repo.name}/issues/${number}`)
}

const closed = await sweepStaleIssues({ fetchPage, close: closeIssue, cutoff, teamMembers, log: console.log })
console.log(`${execute ? "Closed" : "Would close"} ${closed.length} ${closed.length === 1 ? "issue" : "issues"} total`)
