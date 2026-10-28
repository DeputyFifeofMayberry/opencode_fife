import { describe, expect, test } from "bun:test"
import { measureEditText } from "@opentui/core"
import {
  isCompactCommand,
  isExitCommand,
  isNewCommand,
  promptAppend,
} from "../../src/mini/prompt.shared"
import type { RunPrompt } from "../../src/mini/types"

function prompt(text: string, parts: RunPrompt["parts"] = []): RunPrompt {
  return { text, parts }
}

describe("run prompt shared", () => {
  test("recognizes exit commands", () => {
    expect(isExitCommand("/exit")).toBe(true)
    expect(isExitCommand(" /Quit ")).toBe(true)
    expect(isExitCommand("/quit now")).toBe(false)
  })

  test("recognizes the new-session command", () => {
    expect(isNewCommand("/new")).toBe(true)
    expect(isNewCommand(" /NEW ")).toBe(true)
    expect(isNewCommand("/new now")).toBe(false)
  })

  test("recognizes only the compact command", () => {
    expect(isCompactCommand("/compact")).toBe(true)
    expect(isCompactCommand(" /COMPACT ")).toBe(true)
    expect(isCompactCommand("/summarize")).toBe(false)
  })
})

describe("promptAppend", () => {
  test.each(["wcwidth", "unicode"] as const)("appends and shifts part ranges by the %s offset", (widthMethod) => {
    const output = promptAppend(
      prompt("日本👨‍👩‍👧\t", [{ type: "agent", name: "plan", source: { start: 0, end: 4, value: "日本" } }]),
      {
        messageID: "m-1",
        ...prompt("@a.ts /x", [
          { type: "file", url: "file:///a.ts", source: { type: "file", text: { start: 0, end: 5, value: "@a.ts" } } },
          { type: "skill", id: "x", source: { start: 6, end: 8, value: "/x" } },
        ]),
      },
      widthMethod,
    )

    const offset = measureEditText("日本👨‍👩‍👧\t\n\n", { widthMethod })
    expect(output).toEqual({
      text: "日本👨‍👩‍👧\t\n\n@a.ts /x",
      parts: [
        { type: "agent", name: "plan", source: { start: 0, end: 4, value: "日本" } },
        {
          type: "file",
          url: "file:///a.ts",
          source: { type: "file", text: { start: offset, end: offset + 5, value: "@a.ts" } },
        },
        { type: "skill", id: "x", source: { start: offset + 6, end: offset + 8, value: "/x" } },
      ],
    })
    expect(promptAppend(prompt(""), prompt("next"), widthMethod)).toEqual(prompt("next"))
  })
})
