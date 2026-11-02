import { describe, expect } from "bun:test"
import { Effect } from "effect"
import { ai, Media, Message, ToolCallPart } from "../../src/effect.js"
import * as BedrockConverse from "../../src/protocols/bedrock-converse.js"
import * as Gemini from "../../src/protocols/gemini.js"
import * as GoogleInteractions from "../../src/protocols/google-interactions.js"
import { AmazonBedrock, Google } from "../../src/providers.js"
import { Auth } from "../../src/route.js"
import { it } from "../lib/effect.js"

const bedrockModel = AmazonBedrock.configure({
  baseURL: "https://bedrock-runtime.test",
  apiKey: "test-bearer",
}).model("anthropic.claude-sonnet-4-5-20250929-v1:0")

const geminiModel = Gemini.route
  .with({
    endpoint: { baseURL: "https://generativelanguage.test/v1beta/" },
    auth: Auth.header("x-goog-api-key", "test"),
  })
  .model({ id: "gemini-2.5-flash" })

const interactionsModel = Google.configure({
  apiKey: "test",
  baseURL: "https://generativelanguage.test/v1beta",
}).interactions("gemini-3.8-flash")

const toolCall = ToolCallPart.make({ id: "tool_1", name: "lookup", input: { query: "weather" } })
const toolResult = Message.tool({ id: "tool_1", name: "lookup", result: { forecast: "sunny" } })

describe("Bedrock Converse lowering", () => {
  it.effect("keeps a chronological system update between a tool call and its tool result", () =>
    Effect.gen(function* () {
      const body = yield* BedrockConverse.protocol.body.from(
        ai.request({
          model: bedrockModel,
          messages: [Message.user("Question."), Message.assistant([toolCall]), Message.system("Update."), toolResult],
          cache: "none",
        }),
      )

      expect(body).toEqual({
        modelId: "anthropic.claude-sonnet-4-5-20250929-v1:0",
        messages: [
          { role: "user", content: [{ text: "Question." }] },
          { role: "assistant", content: [{ toolUse: { toolUseId: "tool_1", name: "lookup", input: { query: "weather" } } }] },
          {
            role: "user",
            content: [
              { text: "<system-update>\nUpdate.\n</system-update>" },
              { toolResult: { toolUseId: "tool_1", content: [{ json: { forecast: "sunny" } }], status: "success" } },
            ],
          },
        ],
      })
    }),
  )

  it.effect("drops an assistant message with empty content", () =>
    Effect.gen(function* () {
      const body = yield* BedrockConverse.protocol.body.from(
        ai.request({
          model: bedrockModel,
          messages: [Message.user("Question."), Message.assistant([])],
          cache: "none",
        }),
      )

      expect(body).toEqual({
        modelId: "anthropic.claude-sonnet-4-5-20250929-v1:0",
        messages: [{ role: "user", content: [{ text: "Question." }] }],
      })
    }),
  )

  it.effect("keeps an assistant message whose only part is whitespace text", () =>
    Effect.gen(function* () {
      const body = yield* BedrockConverse.protocol.body.from(
        ai.request({
          model: bedrockModel,
          messages: [Message.user("Question."), Message.assistant([{ type: "text", text: "   " }])],
          cache: "none",
        }),
      )

      expect(body).toEqual({
        modelId: "anthropic.claude-sonnet-4-5-20250929-v1:0",
        messages: [
          { role: "user", content: [{ text: "Question." }] },
          { role: "assistant", content: [{ text: "   " }] },
        ],
      })
    }),
  )

  it.effect("drops an assistant message whose only part is unsigned reasoning", () =>
    Effect.gen(function* () {
      const body = yield* BedrockConverse.protocol.body.from(
        ai.request({
          model: bedrockModel,
          messages: [Message.user("Question."), Message.assistant([{ type: "reasoning", text: "Thinking." }])],
          cache: "none",
        }),
      )

      expect(body).toEqual({
        modelId: "anthropic.claude-sonnet-4-5-20250929-v1:0",
        messages: [{ role: "user", content: [{ text: "Question." }] }],
      })
    }),
  )

  it.effect("replays a tool call and result without a toolConfig when tools is empty", () =>
    Effect.gen(function* () {
      const body = yield* BedrockConverse.protocol.body.from(
        ai.request({
          model: bedrockModel,
          messages: [Message.assistant([toolCall]), toolResult],
          tools: [],
          cache: "none",
        }),
      )

      expect(body).toEqual({
        modelId: "anthropic.claude-sonnet-4-5-20250929-v1:0",
        messages: [
          { role: "assistant", content: [{ toolUse: { toolUseId: "tool_1", name: "lookup", input: { query: "weather" } } }] },
          {
            role: "user",
            content: [
              { toolResult: { toolUseId: "tool_1", content: [{ json: { forecast: "sunny" } }], status: "success" } },
            ],
          },
        ],
      })
    }),
  )

  it.effect("lowers an uppercase image media type", () =>
    Effect.gen(function* () {
      const body = yield* BedrockConverse.protocol.body.from(
        ai.request({
          model: bedrockModel,
          messages: [Message.user([{ type: "media", media: Media.base64("AAECAw==", "IMAGE/PNG") }])],
          cache: "none",
        }),
      )

      expect(body).toEqual({
        modelId: "anthropic.claude-sonnet-4-5-20250929-v1:0",
        messages: [{ role: "user", content: [{ image: { format: "png", source: { bytes: "AAECAw==" } } }] }],
      })
    }),
  )
})

