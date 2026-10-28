// Port of the original close-issues.ts sweep with the audit fixes:
// - pull requests returned by the issues endpoint are never eligible
// - all pages are collected before any close, because a close bumps the
//   item's updated_at and reshuffles the updated-ascending page order

export type StaleIssueItem = {
  number: number
  updated_at: string
  author_association: string
  user: { login: string } | null
  pull_request?: unknown
}

export type SweepInput = {
  fetchPage: (page: number) => Promise<StaleIssueItem[]>
  close: (number: number) => Promise<void>
  cutoff: Date
  teamMembers: Set<string>
  log?: (message: string) => void
}

const agentLogin = "opencode-agent[bot]"
const exemptAssociations = new Set(["OWNER", "MEMBER"])

export async function sweepStaleIssues(input: SweepInput): Promise<number[]> {
  const log = input.log ?? (() => {})
  const stale: number[] = []

  for (let page = 1; ; page++) {
    const items = await input.fetchPage(page)
    if (items.length === 0) break
    log(`Fetched page ${page} (${items.length} items)`)

    const issues = items.filter((item) => !item.pull_request)

    for (const item of issues) {
      if (new Date(item.updated_at) >= input.cutoff) {
        log(`Found fresh issue #${item.number}, stopping`)
        return await closeStale(input, stale)
      }
      if (isExempt(item, input.teamMembers)) {
        log(`Skipping stale issue #${item.number}; author ${item.user?.login ?? "unknown"} is exempt`)
        continue
      }
      stale.push(item.number)
    }
  }

  return closeStale(input, stale)
}

async function closeStale(input: SweepInput, stale: number[]) {
  const closed: number[] = []
  for (const number of stale) {
    await input.close(number)
    closed.push(number)
  }
  return closed
}

function isExempt(item: StaleIssueItem, teamMembers: Set<string>) {
  const login = item.user?.login.toLowerCase()
  return (
    login === agentLogin ||
    (login !== undefined && teamMembers.has(login)) ||
    exemptAssociations.has(item.author_association)
  )
}
