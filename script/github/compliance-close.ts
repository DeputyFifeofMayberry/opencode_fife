#!/usr/bin/env bun

// Closes issues and PRs labeled needs:compliance once their 72-hour window
// expires. Replaces the inline script in triage-compliance-close.yml.
//
// Fixes against the original:
// - pages the labeled-item list, so items past the first 100 are seen (BUG-004)
// - pages comment lookups, so warnings older than 30 comments are found (BUG-007)
// - reads the deadline from the warning marker when present instead of always
//   using the comment's created_at (BUG-005)

import { parseArgs } from "util"

import { sweepCompliance, type ComplianceComment, type ComplianceItem } from "./compliance-sweep.ts"
import { createGithubRest, listAllPages, resolveToken } from "./github-rest.ts"
import { resolveRepo } from "./repo.ts"
import { complianceWindowMs } from "./warning-marker.ts"

const label = "needs:compliance"

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
Usage: bun script/github/compliance-close.ts [options]

Dry-run is the default. The script only closes items when --execute is passed.

Criteria:
  - Open issues and PRs labeled ${label} close 72 hours after their compliance warning
  - Authors that are the agent bot, team members, or OWNER/MEMBER associations are exempt
    and have the label removed

Options:
  --execute              Comment and close expired items
  --dry-run              Explicitly run without changing anything
  --repo <owner/repo>    Repository to check (default: GITHUB_REPOSITORY)
  -h, --help             Show this help message
`)
  process.exit(0)
}

if (values.execute && values["dry-run"]) {
  console.error("Use either --execute or --dry-run, not both")
  process.exit(1)
}

const execute = values.execute
const repo = resolveRepo(values.repo ?? process.env.GITHUB_REPOSITORY)
const rest = createGithubRest(await resolveToken())

type ContentsFile = { content: string; encoding: string }

const file = await rest.json<ContentsFile>(
  `/repos/${repo.owner}/${repo.name}/contents/.github/TEAM_MEMBERS?ref=dev`,
)
const teamMembers = new Set(
  Buffer.from(file.content, "base64")
    .toString()
    .split("\n")
    .map((line) => line.trim().toLowerCase())
    .filter(Boolean),
)

const items = await listAllPages<ComplianceItem>(
  (path) => rest.json<ComplianceItem[]>(path),
  `/repos/${repo.owner}/${repo.name}/issues?labels=${encodeURIComponent(label)}&state=open&sort=created&direction=asc`,
)
console.log(`${execute ? "EXECUTE" : "DRY RUN"}: compliance sweep for ${repo.owner}/${repo.name}`)
console.log(`Fetched ${items.length} open items labeled ${label}`)

async function fetchComments(number: number) {
  return rest.list<ComplianceComment>(`/repos/${repo.owner}/${repo.name}/issues/${number}/comments`)
}

async function removeLabel(number: number) {
  if (!execute) {
    console.log(`[dry-run] Would remove ${label} from #${number}`)
    return
  }
  const response = await rest.request(
    `/repos/${repo.owner}/${repo.name}/issues/${number}/labels/${encodeURIComponent(label)}`,
    { method: "DELETE" },
  )
  // The label may already be gone; only real failures matter.
  if (!response.ok && response.status !== 404) {
    throw new Error(`Failed to remove label from #${number}: ${response.status} ${response.statusText}`)
  }
}

async function addComment(number: number, body: string) {
  if (!execute) {
    console.log(`[dry-run] Would comment on #${number}`)
    return
  }
  await rest.request(`/repos/${repo.owner}/${repo.name}/issues/${number}/comments`, {
    method: "POST",
    body: JSON.stringify({ body }),
  })
}

async function closeItem(item: ComplianceItem) {
  if (!execute) {
    console.log(`[dry-run] Would close ${item.pull_request ? "PR" : "issue"} #${item.number}`)
    return
  }
  if (item.pull_request) {
    await rest.request(`/repos/${repo.owner}/${repo.name}/pulls/${item.number}`, {
      method: "PATCH",
      body: JSON.stringify({ state: "closed" }),
    })
    return
  }
  await rest.request(`/repos/${repo.owner}/${repo.name}/issues/${item.number}`, {
    method: "PATCH",
    body: JSON.stringify({ state: "closed", state_reason: "not_planned" }),
  })
}

const closed = await sweepCompliance({
  items,
  fetchComments,
  removeLabel,
  addComment,
  closeItem,
  now: new Date(),
  teamMembers,
  log: console.log,
})
console.log(`${execute ? "Closed" : "Would close"} ${closed.length} non-compliant item${closed.length === 1 ? "" : "s"}`)
