import { describe, expect, test } from "bun:test"

import {
  complianceMessage,
  evaluateTemplate,
  failuresFingerprint,
  hasValidTitle,
  resolveNextWarning,
  skipsIssueCheck,
  titleMessage,
} from "./pr-standards-checks.ts"
import { formatWarning, parseWarning } from "./warning-marker.ts"

const now = new Date("2026-03-01T00:00:00Z")

const fullTemplate = `### What does this PR do?

Fixes the dropdown alignment on the settings page.

### Type of change

- [x] Bug fix
- [ ] New feature

### Issue for this PR

Closes #123

### How did you verify your code works?

Ran the app and checked the settings page at narrow and wide sizes.

### Checklist

- [x] I have tested locally
- [x] My changes include no unrelated work
`

describe("hasValidTitle", () => {
  test("accepts every documented type, including perf", () => {
    for (const type of ["feat", "fix", "perf", "docs", "chore", "refactor", "test"]) {
      expect(hasValidTitle(`${type}: summary`)).toBe(true)
      expect(hasValidTitle(`${type}(scope): summary`)).toBe(true)
    }
  })

  test("rejects titles without a conventional prefix", () => {
    expect(hasValidTitle("Update stuff")).toBe(false)
    expect(hasValidTitle("improvement: faster")).toBe(false)
    expect(hasValidTitle("perf")).toBe(false)
  })
})

describe("skipsIssueCheck", () => {
  test("skips docs, refactor, and feat but requires issues for perf and fix", () => {
    expect(skipsIssueCheck("docs: update guide")).toBe(true)
    expect(skipsIssueCheck("refactor(core): tidy")).toBe(true)
    expect(skipsIssueCheck("feat: add thing")).toBe(true)
    expect(skipsIssueCheck("perf: speed up")).toBe(false)
    expect(skipsIssueCheck("fix: repair")).toBe(false)
  })
})

describe("titleMessage", () => {
  test("lists perf among the accepted types", () => {
    expect(titleMessage("bad title")).toContain("`perf:`")
  })
})

describe("evaluateTemplate", () => {
  test("accepts a fully filled template", () => {
    expect(evaluateTemplate(fullTemplate, "fix: align dropdown")).toEqual([])
  })

  test("flags missing template sections", () => {
    const issues = evaluateTemplate("Just some text", "fix: align dropdown")

    expect(issues[0]).toContain("missing required template sections")
  })

  test("flags placeholder-only description, unchecked type box, missing issue ref, and thin checklist", () => {
    const body = `### What does this PR do?

Please provide a description of the issue

### Type of change

- [ ] Bug fix
- [ ] New feature

### Issue for this PR

None

### How did you verify your code works?

Visually.

### Checklist

- [ ] I have tested locally
- [ ] My changes include no unrelated work
`
    const issues = evaluateTemplate(body, "fix: align dropdown")

    expect(issues.some((issue) => issue.includes("placeholder text"))).toBe(true)
    expect(issues.some((issue) => issue.includes("Type of change"))).toBe(true)
    expect(issues.some((issue) => issue.includes("No issue referenced"))).toBe(true)
    expect(issues.some((issue) => issue.includes("checklist items"))).toBe(true)
  })

  test("skips the issue reference for docs, refactor, and feat titles", () => {
    const body = fullTemplate.replace("Closes #123", "n/a")

    expect(evaluateTemplate(body, "docs: update guide")).toEqual([])
    expect(evaluateTemplate(body, "fix: align dropdown").length).toBeGreaterThan(0)
  })
})

describe("failuresFingerprint", () => {
  test("is whitespace-free and changes when the failure set changes", () => {
    const first = failuresFingerprint(["Missing sections. Please fix", "No checkbox"])
    const second = failuresFingerprint(["No checkbox"])
    const none = failuresFingerprint([])

    expect(first).not.toContain(" ")
    expect(first).not.toBe(second)
    expect(none).toBe("none")
  })
})

describe("complianceMessage", () => {
  test("embeds the marker line in the visible body", () => {
    const marker = formatWarning({ head: "abc", failures: "x", deadline: now })
    const body = complianceMessage(["No issue referenced."], marker)

    expect(body.startsWith(marker)).toBe(true)
    expect(body).toContain("- No issue referenced.")
  })
})

describe("resolveNextWarning", () => {
  const head = "abc123"
  const failures = "no-issue-ref"

  test("issues a fresh window when there is no existing warning", () => {
    const result = resolveNextWarning({ existing: null, head, failures, now })

    expect(result.reset).toBe(true)
    expect(result.deadline).toEqual(new Date(now.getTime() + 72 * 3_600_000))
  })

  test("keeps the deadline when head and failures are unchanged", () => {
    const deadline = new Date(now.getTime() + 10 * 3_600_000)
    const existing = parseWarning(formatWarning({ head, failures, deadline }))

    const result = resolveNextWarning({ existing, head, failures, now })

    expect(result.reset).toBe(false)
    expect(result.deadline).toEqual(deadline)
  })

  test("resets when a new commit arrives", () => {
    const deadline = new Date(now.getTime() + 10 * 3_600_000)
    const existing = parseWarning(formatWarning({ head, failures, deadline }))

    const result = resolveNextWarning({ existing, head: "def456", failures, now })

    expect(result.reset).toBe(true)
    expect(result.deadline).toEqual(new Date(now.getTime() + 72 * 3_600_000))
  })

  test("resets when the failure set shrinks or changes", () => {
    const deadline = new Date(now.getTime() + 10 * 3_600_000)
    const existing = parseWarning(formatWarning({ head, failures, deadline }))

    const result = resolveNextWarning({ existing, head, failures: "no-checkbox", now })

    expect(result.reset).toBe(true)
  })

  test("does not extend an already-expired window", () => {
    const expired = new Date(now.getTime() - 3_600_000)
    const existing = parseWarning(formatWarning({ head, failures, deadline: expired }))

    const result = resolveNextWarning({ existing, head, failures, now })

    expect(result.reset).toBe(false)
    expect(result.deadline).toEqual(expired)
  })

  test("resets a legacy warning with no parseable fields", () => {
    const existing = parseWarning("<!-- issue-compliance -->\nPlease fix.")

    const result = resolveNextWarning({ existing, head, failures, now })

    expect(result.reset).toBe(true)
  })
})
