import { expect } from "bun:test"
import { Effect } from "effect"
import { ToolID } from "../../src/protocols/lowering/index.js"
import { it } from "../lib/effect.js"

const long = "call_0123456789012345678901234567890123456789"

it.effect("truncate keeps the first max characters", () =>
  Effect.sync(() => {
    expect(ToolID.truncate(40)(long)).toBe("call_01234567890123456789012345678901234")
    expect(ToolID.truncate(40)("abcdefghi")).toBe("abcdefghi")
  }))

it.effect("scrub replaces illegal characters only", () =>
  Effect.sync(() => {
    expect(ToolID.scrub(/[^a-zA-Z0-9_-]/g, "_")("call.abc:def/ghi")).toBe("call_abc_def_ghi")
    expect(ToolID.scrub(/[^a-zA-Z0-9_-]/g, "_")(long)).toBe(long)
  }))

it.effect("padded strips, slices and right-pads", () =>
  Effect.sync(() => {
    expect(ToolID.padded(9)("call.abc:def/ghi")).toBe("callabcde")
    expect(ToolID.padded(9)(long)).toBe("call01234")
    expect(ToolID.padded(9)("abcdefghi")).toBe("abcdefghi")
  }))

it.effect("identity changes nothing", () =>
  Effect.sync(() => {
    expect(ToolID.identity(long)).toBe(long)
  }))

it.effect("forModel selects the Mistral rule for Mistral-family models", () =>
  Effect.sync(() => {
    expect(ToolID.forModel({ provider: "x", modelID: "mistral-large-latest" })("call.abc:def/ghi")).toBe("callabcde")
    expect(ToolID.forModel({ provider: "x", modelID: "Devstral-Small" })("call.abc:def/ghi")).toBe("callabcde")
  }))

it.effect("forModel selects the scrub rule for claude models", () =>
  Effect.sync(() => {
    expect(ToolID.forModel({ provider: "x", modelID: "claude-sonnet-4" })("call.abc:def/ghi")).toBe("call_abc_def_ghi")
  }))

it.effect("forModel truncates for openai, azure and openai-prefixed models", () =>
  Effect.sync(() => {
    expect(ToolID.forModel({ provider: "openai", modelID: "gpt-4o" })(long)).toBe(
      "call_01234567890123456789012345678901234",
    )
    expect(ToolID.forModel({ provider: "azure", modelID: "gpt-4o" })(long)).toBe(
      "call_01234567890123456789012345678901234",
    )
    expect(ToolID.forModel({ provider: "x", modelID: "openai/gpt-4o" })(long)).toBe(
      "call_01234567890123456789012345678901234",
    )
  }))

it.effect("forModel leaves other providers untouched", () =>
  Effect.sync(() => {
    expect(ToolID.forModel({ provider: "x", modelID: "llama-3" })("call.abc:def/ghi")).toBe("call.abc:def/ghi")
  }))

it.effect("the naive Mistral rule collapses distinct ids", () =>
  Effect.sync(() => {
    const pair = ["0123456789abcdef", "012345678zabcdef"]
    const padded = pair.map(ToolID.padded(9))
    expect(padded[0]).toBe(padded[1])
  }))
