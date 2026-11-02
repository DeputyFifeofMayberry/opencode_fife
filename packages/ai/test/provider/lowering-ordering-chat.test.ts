import { describe, expect } from "bun:test"
import { Effect } from "effect"
import { ai, Media, Message, ToolCallPart } from "../../src/effect.js"
import { AnthropicMessages } from "../../src/protocols/anthropic-messages.js"
import { OpenAIChat } from "../../src/protocols/openai-chat.js"
import { Auth } from "../../src/route.js"
import { it } from "../lib/effect.js"

const openai = OpenAIChat.route
  .with({ endpoint: { baseURL: "https://api.openai.test/v1/" }, auth: Auth.bearer("test") })
  .model({ id: "gpt-4o-mini" })

const anthropic = AnthropicMessages.route
  .with({ endpoint: { baseURL: "https://api.anthropic.test/v1/" }, auth: Auth.header("x-api-key", "test") })
  .model({ id: "claude-sonnet-4-5" })

const toolCall = () =>
  Message.assistant([ToolCallPart.make({ id: "call_1", name: "lookup", input: { query: "weather" } })])
const toolResult = () => Message.tool({ id: "call_1", name: "lookup", result: { forecast: "sunny" } })

const lowerOpenAI = (messages: ReadonlyArray<Message>) =>
  OpenAIChat.protocol.body.from(ai.request({ model: openai, messages }))

const lowerAnthropic = (messages: ReadonlyArray<Message>) =>
  AnthropicMessages.protocol.body.from(ai.request({ model: anthropic, messages, cache: "none" }))

describe("OpenAI Chat message ordering", () => {
  it.effect("moves a system update between a tool call and its result", () =>
    Effect.gen(function* () {
      const body = yield* lowerOpenAI([
        Message.user("What is the weather?"),
        toolCall(),
        Message.system("Stay brief."),
        toolResult(),
      ])

      expect(body).toEqual({
        model: "gpt-4o-mini",
        messages: [
          { role: "user", content: "What is the weather?" },
          {
            role: "assistant",
            content: null,
            tool_calls: [
              { id: "call_1", type: "function", function: { name: "lookup", arguments: '{"query":"weather"}' } },
            ],
          },
          { role: "user", content: "<system-update>\nStay brief.\n</system-update>" },
          { role: "tool", tool_call_id: "call_1", content: '{"forecast":"sunny"}' },
        ],
        tools: [],
        stream: true,
        stream_options: { include_usage: true },
        store: false,
      })
    }),
  )

  it.effect("drops an assistant message with no parts", () =>
    Effect.gen(function* () {
      const body = yield* lowerOpenAI([Message.user("Before."), Message.assistant([]), Message.user("After.")])

      expect(body).toEqual({
        model: "gpt-4o-mini",
        messages: [
          { role: "user", content: "Before." },
          { role: "user", content: "After." },
        ],
        stream: true,
        stream_options: { include_usage: true },
        store: false,
      })
    }),
  )

  it.effect("drops an assistant message whose only part is whitespace text", () =>
    Effect.gen(function* () {
      const body = yield* lowerOpenAI([
        Message.user("Before."),
        Message.assistant([{ type: "text", text: "   " }]),
        Message.user("After."),
      ])

      expect(body).toEqual({
        model: "gpt-4o-mini",
        messages: [
          { role: "user", content: "Before." },
          { role: "user", content: "After." },
        ],
        stream: true,
        stream_options: { include_usage: true },
        store: false,
      })
    }),
  )

  it.effect("lowers an unsigned reasoning-only assistant message", () =>
    Effect.gen(function* () {
      const body = yield* lowerOpenAI([
        Message.user("Before."),
        Message.assistant([{ type: "reasoning", text: "thinking" }]),
        Message.user("After."),
      ])

      expect(body).toEqual({
        model: "gpt-4o-mini",
        messages: [
          { role: "user", content: "Before." },
          { role: "assistant", content: "", reasoning_content: "thinking" },
          { role: "user", content: "After." },
        ],
        stream: true,
        stream_options: { include_usage: true },
        store: false,
      })
    }),
  )

  it.effect("sends an empty tools array for a tool history with no tools", () =>
    Effect.gen(function* () {
      const body = yield* lowerOpenAI([toolCall(), toolResult()])

      expect(body).toEqual({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "assistant",
            content: null,
            tool_calls: [
              { id: "call_1", type: "function", function: { name: "lookup", arguments: '{"query":"weather"}' } },
            ],
          },
          { role: "tool", tool_call_id: "call_1", content: '{"forecast":"sunny"}' },
        ],
        tools: [],
        stream: true,
        stream_options: { include_usage: true },
        store: false,
      })
    }),
  )

  it.effect("passes an uppercase media type through to the image URL", () =>
    Effect.gen(function* () {
      const body = yield* lowerOpenAI([Message.user({ type: "media", media: Media.base64("AAECAw==", "IMAGE/PNG") })])

      expect(body).toEqual({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: [{ type: "image_url", image_url: { url: "data:image/png;base64,AAECAw==" } }],
          },
        ],
        stream: true,
        stream_options: { include_usage: true },
        store: false,
      })
    }),
  )
})

