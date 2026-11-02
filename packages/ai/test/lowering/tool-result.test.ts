import { expect } from "bun:test"
import { Effect } from "effect"
import { ToolResult } from "../../src/protocols/lowering/index.js"
import type { ToolResultPart } from "../../src/schema/index.js"
import { it } from "../lib/effect.js"

const part = (result: ToolResultPart["result"]): ToolResultPart => ({
  type: "tool-result",
  id: "call_1",
  name: "read",
  result,
})

const file = { type: "file" as const, uri: "data:text/plain;base64,aGk=", mime: "text/plain", name: "a.txt" }

it.effect("returns a plain string result as text", () =>
  Effect.gen(function* () {
    const plan = yield* ToolResult.plan("Test", part({ type: "text", value: "hello" }), "allow")
    expect(plan).toEqual({ type: "text", text: "hello" })
  }))

it.effect("returns an error result as text", () =>
  Effect.gen(function* () {
    const plan = yield* ToolResult.plan("Test", part({ type: "error", value: "boom" }), "allow")
    expect(plan).toEqual({ type: "text", text: "boom" })
  }))

it.effect("encodes a json result", () =>
  Effect.gen(function* () {
    const plan = yield* ToolResult.plan("Test", part({ type: "json", value: { a: 1 } }), "allow")
    expect(plan).toEqual({ type: "text", text: '{"a":1}' })
  }))

it.effect("splits content into texts and files without joining", () =>
  Effect.gen(function* () {
    const plan = yield* ToolResult.plan(
      "Test",
      part({
        type: "content",
        value: [
          { type: "text", text: "first" },
          { type: "text", text: "second" },
          file,
        ],
      }),
      "allow",
    )
    expect(plan.type).toBe("content")
    if (plan.type !== "content") return
    expect(plan.texts).toEqual(["first", "second"])
    expect(plan.files).toHaveLength(1)
    expect(plan.files[0].filename).toBe("a.txt")
    expect(plan.files[0].media.mediaType).toBe("text/plain")
  }))

it.effect("keeps an empty content result empty", () =>
  Effect.gen(function* () {
    const plan = yield* ToolResult.plan("Test", part({ type: "content", value: [] }), "allow")
    expect(plan).toEqual({ type: "content", texts: [], files: [] })
  }))

it.effect("rejects files when the protocol cannot carry them", () =>
  Effect.gen(function* () {
    const error = yield* Effect.flip(
      ToolResult.plan("Cohere Chat", part({ type: "content", value: [file] }), "reject"),
    )
    expect(error.reason._tag).toBe("InvalidRequest")
    expect(error.reason.message).toBe("Cohere Chat does not support file content in tool results")
  }))

it.effect("allows text under the reject policy when there are no files", () =>
  Effect.gen(function* () {
    const plan = yield* ToolResult.plan("Cohere Chat", part({ type: "content", value: [{ type: "text", text: "ok" }] }), "reject")
    expect(plan).toEqual({ type: "content", texts: ["ok"], files: [] })
  }))
