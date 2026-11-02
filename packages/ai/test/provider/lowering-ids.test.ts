import { describe, expect } from "bun:test"
import { Effect, Schema } from "effect"
import { ai, Message, ToolCallPart } from "../../src/effect.js"
import { AmazonBedrock, Mistral } from "../../src/providers.js"
import { AnthropicMessages } from "../../src/protocols/anthropic-messages.js"
import { BedrockConverse } from "../../src/protocols/bedrock-converse.js"
import { OpenAIChat } from "../../src/protocols/openai-chat.js"
import { Auth } from "../../src/route.js"
import { compileRequest } from "../../src/route/client.js"
import { it } from "../lib/effect.js"

const openaiRoute = OpenAIChat.route.with({
  endpoint: { baseURL: "https://api.openai.test/v1/" },
  auth: Auth.bearer("test"),
})
const gpt4o = openaiRoute.model({ id: "gpt-4o-mini" })
const openaiMistral = openaiRoute.model({ id: "mistral-large-latest" })

const anthropicModel = AnthropicMessages.route
  .with({ endpoint: { baseURL: "https://api.anthropic.test/v1/" }, auth: Auth.header("x-api-key", "test") })
  .model({ id: "claude-sonnet-4-5" })

const mistralModel = Mistral.configure({ apiKey: "fixture" }).model("mistral-large-latest")
const bedrockModel = AmazonBedrock.configure({
  baseURL: "https://bedrock.test",
  apiKey: "test-key",
}).model("mistral.mistral-large-2407-v1:0")

const history = (id: string) => [
  Message.user("Read the label"),
  Message.assistant(ToolCallPart.make({ id, name: "lookup", input: { label: id } })),
  Message.tool({ id, name: "lookup", result: "value" }),
]

const argumentsJson = (id: string) => JSON.stringify({ label: id })

// Every id the request carries, wherever the emitted body exposes it. Used only
// to state whether two distinct inputs collapsed onto one emitted id.
const emittedIDs = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.flatMap(emittedIDs)
  if (value === null || typeof value !== "object") return []
  return Object.entries(value).flatMap(([key, inner]) =>
    (key === "id" || key === "tool_call_id" || key === "tool_use_id" || key === "toolUseId") &&
    typeof inner === "string"
      ? [inner]
      : emittedIDs(inner),
  )
}

const openaiBody = (model: string, id: string, emitted: string) => ({
  model,
  messages: [
    { role: "user", content: "Read the label" },
    {
      role: "assistant",
      content: null,
      tool_calls: [
        { id: emitted, type: "function", function: { name: "lookup", arguments: argumentsJson(id) } },
      ],
    },
    { role: "tool", tool_call_id: emitted, content: '"value"' },
  ],
  tools: [],
  stream: true,
  stream_options: { include_usage: true },
  store: false,
})

const anthropicBody = (id: string, emitted: string) => ({
  model: "claude-sonnet-4-5",
  messages: [
    { role: "user", content: [{ type: "text", text: "Read the label" }] },
    { role: "assistant", content: [{ type: "tool_use", id: emitted, name: "lookup", input: { label: id } }] },
    { role: "user", content: [{ type: "tool_result", tool_use_id: emitted, content: '"value"' }] },
  ],
  stream: true,
  max_tokens: 32000,
})

const mistralBody = (id: string, emitted: string) => ({
  model: "mistral-large-latest",
  messages: [
    { role: "user", content: "Read the label" },
    {
      role: "assistant",
      content: "",
      tool_calls: [
        { id: emitted, type: "function", function: { name: "lookup", arguments: argumentsJson(id) } },
      ],
    },
    { role: "tool", tool_call_id: emitted, name: "lookup", content: '"value"' },
  ],
  stream: true,
})