describe("Anthropic Messages message ordering", () => {
  it.effect("rejects a system update between a tool call and its result", () =>
    Effect.gen(function* () {
      const error = yield* lowerAnthropic([
        Message.user("What is the weather?"),
        toolCall(),
        Message.system("Stay brief."),
        toolResult(),
      ]).pipe(Effect.flip)

      expect(error.reason._tag).toBe("InvalidRequest")
    }),
  )

  it.effect("drops an assistant message with no parts", () =>
    Effect.gen(function* () {
      const body = yield* lowerAnthropic([Message.user("Before."), Message.assistant([]), Message.user("After.")])

      expect(body).toEqual({
        model: "claude-sonnet-4-5",
        messages: [
          { role: "user", content: [{ type: "text", text: "Before." }] },
          { role: "user", content: [{ type: "text", text: "After." }] },
        ],
        stream: true,
        max_tokens: 32_000,
      })
    }),
  )

  it.effect("drops an assistant message whose only part is whitespace text", () =>
    Effect.gen(function* () {
      const body = yield* lowerAnthropic([
        Message.user("Before."),
        Message.assistant([{ type: "text", text: "   " }]),
        Message.user("After."),
      ])

      expect(body).toEqual({
        model: "claude-sonnet-4-5",
        messages: [
          { role: "user", content: [{ type: "text", text: "Before." }] },
          { role: "user", content: [{ type: "text", text: "After." }] },
        ],
        stream: true,
        max_tokens: 32_000,
      })
    }),
  )

  it.effect("drops an unsigned reasoning-only assistant message", () =>
    Effect.gen(function* () {
      const body = yield* lowerAnthropic([
        Message.user("Before."),
        Message.assistant([{ type: "reasoning", text: "thinking" }]),
        Message.user("After."),
      ])

      expect(body).toEqual({
        model: "claude-sonnet-4-5",
        messages: [
          { role: "user", content: [{ type: "text", text: "Before." }] },
          { role: "user", content: [{ type: "text", text: "After." }] },
        ],
        stream: true,
        max_tokens: 32_000,
      })
    }),
  )

  it.effect("omits tools for a tool history with no tools", () =>
    Effect.gen(function* () {
      const body = yield* lowerAnthropic([toolCall(), toolResult()])

      expect(body).toEqual({
        model: "claude-sonnet-4-5",
        messages: [
          {
            role: "assistant",
            content: [{ type: "tool_use", id: "call_1", name: "lookup", input: { query: "weather" } }],
          },
          {
            role: "user",
            content: [{ type: "tool_result", tool_use_id: "call_1", content: '{"forecast":"sunny"}' }],
          },
        ],
        stream: true,
        max_tokens: 32_000,
      })
      // The body carries `tools: undefined`; JSON encoding drops it, so the wire body has no `tools` key.
      expect(JSON.parse(JSON.stringify(body))).not.toHaveProperty("tools")
    }),
  )

  it.effect("lowers an uppercase media type into an image block", () =>
    Effect.gen(function* () {
      const body = yield* lowerAnthropic([
        Message.user({ type: "media", media: Media.base64("AAECAw==", "IMAGE/PNG") }),
      ])

      expect(body).toEqual({
        model: "claude-sonnet-4-5",
        messages: [
          {
            role: "user",
            content: [{ type: "image", source: { type: "base64", media_type: "image/png", data: "AAECAw==" } }],
          },
        ],
        stream: true,
        max_tokens: 32_000,
      })
    }),
  )
})
