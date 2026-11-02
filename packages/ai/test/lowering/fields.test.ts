import { expect } from "bun:test"
import { Effect } from "effect"
import { Fields } from "../../src/protocols/lowering/index.js"
import type { ContentPart } from "../../src/schema/index.js"
import { it } from "../lib/effect.js"

const text: ContentPart = { type: "text", text: "hi" }
const call: ContentPart = { type: "tool-call", id: "1", name: "t", input: {} }
const result: ContentPart = {
  type: "tool-result",
  id: "1",
  name: "t",
  result: { type: "text", value: "ok" },
}

it.effect("detects tool history from a tool message", () =>
  Effect.sync(() => {
    expect(Fields.hasToolHistory([{ role: "user", content: [text] }, { role: "tool", content: [result] }])).toBe(true)
  }))

it.effect("detects tool history from an assistant tool call", () =>
  Effect.sync(() => {
    expect(Fields.hasToolHistory([{ role: "assistant", content: [call] }])).toBe(true)
  }))

it.effect("reports no history for text-only or empty conversations", () =>
  Effect.sync(() => {
    expect(Fields.hasToolHistory([])).toBe(false)
    expect(Fields.hasToolHistory([{ role: "user", content: [text] }])).toBe(false)
  }))

it.effect("an explicit provider option wins", () =>
  Effect.sync(() => {
    expect(Fields.parallelToolCalls({ toolChoice: { disableParallelToolUse: true } }, false)).toBe(false)
    expect(Fields.parallelToolCalls({}, true)).toBe(true)
  }))

it.effect("the tool choice decides when no option is set", () =>
  Effect.sync(() => {
    expect(Fields.parallelToolCalls({ toolChoice: { disableParallelToolUse: true } })).toBe(false)
    expect(Fields.parallelToolCalls({ toolChoice: { disableParallelToolUse: false } })).toBe(true)
    expect(Fields.parallelToolCalls({})).toBeUndefined()
  }))
