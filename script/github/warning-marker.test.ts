import { describe, expect, test } from "bun:test"

import { findWarningComment, formatWarning, parseWarning } from "./warning-marker.ts"

describe("parseWarning", () => {
  test("round-trips a formatted marker", () => {
    const body = formatWarning({
      head: "abc123",
      failures: "missing-issue-ref",
      deadline: new Date("2026-03-01T00:00:00Z"),
    })

    const parsed = parseWarning(`prefix\n${body}\nbody text`)

    expect(parsed).toEqual({
      head: "abc123",
      failures: "missing-issue-ref",
      deadline: new Date("2026-03-01T00:00:00Z"),
    })
  })

  test("returns null fields for a legacy bare marker", () => {
    const parsed = parseWarning("<!-- issue-compliance -->\nPlease fix the template.")

    expect(parsed).toEqual({ head: null, failures: null, deadline: null })
  })

  test("returns null for a comment without a marker", () => {
    expect(parseWarning("Just a regular comment")).toBeNull()
  })

  test("ignores an unparseable deadline", () => {
    const parsed = parseWarning("<!-- issue-compliance head=abc failures=x deadline=not-a-date -->")

    expect(parsed?.deadline).toBeNull()
    expect(parsed?.head).toBe("abc")
  })
})

describe("findWarningComment", () => {
  test("finds the marker comment even when it is the oldest of many", () => {
    const marker = { id: 1, body: "<!-- issue-compliance head=abc failures=x deadline=2026-01-01T00:00:00Z -->" }
    const comments = [marker, ...Array.from({ length: 40 }, (_, index) => ({ id: index + 2, body: "chat" }))]

    expect(findWarningComment(comments)?.id).toBe(1)
  })

  test("matches both new-format and legacy markers", () => {
    expect(findWarningComment([{ body: "<!-- issue-compliance head=a failures=b deadline=2026-01-01T00:00:00Z -->" }])).toBeDefined()
    expect(findWarningComment([{ body: "<!-- issue-compliance -->" }])).toBeDefined()
  })

  test("returns undefined when no comment carries the marker", () => {
    expect(findWarningComment([{ body: "hello" }])).toBeUndefined()
  })
})
