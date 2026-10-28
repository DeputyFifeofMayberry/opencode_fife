import { describe, expect, test } from "bun:test"
import { measureEditText } from "@opentui/core"
import {
  createPromptHistory,
  movePromptHistory,
  pushPromptHistory,
} from "../../src/prompt/history-machine"
import type { RunPrompt } from "../../src/mini/types"

function prompt(text: string, parts: RunPrompt["parts"] = []): RunPrompt {
  return { text, parts }
}

const significant = (item: RunPrompt) =>
  item.text.trim().length > 0 || item.parts.some((part) => part.type === "file")

// Mirrors mini's promptSame: identity fields such as messageID are ignored.
const same = (a: RunPrompt, b: RunPrompt) =>
  JSON.stringify({ text: a.text, parts: a.parts, mode: a.mode, command: a.command }) ===
  JSON.stringify({ text: b.text, parts: b.parts, mode: b.mode, command: b.command })

const policy = { significant, same }

describe("prompt history machine", () => {
  test("filters non-significant prompts and dedupes consecutive history", () => {
    const out = createPromptHistory(
      [prompt("   "), prompt("one"), prompt("one"), prompt("two"), prompt("one")],
      policy,
    )

    expect(out.items.map((item) => item.text)).toEqual(["one", "two", "one"])
    expect(out.index).toBeNull()
    expect(out.stash).toBeNull()
  })

  test("keeps only significant prompts without text", () => {
    const out = createPromptHistory([prompt("", [{ type: "agent", name: "plan", source: { start: 0, end: 0, value: "" } }])], policy)

    expect(out.items).toHaveLength(0)
    const fileOnly = prompt("", [{ type: "file", url: "file:///a.ts", source: { type: "file", path: "a.ts", text: { start: 0, end: 5, value: "@a.ts" } } }])
    expect(createPromptHistory([fileOnly], policy).items).toHaveLength(1)
  })

  test("push ignores non-significant items and dedupes only the latest item", () => {
    const base = createPromptHistory([prompt("one")], policy)

    expect(pushPromptHistory(base, prompt("   "), policy).items.map((item) => item.text)).toEqual(["one"])
    expect(pushPromptHistory(base, prompt("one"), policy).items.map((item) => item.text)).toEqual(["one"])
    expect(pushPromptHistory(base, prompt("two"), policy).items.map((item) => item.text)).toEqual(["one", "two"])
  })

  test("push resets the browse position and stash", () => {
    const browsed = movePromptHistory(createPromptHistory([prompt("one")], policy), -1, prompt("draft"), "wcwidth")
    expect(browsed.apply).toBe(true)

    const pushed = pushPromptHistory(browsed.state, prompt("two"), policy)
    expect(pushed.index).toBeNull()
    expect(pushed.stash).toBeNull()
  })

  test("does nothing on an empty history", () => {
    const base = createPromptHistory<RunPrompt>([], policy)
    expect(movePromptHistory(base, -1, prompt("draft"), "wcwidth")).toEqual({ state: base, apply: false })
    expect(movePromptHistory(base, 1, prompt("draft"), "wcwidth")).toEqual({ state: base, apply: false })
  })

  test("down before any up does nothing", () => {
    const base = createPromptHistory([prompt("one")], policy)
    expect(movePromptHistory(base, 1, prompt("draft"), "wcwidth")).toEqual({ state: base, apply: false })
  })

  test.each(["wcwidth", "unicode"] as const)(
    "recalls at the end of the text and round-trips the draft at %s boundaries",
    (widthMethod) => {
      const measure = (text: string) => measureEditText(text, { widthMethod })
      const [wide, draftPrompt] = [prompt("中文👨‍👩‍👧\n\t"), prompt("草稿👨‍👩‍👧\f")]
      const base = createPromptHistory([prompt("one"), wide], policy)

      // Engage is the caller's decision (first/last visual row); the machine recalls with the cursor at the end.
      const up = movePromptHistory(base, -1, draftPrompt, widthMethod)
      expect(up.apply).toBe(true)
      expect(up.prompt?.text).toBe(wide.text)
      expect(up.cursor).toBe(measure(wide.text))
      expect(up.state.index).toBe(1)
      expect(up.state.stash).toEqual(draftPrompt)

      const older = movePromptHistory(up.state, -1, wide, widthMethod)
      expect(older).toMatchObject({ apply: true, prompt: prompt("one"), cursor: measure("one"), state: { index: 0 } })

      const newer = movePromptHistory(older.state, 1, prompt("one"), widthMethod)
      expect(newer).toMatchObject({ apply: true, prompt: wide, cursor: measure(wide.text), state: { index: 1 } })

      const back = movePromptHistory(newer.state, 1, wide, widthMethod)
      expect(back).toMatchObject({ apply: true, prompt: draftPrompt, cursor: measure(draftPrompt.text) })
      expect(back.state.index).toBeNull()
      expect(back.state.stash).toBeNull()
    },
  )

  test("engaging stashes a copy, so later edits to the buffer do not leak into the stash", () => {
    const current = prompt("draft", [{ type: "agent", name: "plan", source: { start: 0, end: 4, value: "plan" } }])
    const up = movePromptHistory(createPromptHistory([prompt("one")], policy), -1, current, "wcwidth")
    expect(up.state.stash).toEqual(current)

    current.text = "edited"
    current.parts[0]!.source = { ...current.parts[0]!.source, start: 9, end: 9, value: "x" }
    expect(up.state.stash?.text).toBe("draft")
    expect(up.state.stash?.parts[0]?.source).toEqual({ start: 0, end: 4, value: "plan" })
  })

  test("up at the oldest entry does nothing so the caller can move the cursor", () => {
    const up = movePromptHistory(createPromptHistory([prompt("one")], policy), -1, prompt("draft"), "wcwidth")
    expect(movePromptHistory(up.state, -1, prompt("one"), "wcwidth")).toEqual({ state: up.state, apply: false })
  })
})
