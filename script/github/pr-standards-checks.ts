// Pure checks for the triage-pr-standards workflow. The CLI in
// pr-standards.ts wires these to the GitHub API; tests cover them directly.

import { complianceWindowMs, type ComplianceWarning } from "./warning-marker.ts"

export const allowedTitleTypes = ["feat", "fix", "docs", "chore", "refactor", "test"]

const titlePattern = new RegExp(`^(${allowedTitleTypes.join("|")})\\s*(\\([a-zA-Z0-9-]+\\))?\\s*:`)

// PRs with these types do not need a linked issue.
const skipIssueCheckPattern = /^(docs|refactor|feat)\s*(\([a-zA-Z0-9-]+\))?\s*:/

// PRs older than Feb 18, 2026 at 6PM EST (Feb 19, 2026 00:00 UTC) are skipped.
export const standardsCutoff = new Date("2026-02-19T00:00:00Z")

export const agentLogin = "opencode-agent[bot]"

export function hasValidTitle(title: string) {
  return titlePattern.test(title)
}

export function skipsIssueCheck(title: string) {
  return skipIssueCheckPattern.test(title)
}

export function titleMessage(title: string) {
  const typeLines = allowedTitleTypes
    .map((type) => `- \`${type}:\` or \`${type}(scope):\` ${typeMessageFragments[type] ?? type}`)
    .join("\n")
  return `Hey! Your PR title \`${title}\` doesn't follow conventional commit format.

Please update it to start with one of:
${typeLines}

Where \`scope\` is the package name (e.g., \`app\`, \`desktop\`, \`opencode\`).

See [CONTRIBUTING.md](../blob/dev/CONTRIBUTING.md#pr-titles) for details.`
}

const typeMessageFragments: Record<string, string> = {
  feat: "new feature",
  fix: "bug fix",
  docs: "documentation changes",
  chore: "maintenance tasks",
  refactor: "code refactoring",
  test: "adding or updating tests",
}

export function issueMessage() {
  return `Thanks for your contribution!

This PR doesn't have a linked issue. All PRs must reference an existing issue.

Please:
1. Open an issue describing the bug/feature (if one doesn't exist)
2. Add \`Fixes #<number>\` or \`Closes #<number>\` to this PR description

See [CONTRIBUTING.md](../blob/dev/CONTRIBUTING.md#issue-first-policy) for details.`
}

export function hasBodyIssueRef(body: string) {
  const issueMatch = body.match(/### Issue for this PR\s*\n([\s\S]*?)(?=###|$)/)
  const issueContent = issueMatch ? issueMatch[1].trim() : body
  return /(closes|fixes|resolves)\s+#\d+/i.test(issueContent) || /#\d+/.test(issueContent)
}

export function evaluateTemplate(body: string, title: string) {
  const issues: string[] = []

  const hasWhatSection = /### What does this PR do\?/.test(body)
  const hasTypeSection = /### Type of change/.test(body)
  const hasVerifySection = /### How did you verify your code works\?/.test(body)
  const hasChecklistSection = /### Checklist/.test(body)
  const hasIssueSection = /### Issue for this PR/.test(body)

  if (!hasWhatSection || !hasTypeSection || !hasVerifySection || !hasChecklistSection || !hasIssueSection) {
    issues.push(
      "PR description is missing required template sections. Please use the [PR template](../blob/dev/.github/pull_request_template.md).",
    )
  }

  if (hasWhatSection) {
    const whatMatch = body.match(/### What does this PR do\?\s*\n([\s\S]*?)(?=###|$)/)
    const whatContent = whatMatch ? whatMatch[1].trim() : ""
    const placeholder = "Please provide a description of the issue"
    const onlyPlaceholder =
      whatContent.includes(placeholder) && whatContent.replace(placeholder, "").replace(/[*\s]/g, "").length < 20
    if (!whatContent || onlyPlaceholder) {
      issues.push('"What does this PR do?" section is empty or only contains placeholder text. Please describe your changes.')
    }
  }

  if (hasTypeSection) {
    const typeMatch = body.match(/### Type of change\s*\n([\s\S]*?)(?=###|$)/)
    const typeContent = typeMatch ? typeMatch[1] : ""
    if (!/- \[x\]/i.test(typeContent)) {
      issues.push('No "Type of change" checkbox is checked. Please select at least one.')
    }
  }

  if (!skipsIssueCheck(title) && hasIssueSection) {
    if (!hasBodyIssueRef(body)) {
      issues.push("No issue referenced. Please add `Closes #<number>` linking to the relevant issue.")
    }
  }

  if (hasVerifySection) {
    const verifyMatch = body.match(/### How did you verify your code works\?\s*\n([\s\S]*?)(?=###|$)/)
    const verifyContent = verifyMatch ? verifyMatch[1].trim() : ""
    if (!verifyContent) {
      issues.push('"How did you verify your code works?" section is empty. Please explain how you tested.')
    }
  }

  if (hasChecklistSection) {
    const checklistMatch = body.match(/### Checklist\s*\n([\s\S]*?)(?=###|$)/)
    const checklistContent = checklistMatch ? checklistMatch[1] : ""
    const checked = (checklistContent.match(/- \[x\]/gi) || []).length
    if (checked < 2) {
      issues.push(
        "Not all checklist items are checked. Please confirm you have tested locally and have not included unrelated changes.",
      )
    }
  }

  return issues
}

// Whitespace-free fingerprint of the outstanding failures, compared across checks.
export function failuresFingerprint(issues: string[]) {
  return issues.length === 0 ? "none" : issues.join("|").replace(/\s+/g, "-")
}

export function complianceMessage(issues: string[], warningMarker: string) {
  return `${warningMarker}
This PR doesn't fully meet our [contributing guidelines](../blob/dev/CONTRIBUTING.md) and [PR template](../blob/dev/.github/pull_request_template.md).

**What needs to be fixed:**
${issues.map((issue) => `- ${issue}`).join("\n")}

Please edit this PR description to address the above within **72 hours**, or it will be automatically closed.

If you believe this was flagged incorrectly, please let a maintainer know.`
}

// The 72-hour window only moves when the author made real progress: a new
// head commit or a changed set of failures. No-op edits, bot comments, and
// re-runs never extend a deadline — when head and failures are unchanged, the
// recorded deadline stands even if it already expired, so the sweeper can
// close on it. Legacy warnings without parseable fields always get a fresh
// window the next time their content changes.
export function resolveNextWarning(input: {
  existing: ComplianceWarning | null
  head: string
  failures: string
  now: Date
}): { deadline: Date; reset: boolean } {
  const existing = input.existing
  if (existing?.deadline && existing.head === input.head && existing.failures === input.failures) {
    return { deadline: existing.deadline, reset: false }
  }
  return { deadline: new Date(input.now.getTime() + complianceWindowMs), reset: true }
}