const bedrockBody = (id: string, emitted: string) => ({
  modelId: "mistral.mistral-large-2407-v1:0",
  messages: [
    { role: "user", content: [{ text: "Read the label" }] },
    { role: "assistant", content: [{ toolUse: { toolUseId: emitted, name: "lookup", input: { label: id } } }] },
    {
      role: "user",
      content: [{ toolResult: { toolUseId: emitted, content: [{ json: "value" }], status: "success" } }],
    },
  ],
})

const openaiRequest = (model: typeof gpt4o, id: string) =>
  ai.request({ model, messages: history(id), cache: "none" })

const decodeBedrock = (body: unknown) => Schema.decodeUnknownSync(BedrockConverse.protocol.body.schema)(body)

const cases = [
  {
    label: "truncates a 45-character OpenAI id to 40 characters",
    id: "call_0123456789012345678901234567890123456789",
    gpt: "call_01234567890123456789012345678901234",
    openaiMistral: "call01234",
    anthropic: "call_0123456789012345678901234567890123456789",
    mistral: "0y0k0yf5k",
    bedrock: "0y0k0yf5k",
  },
  {
    label: "scrubs illegal characters per protocol",
    id: "call.abc:def/ghi",
    gpt: "call.abc:def/ghi",
    openaiMistral: "callabcde",
    anthropic: "call_abc_def_ghi",
    mistral: "ib1lbkrr9",
    bedrock: "ib1lbkrr9",
  },
  {
    label: "keeps an already 9-character alphanumeric id",
    id: "abcdefghi",
    gpt: "abcdefghi",
    openaiMistral: "abcdefghi",
    anthropic: "abcdefghi",
    mistral: "abcdefghi",
    bedrock: "abcdefghi",
  },
  {
    label: "keeps the first distinct hexadecimal id",
    id: "0123456789abcdef",
    gpt: "0123456789abcdef",
    openaiMistral: "012345678",
    anthropic: "0123456789abcdef",
    mistral: "jx0ngzg4r",
    bedrock: "jx0ngzg4r",
  },
  {
    label: "keeps the second distinct hexadecimal id",
    id: "012345678zabcdef",
    gpt: "012345678zabcdef",
    openaiMistral: "012345678",
    anthropic: "012345678zabcdef",
    mistral: "bc0b2ml8a",
    bedrock: "bc0b2ml8a",
  },
]

for (const entry of cases) {
  describe(entry.label, () => {
    it.effect("OpenAI Chat emits the truncated id on the call and the result", () =>
      Effect.gen(function* () {
        const prepared = yield* compileRequest(openaiRequest(gpt4o, entry.id))
        expect(prepared.body).toEqual(openaiBody("gpt-4o-mini", entry.id, entry.gpt))
      }),
    )

    it.effect("OpenAI Chat Mistral family emits a scrubbed 9-character id", () =>
      Effect.gen(function* () {
        const prepared = yield* compileRequest(openaiRequest(openaiMistral, entry.id))
        expect(prepared.body).toEqual(openaiBody("mistral-large-latest", entry.id, entry.openaiMistral))
      }),
    )

    it.effect("Anthropic Messages scrubs the id on tool_use and tool_result", () =>
      Effect.gen(function* () {
        const prepared = yield* compileRequest(
          ai.request({ model: anthropicModel, messages: history(entry.id), cache: "none" }),
        )
        expect(prepared.body).toEqual(anthropicBody(entry.id, entry.anthropic))
      }),
    )

    it.effect("Mistral Chat hashes the id on tool_calls and the tool message", () =>
      Effect.gen(function* () {
        const prepared = yield* compileRequest(
          ai.request({ model: mistralModel, messages: history(entry.id), cache: "none" }),
        )
        expect(prepared.body).toEqual(mistralBody(entry.id, entry.mistral))
      }),
    )

    it.effect("Bedrock Converse hashes the id on toolUse and toolResult", () =>
      Effect.gen(function* () {
        const prepared = yield* compileRequest(
          ai.request({ model: bedrockModel, messages: history(entry.id), cache: "none" }),
        )
        expect(decodeBedrock(prepared.body)).toEqual(bedrockBody(entry.id, entry.bedrock))
      }),
    )
  })
}

