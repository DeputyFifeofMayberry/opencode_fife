import { expect } from "bun:test"
import { Effect } from "effect"
import { Content } from "../../src/protocols/lowering/index.js"
import type { ContentPart } from "../../src/schema/index.js"
import { it } from "../lib/effect.js"

const policy: Content.ContentPolicy = {
  route: "Test Protocol",
  system: ["text"],
  user: ["text", "media"],
  assistant: ["text", "reasoning"],
  tool: ["tool-result"],
}

const text: ContentPart = { type: "text", text: "hi" }
const reasoning: ContentPart = { type: "reasoning", text: "thinking" }
const toolCall: ContentPart = { type: "tool-call", id: "1", name: "t", input: {} }

it.effect("accepts only the declared kinds per role", () =>
  Effect.gen(function* () {
    expect(Content.accepts(policy, "user", text)).toBe(true)
    expect(Content.accepts(policy, "user", reasoning)).toBe(false)
    expect(Content.accepts(policy, "assistant", reasoning)).toBe(true)
    expect(Content.accepts(policy, "tool", toolCall)).toBe(false)
  }))

it.effect("reports accepted kinds in canonical order, not declaration order", () =>
  Effect.gen(function* () {
    const reordered: Content.ContentPolicy = { ...policy, assistant: ["reasoning", "text"] }
    expect(Content.kindsOf(reordered, "assistant")).toEqual(["text", "reasoning"])
  }))

it.effect("fails unsupported content with the shared error shape", () =>
  Effect.gen(function* () {
    const error = yield* Effect.flip(Content.assert(policy, "user", toolCall))
    expect(error.reason._tag).toBe("InvalidRequest")
    expect(error.reason.message).toBe("Test Protocol user messages only support text and media content for now")
  }))

it.effect("accepts without mutating the part", () =>
  Effect.gen(function* () {
    const before = JSON.stringify(text)
    yield* Content.assert(policy, "user", text)
    expect(JSON.stringify(text)).toBe(before)
  }))

it.effect("lists every content part kind", () =>
  Effect.gen(function* () {
    expect(Content.PartKinds).toHaveLength(7)
  }))
