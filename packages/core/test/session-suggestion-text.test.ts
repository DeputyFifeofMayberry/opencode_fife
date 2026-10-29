import { describe, expect, test } from "bun:test"
import { INSTRUCTION, sanitize } from "@opencode/core/session/suggestion-text"

describe("SessionSuggestionText.sanitize", () => {
  test("keeps prompt-shaped suggestions", () => {
    const kept = [
      "run the tests",
      "commit this",
      "try it out",
      "count to 20",
      "add error handling for the empty case",
      "fix the flaky watcher test",
      "/compact",
      "yes",
      "continue",
    ]
    for (const text of kept) expect(sanitize(text)).toBe(text)
  })

  test("strips wrapper formatting before judging", () => {
    expect(sanitize('  "run the tests" ')).toBe("run the tests")
    expect(sanitize("`commit this`")).toBe("commit this")
    expect(sanitize("```run the tests```")).toBe("run the tests")
    expect(sanitize("```bash\nci\n```")).toBeUndefined()
    expect(sanitize("Add a test.")).toBe("Add a test")
  })

  test("rejects unusable output", () => {
    const rejected = [
      "",
      "   ",
      "NONE",
      "none",
      "line one\nline two",
      "run the tests and then also add a changelog entry and update the readme and finally commit everything",
      "what about the failing test?",
      "run the tests. then commit. then push.",
      "run **the** tests",
      "Summary: run the tests",
      "1. run the tests",
      "(run the tests)",
      "[run the tests]",
      "done",
      "Sure, I can run the tests",
      "Let me check the test output first",
      "Here is what I found so far",
      "Thanks!",
      "looks good",
      "that works",
      "perfect",
      "api error: rate limited",
      "request timed out",
      "nothing to suggest",
      "no suggestion available",
      "run the tests ".repeat(30),
    ]
    for (const text of rejected) expect(sanitize(text), text).toBeUndefined()
  })

  test("instruction asks for prompt-shaped output", () => {
    expect(INSTRUCTION).toContain("SUGGESTION MODE")
    expect(INSTRUCTION).toContain("NONE")
    expect(INSTRUCTION.split("\n").every((line) => !line.includes("\t"))).toBe(true)
  })
})