describe("Gemini lowering", () => {
  it.effect("keeps a chronological system update between a tool call and its tool result", () =>
    Effect.gen(function* () {
      const body = yield* Gemini.protocol.body.from(
        ai.request({
          model: geminiModel,
          messages: [Message.user("Question."), Message.assistant([toolCall]), Message.system("Update."), toolResult],
        }),
      )

      expect(body).toEqual({
        contents: [
          { role: "user", parts: [{ text: "Question." }] },
          {
            role: "model",
            parts: [
              {
                functionCall: { name: "lookup", args: { query: "weather" } },
                thoughtSignature: "skip_thought_signature_validator",
              },
            ],
          },
          { role: "user", parts: [{ text: "<system-update>\nUpdate.\n</system-update>" }] },
          {
            role: "user",
            parts: [{ functionResponse: { name: "lookup", response: { name: "lookup", content: '{"forecast":"sunny"}' } } }],
          },
        ],
      })
    }),
  )

  it.effect("keeps an assistant message with empty content as an empty model turn", () =>
    Effect.gen(function* () {
      const body = yield* Gemini.protocol.body.from(
        ai.request({ model: geminiModel, messages: [Message.user("Question."), Message.assistant([])] }),
      )

      expect(body).toEqual({
        contents: [
          { role: "user", parts: [{ text: "Question." }] },
          { role: "model", parts: [] },
        ],
      })
    }),
  )

  it.effect("keeps an assistant message whose only part is whitespace text", () =>
    Effect.gen(function* () {
      const body = yield* Gemini.protocol.body.from(
        ai.request({
          model: geminiModel,
          messages: [Message.user("Question."), Message.assistant([{ type: "text", text: "   " }])],
        }),
      )

      expect(body).toEqual({
        contents: [
          { role: "user", parts: [{ text: "Question." }] },
          { role: "model", parts: [{ text: "   " }] },
        ],
      })
    }),
  )

  it.effect("keeps unsigned reasoning as a thought part without a signature", () =>
    Effect.gen(function* () {
      const body = yield* Gemini.protocol.body.from(
        ai.request({
          model: geminiModel,
          messages: [Message.user("Question."), Message.assistant([{ type: "reasoning", text: "Thinking." }])],
        }),
      )

      expect(body).toEqual({
        contents: [
          { role: "user", parts: [{ text: "Question." }] },
          { role: "model", parts: [{ text: "Thinking.", thought: true }] },
        ],
      })
    }),
  )

  it.effect("replays a tool call and result without a tools key when tools is empty", () =>
    Effect.gen(function* () {
      const body = yield* Gemini.protocol.body.from(
        ai.request({
          model: geminiModel,
          messages: [Message.assistant([toolCall]), toolResult],
          tools: [],
        }),
      )

      expect(body).toEqual({
        contents: [
          {
            role: "model",
            parts: [
              {
                functionCall: { name: "lookup", args: { query: "weather" } },
                thoughtSignature: "skip_thought_signature_validator",
              },
            ],
          },
          {
            role: "user",
            parts: [{ functionResponse: { name: "lookup", response: { name: "lookup", content: '{"forecast":"sunny"}' } } }],
          },
        ],
      })
    }),
  )

  it.effect("lowers an uppercase image media type", () =>
    Effect.gen(function* () {
      const body = yield* Gemini.protocol.body.from(
        ai.request({
          model: geminiModel,
          messages: [Message.user([{ type: "media", media: Media.base64("AAECAw==", "IMAGE/PNG") }])],
        }),
      )

      expect(body).toEqual({
        contents: [{ role: "user", parts: [{ inlineData: { mimeType: "image/png", data: "AAECAw==" } }] }],
      })
    }),
  )
})

