import { describe, expect, test } from "bun:test"

import { sweepStaleIssues, type StaleIssueItem } from "./stale-issues.ts"

const now = new Date("2026-03-01T00:00:00Z")
const cutoff = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000)

function issue(number: number, updatedDaysAgo: number, extra: Partial<StaleIssueItem> = {}): StaleIssueItem {
  return {
    number,
    updated_at: daysAgo(updatedDaysAgo),
    author_association: "NONE",
    user: { login: `user-${number}` },
    ...extra,
  }
}

function daysAgo(days: number) {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString()
}

// Models the GitHub list endpoint: items are sorted by updated_at ascending,
// page slices are positional, and closing an item removes it from the open
// set so later items shift into earlier page positions.
function fakeRepo(items: StaleIssueItem[], pageSize = items.length) {
  const open = [...items]
  const closed: number[] = []
  let fetches = 0

  return {
    closed,
    fetches: () => fetches,
    fetchPage: async (page: number) => {
      fetches++
      return open.slice((page - 1) * pageSize, page * pageSize)
    },
    close: async (number: number) => {
      closed.push(number)
      const index = open.findIndex((item) => item.number === number)
      if (index !== -1) open.splice(index, 1)
    },
  }
}

function sweep(repo: ReturnType<typeof fakeRepo>, teamMembers = new Set<string>()) {
  return sweepStaleIssues({
    fetchPage: repo.fetchPage,
    close: repo.close,
    cutoff,
    teamMembers,
  })
}

describe("sweepStaleIssues", () => {
  test("closes every stale issue across pages even though closes shift the sorted pages", async () => {
    const repo = fakeRepo([issue(1, 100), issue(2, 90), issue(3, 80), issue(4, 30)], 2)

    const closed = await sweep(repo)

    expect(closed).toEqual([1, 2, 3])
    expect(repo.closed).toEqual([1, 2, 3])
  })

  test("never closes pull requests returned by the issues endpoint", async () => {
    const repo = fakeRepo(
      [issue(1, 100), issue(2, 95, { pull_request: {} }), issue(3, 80)],
      10,
    )

    const closed = await sweep(repo)

    expect(closed).toEqual([1, 3])
    expect(repo.closed).toEqual([1, 3])
  })

  test("stops paging at the first fresh issue", async () => {
    const repo = fakeRepo([issue(1, 100), issue(2, 90), issue(3, 30), issue(4, 10)])

    const closed = await sweep(repo)

    expect(closed).toEqual([1, 2])
    expect(repo.fetches()).toBe(1)
  })

  test("skips exempt authors: agent bot, team members, and owner/member associations", async () => {
    const repo = fakeRepo([
      issue(1, 100, { user: { login: "opencode-agent[bot]" } }),
      issue(2, 95, { author_association: "MEMBER" }),
      issue(3, 90, { user: { login: "alice" } }),
      issue(4, 80),
    ])

    const closed = await sweep(repo, new Set(["alice"]))

    expect(closed).toEqual([4])
  })

  test("closes nothing when the first page is empty", async () => {
    const repo = fakeRepo([], 10)

    const closed = await sweep(repo)

    expect(closed).toEqual([])
  })
})
