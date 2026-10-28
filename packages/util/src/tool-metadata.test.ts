import { describe, expect, test } from "bun:test"
import { toolAnswers, toolDiagnostics, toolQuestions } from "./tool-metadata.js"

const diagnostic = (overrides: Record<string, unknown> = {}) => ({
  range: { start: { line: 2, character: 4 } },
  message: "boom",
  severity: 1,
  ...overrides,
})

describe("toolQuestions", () => {
  test("decodes each entry on its own, dropping malformed ones", () => {
    expect(toolQuestions([{}, { question: 1 }, { question: "Continue?" }])).toEqual([{ question: "Continue?" }])
  })

  test("returns no questions for non-array input", () => {
    expect(toolQuestions(undefined)).toEqual([])
    expect(toolQuestions({ question: "x" })).toEqual([])
  })
})

describe("toolAnswers", () => {
  test("decodes one slot per question, keeping indices aligned", () => {
    expect(toolAnswers([null, ["yes", 1], "no"])).toEqual([[], ["yes"], []])
    expect(toolAnswers([["yes", "no"], ["later"]])).toEqual([["yes", "no"], ["later"]])
  })

  test("is undefined until the tool answers", () => {
    expect(toolAnswers(undefined)).toBeUndefined()
    expect(toolAnswers({})).toBeUndefined()
  })
})

describe("toolDiagnostics", () => {
  test("keeps severity-1 diagnostics for the file, capped at three", () => {
    const byFile = {
      "a.ts": [diagnostic(), diagnostic({ message: "two" }), diagnostic({ message: "three" }), diagnostic({ message: "four" })],
    }
    expect(toolDiagnostics(byFile, "a.ts").map((entry) => entry.message)).toEqual(["boom", "two", "three"])
  })

  test("drops other severities and malformed entries", () => {
    expect(
      toolDiagnostics(
        { "a.ts": [diagnostic({ severity: 2 }), { message: "no range" }, { range: { start: { line: 1 } } }] },
        "a.ts",
      ),
    ).toEqual([])
  })

  test("rejects non-finite positions", () => {
    expect(toolDiagnostics({ "a.ts": [diagnostic({ range: { start: { line: Number.NaN, character: 0 } } })] }, "a.ts")).toEqual(
      [],
    )
  })

  test("returns nothing without a file path or a record", () => {
    expect(toolDiagnostics({ "a.ts": [diagnostic()] }, undefined)).toEqual([])
    expect(toolDiagnostics(undefined, "a.ts")).toEqual([])
    expect(toolDiagnostics("nope", "a.ts")).toEqual([])
  })

  test("returns nothing for an unlisted file", () => {
    expect(toolDiagnostics({ "a.ts": [diagnostic()] }, "b.ts")).toEqual([])
  })
})