describe("Google Interactions lowering", () => {
  it.effect("keeps a chronological system update between a tool call and its tool result", () =>
    Effect.gen(function* () {
      const body = yield* GoogleInteractions.protocol.body.from(
        ai.request({
          model: interactionsModel,
          messages: [Message.user("Question."), Message.assistant([toolCall]), Message.system("Update."), toolResult],
        }),
      )

      expect(body).toEqual({
        model: "gemini-3.8-flash",
        input: [
          { type: "user_input", content: [{ type: "text", text: "Question." }] },
          {
            type: "function_call",
            id: "tool_1",
            name: "lookup",
            arguments: { query: "weather" },
            signature: "skip_thought_signature_validator",
          },
          { type: "user_input", content: [{ type: "text", text: "<system-update>\nUpdate.\n</system-update>" }] },
          { type: "function_result", call_id: "tool_1", name: "lookup", result: { forecast: "sunny" } },
        ],
        stream: true,
        store: false,
        generation_config: {},
      })
    }),
  )

  it.effect("drops an assistant message with empty content", () =>
    Effect.gen(function* () {
      const body = yield* GoogleInteractions.protocol.body.from(
        ai.request({ model: interactionsModel, messages: [Message.user("Question."), Message.assistant([])] }),
      )

      expect(body).toEqual({
        model: "gemini-3.8-flash",
        input: [{ type: "user_input", content: [{ type: "text", text: "Question." }] }],
        stream: true,
        store: false,
        generation_config: {},
      })
    }),
  )

  it.effect("keeps an assistant message whose only part is whitespace text", () =>
    Effect.gen(function* () {
      const body = yield* GoogleInteractions.protocol.body.from(
        ai.request({
          model: interactionsModel,
          messages: [Message.user("Question."), Message.assistant([{ type: "text", text: "   " }])],
        }),
      )

      expect(body).toEqual({
        model: "gemini-3.8-flash",
        input: [
          { type: "user_input", content: [{ type: "text", text: "Question." }] },
          { type: "model_output", content: [{ type: "text", text: "   " }] },
        ],
        stream: true,
        store: false,
        generation_config: {},
      })
    }),
  )

  it.effect("keeps unsigned reasoning as a thought step without a signature", () =>
    Effect.gen(function* () {
      const body = yield* GoogleInteractions.protocol.body.from(
        ai.request({
          model: interactionsModel,
          messages: [Message.user("Question."), Message.assistant([{ type: "reasoning", text: "Thinking." }])],
        }),
      )

      expect(body).toEqual({
        model: "gemini-3.8-flash",
        input: [
          { type: "user_input", content: [{ type: "text", text: "Question." }] },
          { type: "thought", summary: [{ type: "text", text: "Thinking." }] },
        ],
        stream: true,
        store: false,
        generation_config: {},
      })
    }),
  )

  it.effect("replays a tool call and result without a tools key when tools is empty", () =>
    Effect.gen(function* () {
      const body = yield* GoogleInteractions.protocol.body.from(
        ai.request({
          model: interactionsModel,
          messages: [Message.assistant([toolCall]), toolResult],
          tools: [],
        }),
      )

      expect(body).toEqual({
        model: "gemini-3.8-flash",
        input: [
          { type: "function_call", id: "tool_1", name: "lookup", arguments: { query: "weather" }, signature: "skip_thought_signature_validator" },
          { type: "function_result", call_id: "tool_1", name: "lookup", result: { forecast: "sunny" } },
        ],
        stream: true,
        store: false,
        generation_config: {},
      })
    }),
  )

  it.effect("lowers an uppercase image media type", () =>
    Effect.gen(function* () {
      const body = yield* GoogleInteractions.protocol.body.from(
        ai.request({
          model: interactionsModel,
          messages: [Message.user([{ type: "media", media: Media.base64("AAECAw==", "IMAGE/PNG") }])],
        }),
      )

      expect(body).toEqual({
        model: "gemini-3.8-flash",
        input: [
          { type: "user_input", content: [{ type: "image", data: "AAECAw==", mime_type: "image/png" }] },
        ],
        stream: true,
        store: false,
        generation_config: {},
      })
    }),
  )
})
