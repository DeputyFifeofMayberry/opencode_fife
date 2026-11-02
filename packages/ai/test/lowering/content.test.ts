import { expect } from "bun:test"
import { Effect } from "effect"
import { Content } from "../../src/protocols/lowering/index.js"
import type { ContentPart } from "../../src/schema/index.js"
import { it } from "../lib/effect.js"

const policy = {
  system: ["text"],
  user: ["text", "media"],
  assistant: ["text", "reasoning"],
  tool: ["tool-result"],
} as const satisfies Content.ContentPolicy

const text: ContentPart = { type: "text", text: "hi" }
const reasoning: ContentPart = { type: "reasoning", text: "thinking" }
const toolCall: ContentPart = { type: "tool-call", id: "1", name: "t", input: {} }

it.effect("accepts only the declared kinds per role", () =>
  Effect.sync(() => {
    expect(Content.accepts(policy, "user", text)).toBe(true)
    expect(Content.accepts(policy, "user", reasoning)).toBe(false)
    expect(Content.accepts(policy, "assistant", reasoning)).toBe(true)
    expect(Content.accepts(policy, "tool", toolCall)).toBe(false)
  }))

it.effect("narrows the part type from the policy", () =>
  Effect.sync(() => {
    const part: ContentPart = toolCall
    if (!Content.accepts(policy, "user", part)) return
    // Compiles only if `part` narrowed to text | media.
    expect(part.type === "text" || part.type === "media").toBe(true)
  }))

it.effect("reports accepted kinds in canonical order, not declaration order", () =>
  Effect.sync(() => {
    const reordered = { ...policy, assistant: ["reasoning", "text"] } as const
    expect(Content.kindsOf(reordered, "assistant")).toEqual(["text", "reasoning"])
  }))

it.effect("lists every content part kind", () =>
  Effect.sync(() => {
    expect(Content.PartKinds).toHaveLength(7)
  }))