const collisionA = "0123456789abcdef"
const collisionB = "012345678zabcdef"

describe("distinct ids after normalisation", () => {
  it.effect("OpenAI Chat truncation collapses both inputs onto one id", () =>
    Effect.gen(function* () {
      const first = yield* compileRequest(openaiRequest(gpt4o, collisionA))
      const second = yield* compileRequest(openaiRequest(gpt4o, collisionB))
      expect(first.body).toEqual(openaiBody("gpt-4o-mini", collisionA, collisionA))
      expect(second.body).toEqual(openaiBody("gpt-4o-mini", collisionB, collisionB))
      expect([...new Set(emittedIDs(first.body))]).toEqual([collisionA])
      expect([...new Set(emittedIDs(second.body))]).toEqual([collisionB])
    }),
  )

  it.effect("OpenAI Chat Mistral family collapses both inputs onto one id", () =>
    Effect.gen(function* () {
      const first = yield* compileRequest(openaiRequest(openaiMistral, collisionA))
      const second = yield* compileRequest(openaiRequest(openaiMistral, collisionB))
      expect(first.body).toEqual(openaiBody("mistral-large-latest", collisionA, "012345678"))
      expect(second.body).toEqual(openaiBody("mistral-large-latest", collisionB, "012345678"))
      expect([...new Set(emittedIDs(first.body))]).toEqual(["012345678"])
      expect([...new Set(emittedIDs(second.body))]).toEqual(["012345678"])
    }),
  )

  it.effect("Anthropic Messages keeps both inputs distinct", () =>
    Effect.gen(function* () {
      const first = yield* compileRequest(
        ai.request({ model: anthropicModel, messages: history(collisionA), cache: "none" }),
      )
      const second = yield* compileRequest(
        ai.request({ model: anthropicModel, messages: history(collisionB), cache: "none" }),
      )
      expect(first.body).toEqual(anthropicBody(collisionA, collisionA))
      expect(second.body).toEqual(anthropicBody(collisionB, collisionB))
      expect([...new Set(emittedIDs(first.body))]).toEqual([collisionA])
      expect([...new Set(emittedIDs(second.body))]).toEqual([collisionB])
    }),
  )

  it.effect("Mistral Chat hashes both inputs to distinct ids", () =>
    Effect.gen(function* () {
      const first = yield* compileRequest(
        ai.request({ model: mistralModel, messages: history(collisionA), cache: "none" }),
      )
      const second = yield* compileRequest(
        ai.request({ model: mistralModel, messages: history(collisionB), cache: "none" }),
      )
      expect(first.body).toEqual(mistralBody(collisionA, "jx0ngzg4r"))
      expect(second.body).toEqual(mistralBody(collisionB, "bc0b2ml8a"))
      expect([...new Set(emittedIDs(first.body))]).toEqual(["jx0ngzg4r"])
      expect([...new Set(emittedIDs(second.body))]).toEqual(["bc0b2ml8a"])
    }),
  )

  it.effect("Bedrock Converse hashes both inputs to distinct ids", () =>
    Effect.gen(function* () {
      const first = yield* compileRequest(
        ai.request({ model: bedrockModel, messages: history(collisionA), cache: "none" }),
      )
      const second = yield* compileRequest(
        ai.request({ model: bedrockModel, messages: history(collisionB), cache: "none" }),
      )
      expect(decodeBedrock(first.body)).toEqual(bedrockBody(collisionA, "jx0ngzg4r"))
      expect(decodeBedrock(second.body)).toEqual(bedrockBody(collisionB, "bc0b2ml8a"))
      expect([...new Set(emittedIDs(decodeBedrock(first.body)))]).toEqual(["jx0ngzg4r"])
      expect([...new Set(emittedIDs(decodeBedrock(second.body)))]).toEqual(["bc0b2ml8a"])
    }),
  )
})
