// Pure core for the needs:compliance sweeper. The CLI in compliance-close.ts
// wires this to the GitHub API; tests drive it entirely through injected IO.

import { complianceWindowMs, findWarningComment, parseWarning } from "./warning-marker.ts"

const label = "needs:compliance"
const agentLogin = "opencode-agent[bot]"
const exemptAssociations = new Set(["OWNER", "MEMBER"])

export type ComplianceItem = {
  number: number
  pull_request?: unknown
  user: { login: string } | null
  author_association: string
}

export type ComplianceComment = {
  id: number
  body: string
  created_at: string
}

export type ComplianceSweepInput = {
  items: ComplianceItem[]
  fetchComments: (number: number) => Promise<ComplianceComment[]>
  removeLabel: (number: number) => Promise<void>
  addComment: (number: number, body: string) => Promise<void>
  closeItem: (item: ComplianceItem) => Promise<void>
  now: Date
  teamMembers: Set<string>
  log?: (message: string) => void
}

export function isExempt(item: ComplianceItem, teamMembers: Set<string>) {
  const login = item.user?.login.toLowerCase()
  return (
    login === agentLogin ||
    (login !== undefined && teamMembers.has(login)) ||
    exemptAssociations.has(item.author_association)
  )
}

export function warningDeadline(comment: ComplianceComment) {
  return parseWarning(comment.body)?.deadline ?? new Date(comment.created_at)
}

export function closeMessage(isPR: boolean) {
  const kind = isPR ? "pull request" : "issue"
  const followUp = isPR ? "guidelines" : "issue templates"
  return `This ${kind} has been automatically closed because it was not updated to meet our [contributing guidelines](../blob/dev/CONTRIBUTING.md) within the 72-hour window.\n\nFeel free to open a new ${kind} that follows our ${followUp}.`
}

export async function sweepCompliance(input: ComplianceSweepInput) {
  const log = input.log ?? (() => {})
  const closed: number[] = []

  for (const item of input.items) {
    const kind = item.pull_request ? "PR" : "issue"

    if (isExempt(item, input.teamMembers)) {
      log(`Skipping ${kind} #${item.number}; author ${item.user?.login ?? "unknown"} is exempt`)
      await input.removeLabel(item.number)
      continue
    }

    const comments = await input.fetchComments(item.number)
    const warning = findWarningComment(comments)
    if (!warning) {
      log(`${kind} #${item.number} has no compliance warning; leaving open`)
      continue
    }

    const deadline = warningDeadline(warning)
    const remaining = deadline.getTime() - input.now.getTime()
    if (remaining > 0) {
      log(`${kind} #${item.number} still within the ${complianceWindowMs / 3_600_000}-hour window (${Math.round(remaining / 60_000)}m left)`)
      continue
    }

    await input.addComment(item.number, closeMessage(item.pull_request !== undefined))
    await input.removeLabel(item.number)
    await input.closeItem(item)
    closed.push(item.number)
    log(`Closed non-compliant ${kind} #${item.number}`)
  }

  return closed
}
