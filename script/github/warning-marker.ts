// Hidden marker embedded in needs:compliance warning comments. It records the
// PR head the warning was issued for, a fingerprint of the outstanding
// failures, and the deadline. Fields are whitespace-delimited, so the
// failures fingerprint must be encoded without spaces (for example a dash
// slug or short hash). The deadline only moves when the author makes
// real progress (new commit or a changed failure set), so no-op edits and bot
// comments never extend the 72-hour window. Legacy comments carry the bare
// `<!-- issue-compliance -->` marker with no fields; their deadline falls
// back to the comment's created_at.

export const markerPrefix = "<!-- issue-compliance"

export const complianceWindowMs = 72 * 60 * 60 * 1000

export type ComplianceWarning = {
  head: string | null
  failures: string | null
  deadline: Date | null
}

export function findWarningComment<T extends { body: string }>(comments: T[]): T | undefined {
  return comments.find((comment) => comment.body.includes(markerPrefix))
}

export function parseWarning(body: string): ComplianceWarning | null {
  const start = body.indexOf(markerPrefix)
  if (start === -1) return null

  const end = body.indexOf("-->", start)
  const fields = body.slice(start + markerPrefix.length, end === -1 ? undefined : end).trim()
  const parsed: ComplianceWarning = { head: null, failures: null, deadline: null }

  for (const field of fields.split(/\s+/)) {
    const separator = field.indexOf("=")
    if (separator === -1) continue
    const key = field.slice(0, separator)
    const value = field.slice(separator + 1)
    if (key === "head") parsed.head = value
    if (key === "failures") parsed.failures = value
    if (key === "deadline") {
      const date = new Date(value)
      if (!Number.isNaN(date.getTime())) parsed.deadline = date
    }
  }

  return parsed
}

export function formatWarning(warning: { head: string; failures: string; deadline: Date }) {
  return `${markerPrefix} head=${warning.head} failures=${warning.failures} deadline=${warning.deadline.toISOString()} -->`
}
