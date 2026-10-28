#!/usr/bin/env bun

// Runs one job of the triage-pr-standards workflow against the pull request
// from GITHUB_EVENT_PATH. Replaces the inline scripts in triage-pr-standards.yml.
//
//   bun script/github/pr-standards.ts standards    # title + linked-issue checks
//   bun script/github/pr-standards.ts compliance   # PR template compliance
//
// Fixes against the original:
// - `perf` is an allowed conventional title type (BUG-006)
// - comment lookups are paginated, so marker comments survive past 30 comments (BUG-007)
// - the compliance deadline lives in the warning marker and only resets on
//   real progress: a new head commit or a changed failure set (BUG-005)

import {
  agentLogin,
  complianceMessage,
  evaluateTemplate,
  failuresFingerprint,
  hasBodyIssueRef,
  hasValidTitle,
  issueMessage,
  resolveNextWarning,
  skipsIssueCheck,
  standardsCutoff,
  titleMessage,
} from "./pr-standards-checks.ts"
import { createGithubRest, listAllPages, resolveToken } from "./github-rest.ts"
import { resolveRepo } from "./repo.ts"
import { findWarningComment, formatWarning, parseWarning } from "./warning-marker.ts"

const complianceLabel = "needs:compliance"

type PullRequestEvent = {
  pull_request?: {
    number: number
    title: string
    body: string | null
    created_at: string
    user: { login: string }
    labels: Array<{ name: string }>
    head: { sha: string }
  }
}

type CommentRef = { id: number; body: string }

const subcommand = Bun.argv[2]
if (subcommand !== "standards" && subcommand !== "compliance") {
  console.error("Usage: bun script/github/pr-standards.ts <standards|compliance>")
  process.exit(1)
}

const eventPath = process.env.GITHUB_EVENT_PATH
if (!eventPath) {
  console.error("GITHUB_EVENT_PATH is required; this script runs inside GitHub Actions")
  process.exit(1)
}

const payload = JSON.parse(await Bun.file(eventPath).text()) as PullRequestEvent
const pr = payload.pull_request
if (!pr) {
  console.log("No pull request in the event; nothing to do")
  process.exit(0)
}

const repo = resolveRepo(process.env.GITHUB_REPOSITORY)
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

async function fetchComments() {
  return rest.list<CommentRef>(`/repos/${repo.owner}/${repo.name}/issues/${pr.number}/comments`)
}

async function addLabels(name: string) {
  await rest.request(`/repos/${repo.owner}/${repo.name}/issues/${pr.number}/labels`, {
    method: "POST",
    body: JSON.stringify({ labels: [name] }),
  })
}

async function removeLabel(name: string) {
  const response = await rest.request(
    `/repos/${repo.owner}/${repo.name}/issues/${pr.number}/labels/${encodeURIComponent(name)}`,
    { method: "DELETE" },
  )
  // The label may already be gone; only real failures matter.
  if (!response.ok && response.status !== 404) {
    throw new Error(`Failed to remove label ${name} from #${pr.number}: ${response.status} ${response.statusText}`)
  }
}

async function createComment(body: string) {
  await rest.request(`/repos/${repo.owner}/${repo.name}/issues/${pr.number}/comments`, {
    method: "POST",
    body: JSON.stringify({ body }),
  })
}

async function updateComment(id: number, body: string) {
  await rest.request(`/repos/${repo.owner}/${repo.name}/issues/comments/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ body }),
  })
}

async function deleteComment(id: number) {
  await rest.request(`/repos/${repo.owner}/${repo.name}/issues/comments/${id}`, {
    method: "DELETE",
  })
}

// Adds the marker comment once; an existing marker is never duplicated.
async function ensureMarkerComment(marker: string, body: string) {
  const markerText = `<!-- pr-standards:${marker} -->`
  const comments = await fetchComments()
  if (comments.some((comment) => comment.body.includes(markerText))) return
  await createComment(`${markerText}\n${body}`)
}

async function runStandards() {
  const title = pr.title

  if (!hasValidTitle(title)) {
    await addLabels("needs:title")
    await ensureMarkerComment("title", titleMessage(title))
    return
  }

  await removeLabel("needs:title")

  if (skipsIssueCheck(title)) {
    await removeLabel("needs:issue")
    console.log("Skipping issue check for docs/refactor/feat PR")
    return
  }

  const data = await rest.graphql<{
    repository: { pullRequest: { closingIssuesReferences: { totalCount: number } } }
  }>(
    `query($owner: String!, $repo: String!, $number: Int!) {
      repository(owner: $owner, name: $repo) {
        pullRequest(number: $number) {
          closingIssuesReferences(first: 1) {
            totalCount
          }
        }
      }
    }`,
    { owner: repo.owner, repo: repo.name, number: pr.number },
  )

  // GitHub only populates closingIssuesReferences when a PR targets the
  // repository's default branch (dev). PRs targeting other branches like v2
  // always return totalCount 0; fall back to closing keywords in the body.
  const linkedIssues =
    data.repository.pullRequest.closingIssuesReferences.totalCount > 0 || hasBodyIssueRef(pr.body ?? "")

  if (!linkedIssues) {
    await addLabels("needs:issue")
    await ensureMarkerComment("issue", issueMessage())
    return
  }

  await removeLabel("needs:issue")
  console.log("PR meets all standards")
}

async function runCompliance() {
  const issues = evaluateTemplate(pr.body ?? "", pr.title)
  const hasComplianceLabel = pr.labels.some((label) => label.name === complianceLabel)

  if (issues.length > 0) {
    if (!hasComplianceLabel) await addLabels(complianceLabel)

    const failures = failuresFingerprint(issues)
    const comments = await fetchComments()
    const existing = findWarningComment(comments)
    const { deadline } = resolveNextWarning({
      existing: existing ? parseWarning(existing.body) : null,
      head: pr.head.sha,
      failures,
      now: new Date(),
    })
    const body = complianceMessage(issues, formatWarning({ head: pr.head.sha, failures, deadline }))

    if (existing) await updateComment(existing.id, body)
    else await createComment(body)

    console.log(`PR #${pr.number} is non-compliant: ${issues.join(", ")}`)
    return
  }

  if (!hasComplianceLabel) {
    console.log(`PR #${pr.number} is compliant`)
    return
  }

  // Was non-compliant, now fixed.
  await removeLabel(complianceLabel)
  const comments = await fetchComments()
  const existing = findWarningComment(comments)
  if (existing) await deleteComment(existing.id)
  await createComment("Thanks for updating your PR! It now meets our contributing guidelines. :+1:")
  console.log(`PR #${pr.number} is now compliant, label removed`)
}

async function main() {
  const login = pr.user.login.toLowerCase()
  if (new Date(pr.created_at) < standardsCutoff) {
    console.log(`Skipping: PR #${pr.number} was created before cutoff (${new Date(pr.created_at).toISOString()})`)
    return
  }
  if (login === agentLogin || teamMembers.has(login)) {
    console.log(`Skipping: ${login} is exempt`)
    return
  }

  if (subcommand === "compliance") {
    await runCompliance()
    return
  }
  await runStandards()
}

await main()
