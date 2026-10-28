import { describe, expect, test } from "bun:test"

import {
  closeMessage,
  sweepCompliance,
  warningDeadline,
  type ComplianceComment,
  type ComplianceItem,
} from "./compliance-sweep.ts"
import { formatWarning } from "./warning-marker.ts"

const now = new Date("2026-03-01T00:00:00Z")
const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3_600_000).toISOString()

function issue(number: number, extra: Partial<ComplianceItem> = {}): ComplianceItem {
  return { number, user: { login: `user-${number}` }, author_association: "NONE", ...extra }
}

function warningComment(options: { createdHoursAgo?: number; marker?: string } = {}): ComplianceComment {
  const created = hoursAgo(options.createdHoursAgo ?? 96)
  const marker = options.marker ?? "<!-- issue-compliance -->"
  return { id: 1, body: `${marker}\nPlease fix the template.`, created_at: created }
}

function chatComments(count: number): ComplianceComment[] {
  return Array.from({ length: count }, (_, index) => ({
    id: index + 10,
    body: `conversation ${index}`,
    created_at: hoursAgo(100),
  }))
}

function harness(items: ComplianceItem[], comments: ComplianceComment[]) {
  const calls = { removeLabel: [] as number[], comments: [] as number[], close: [] as number[], commentBodies: [] as string[] }
  return {
    calls,
    input: {
      items,
      fetchComments: async (number: number) => {
        calls.comments.push(number)
        return comments
      },
      removeLabel: async (number: number) => {
        calls.removeLabel.push(number)
      },
      addComment: async (number: number, body: string) => {
        calls.commentBodies.push(body)
      },
      closeItem: async (item: ComplianceItem) => {
        calls.close.push(item.number)
      },
      now,
      teamMembers: new Set<string>(),
    },
  }
}

describe("sweepCompliance", () => {
  test("processes every labeled item beyond the first hundred", async () => {
    const items = Array.from({ length: 250 }, (_, index) => issue(index + 1))
    const expired = warningComment()
    const harnessResult = harness(items, [expired])

    const closed = await sweepCompliance(harnessResult.input)

    expect(closed.length).toBe(250)
    expect(harnessResult.calls.close.length).toBe(250)
  })

  test("finds an expired warning even when it is the oldest comment", async () => {
    const comments = [warningComment(), ...chatComments(40)]
    const harnessResult = harness([issue(1)], comments)

    const closed = await sweepCompliance(harnessResult.input)

    expect(closed).toEqual([1])
  })

  test("honors a marker deadline newer than the comment's created_at", async () => {
    const marker = formatWarning({ head: "abc", failures: "x", deadline: new Date(now.getTime() + 3_600_000) })
    const comments = [warningComment({ createdHoursAgo: 240, marker })]
    const harnessResult = harness([issue(1)], comments)

    const closed = await sweepCompliance(harnessResult.input)

    expect(closed).toEqual([])
    expect(harnessResult.calls.close).toEqual([])
  })

  test("closes a legacy warning once created_at passes the window", async () => {
    const comments = [warningComment({ createdHoursAgo: 96 })]
    const harnessResult = harness([issue(1)], comments)

    const closed = await sweepCompliance(harnessResult.input)

    expect(closed).toEqual([1])
    expect(harnessResult.calls.commentBodies).toEqual([closeMessage(false)])
  })

  test("leaves items without any warning comment untouched", async () => {
    const harnessResult = harness([issue(1)], chatComments(5))

    const closed = await sweepCompliance(harnessResult.input)

    expect(closed).toEqual([])
    expect(harnessResult.calls.removeLabel).toEqual([])
  })

  test("removes the label from exempt authors without closing", async () => {
    const items = [
      issue(1, { user: { login: "opencode-agent[bot]" } }),
      issue(2, { author_association: "MEMBER" }),
      issue(3, { user: { login: "alice" } }),
    ]
    const harnessResult = harness(items, [warningComment()])
    harnessResult.input.teamMembers = new Set(["alice"])

    const closed = await sweepCompliance(harnessResult.input)

    expect(closed).toEqual([])
    expect(harnessResult.calls.removeLabel).toEqual([1, 2, 3])
    expect(harnessResult.calls.close).toEqual([])
  })

  test("hands pull requests to closeItem so the CLI closes them through the PR API", async () => {
    const comments = [warningComment({ createdHoursAgo: 96 })]
    const pr = issue(7, { pull_request: {} })
    const harnessResult = harness([pr], comments)
    let closedItem: ComplianceItem | undefined
    harnessResult.input.closeItem = async (item) => {
      closedItem = item
    }

    await sweepCompliance(harnessResult.input)

    expect(closedItem).toBe(pr)
    expect(harnessResult.calls.commentBodies).toEqual([closeMessage(true)])
  })
})

describe("warningDeadline", () => {
  test("prefers the marker deadline over created_at", () => {
    const marker = formatWarning({ head: "abc", failures: "x", deadline: new Date("2026-04-01T00:00:00Z") })
    const comment = warningComment({ createdHoursAgo: 240, marker })

    expect(warningDeadline(comment)).toEqual(new Date("2026-04-01T00:00:00Z"))
  })

  test("falls back to created_at for a legacy marker", () => {
    const comment = warningComment({ createdHoursAgo: 10 })

    expect(warningDeadline(comment)).toEqual(new Date(hoursAgo(10)))
  })
})
