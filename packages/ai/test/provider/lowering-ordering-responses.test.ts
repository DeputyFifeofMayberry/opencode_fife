import { describe, expect } from "bun:test"
import { Effect } from "effect"
import { ai, Media, Message } from "../../src/effect.js"
import { Cohere } from "../../src/providers/cohere.js"
import { OpenAI } from "../../src/providers.js"
import { Auth } from "../../src/route.js"
import * as CohereChat from "../../src/protocols/cohere-chat.js"
import * as OpenAIResponses from "../../src/protocols/openai-responses.js"
import { OpenResponses } from "../../src/protocols/open-responses.js"
import { it } from "../lib/effect.js"

type Model = Parameters<typeof ai.request>[0]["model"]

const openResponsesModel = OpenAI.configure({ apiKey: "test" }).responses("example-model")
const openaiResponsesModel = OpenAIResponses.route
  .with({ endpoint: { baseURL: "https://api.openai.test/v1/" }, auth: Auth.bearer("test") })
  .model({ id: "gpt-4.1-mini" })
const cohereModel = Cohere.configure({ apiKey: "fixture" }).model("command-a-03-2025")

/**
 * The six ordering/edge-case histories under test. Each protocol lowers the same history so the
 * differences in the table below come from the adapter, not from the request.
 */
const request = (model: Model, id: 1 | 2 | 3 | 4 | 5 | 6) => {
  const toolHistory = [
    Message.user("Lookup Paris"),
    Message.assistant([{ type: "tool-call", id: "call_1", name: "lookup", input: { city: "Paris" } }]),
  ]
  const toolResult = Message.tool({ id: "call_1", name: "lookup", result: { sunny: true } })
  switch (id) {
    case 1:
      return ai.request({
        model,
        messages: [...toolHistory, Message.system("Operator update."), toolResult],
      })
    case 2:
      return ai.request({ model, messages: [Message.user("Hello"), Message.make({ role: "assistant", content: [] })] })
    case 3:
      return ai.request({
        model,
        messages: [Message.user("Hello"), Message.make({ role: "assistant", content: [{ type: "text", text: "   " }] })],
      })
    case 4:
      return ai.request({
        model,
        messages: [
          Message.user("Hello"),
          Message.make({ role: "assistant", content: [{ type: "reasoning", text: "Think" }] }),
        ],
      })
    case 5:
      return ai.request({ model, messages: [...toolHistory, toolResult], tools: [] })
    case 6:
      return ai.request({
        model,
        messages: [Message.user([{ type: "media", media: Media.base64("Zm9v", "IMAGE/PNG") }])],
      })
  }
}

describe("open-responses lowering of ordering edge cases", () => {
  it.effect("keeps a system update between the tool call and its result, as a developer message", () =>
    Effect.gen(function* () {
      const body = yield* OpenResponses.protocol.body.from(request(openResponsesModel, 1))

      expect(body).toEqual({
        model: "example-model",
        input: [
          { type: "message", role: "user", content: [{ type: "input_text", text: "Lookup Paris" }] },
          { type: "function_call", call_id: "call_1", name: "lookup", arguments: '{"city":"Paris"}' },
          { type: "message", role: "developer", content: "Operator update." },
          { type: "function_call_output", call_id: "call_1", output: '{"sunny":true}' },
        ],
        stream: true,
      })
    }),
  )

  it.effect("drops an assistant message with empty content", () =>
    Effect.gen(function* () {
      const body = yield* OpenResponses.protocol.body.from(request(openResponsesModel, 2))

      expect(body).toEqual({
        model: "example-model",
        input: [{ type: "message", role: "user", content: [{ type: "input_text", text: "Hello" }] }],
        stream: true,
      })
    }),
  )

  it.effect("keeps whitespace-only assistant text", () =>
    Effect.gen(function* () {
      const body = yield* OpenResponses.protocol.body.from(request(openResponsesModel, 3))

      expect(body).toEqual({
        model: "example-model",
        input: [
          { type: "message", role: "user", content: [{ type: "input_text", text: "Hello" }] },
          { type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: "   " }] },
        ],
        stream: true,
      })
    }),
  )

  it.effect("drops an assistant message whose only part is unsigned reasoning", () =>
    Effect.gen(function* () {
      const body = yield* OpenResponses.protocol.body.from(request(openResponsesModel, 4))

      expect(body).toEqual({
        model: "example-model",
        input: [{ type: "message", role: "user", content: [{ type: "input_text", text: "Hello" }] }],
        stream: true,
      })
    }),
  )

  it.effect("omits the tools key instead of sending an empty array", () =>
    Effect.gen(function* () {
      const body = yield* OpenResponses.protocol.body.from(request(openResponsesModel, 5))

      expect(body).toEqual({
        model: "example-model",
        input: [
          { type: "message", role: "user", content: [{ type: "input_text", text: "Lookup Paris" }] },
          { type: "function_call", call_id: "call_1", name: "lookup", arguments: '{"city":"Paris"}' },
          { type: "function_call_output", call_id: "call_1", output: '{"sunny":true}' },
        ],
        stream: true,
      })
    }),
  )

  it.effect("lowercases an uppercase image media type in the data URL", () =>
    Effect.gen(function* () {
      const body = yield* OpenResponses.protocol.body.from(request(openResponsesModel, 6))

      expect(body).toEqual({
        model: "example-model",
        input: [
          {
            type: "message",
            role: "user",
            content: [{ type: "input_image", image_url: "data:image/png;base64,Zm9v" }],
          },
        ],
        stream: true,
      })
    }),
  )
})

describe("openai-responses adapter lowering of ordering edge cases", () => {
  it.effect("keeps a system update between the tool call and its result, as a developer message", () =>
    Effect.gen(function* () {
      const body = yield* OpenAIResponses.protocol.body.from(request(openaiResponsesModel, 1))

      expect(body).toEqual({
        model: "gpt-4.1-mini",
        input: [
          { type: "message", role: "user", content: [{ type: "input_text", text: "Lookup Paris" }] },
          { type: "function_call", call_id: "call_1", name: "lookup", arguments: '{"city":"Paris"}' },
          { type: "message", role: "developer", content: "Operator update." },
          { type: "function_call_output", call_id: "call_1", output: '{"sunny":true}' },
        ],
        stream: true,
      })
    }),
  )

  it.effect("drops an assistant message with empty content", () =>
    Effect.gen(function* () {
      const body = yield* OpenAIResponses.protocol.body.from(request(openaiResponsesModel, 2))

      expect(body).toEqual({
        model: "gpt-4.1-mini",
        input: [{ type: "message", role: "user", content: [{ type: "input_text", text: "Hello" }] }],
        stream: true,
      })
    }),
  )

  it.effect("keeps whitespace-only assistant text", () =>
    Effect.gen(function* () {
      const body = yield* OpenAIResponses.protocol.body.from(request(openaiResponsesModel, 3))

      expect(body).toEqual({
        model: "gpt-4.1-mini",
        input: [
          { type: "message", role: "user", content: [{ type: "input_text", text: "Hello" }] },
          { type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: "   " }] },
        ],
        stream: true,
      })
    }),
  )

  it.effect("drops an assistant message whose only part is unsigned reasoning", () =>
    Effect.gen(function* () {
      const body = yield* OpenAIResponses.protocol.body.from(request(openaiResponsesModel, 4))

      expect(body).toEqual({
        model: "gpt-4.1-mini",
        input: [{ type: "message", role: "user", content: [{ type: "input_text", text: "Hello" }] }],
        stream: true,
      })
    }),
  )

  it.effect("omits the tools key instead of sending an empty array", () =>
    Effect.gen(function* () {
      const body = yield* OpenAIResponses.protocol.body.from(request(openaiResponsesModel, 5))

      expect(body).toEqual({
        model: "gpt-4.1-mini",
        input: [
          { type: "message", role: "user", content: [{ type: "input_text", text: "Lookup Paris" }] },
          { type: "function_call", call_id: "call_1", name: "lookup", arguments: '{"city":"Paris"}' },
          { type: "function_call_output", call_id: "call_1", output: '{"sunny":true}' },
        ],
        stream: true,
      })
    }),
  )

  it.effect("lowercases an uppercase image media type in the data URL", () =>
    Effect.gen(function* () {
      const body = yield* OpenAIResponses.protocol.body.from(request(openaiResponsesModel, 6))

      expect(body).toEqual({
        model: "gpt-4.1-mini",
        input: [
          {
            type: "message",
            role: "user",
            content: [{ type: "input_image", image_url: "data:image/png;base64,Zm9v" }],
          },
        ],
        stream: true,
      })
    }),
  )
})

describe("cohere-chat lowering of ordering edge cases", () => {
  it.effect("renders a system update between the tool call and its result as a user system-update message", () =>
    Effect.gen(function* () {
      const body = yield* CohereChat.protocol.body.from(request(cohereModel, 1))

      expect(body).toEqual({
        model: "command-a-03-2025",
        messages: [
          { role: "user", content: [{ type: "text", text: "Lookup Paris" }] },
          {
            role: "assistant",
            tool_calls: [
              { id: "call_1", type: "function", function: { name: "lookup", arguments: '{"city":"Paris"}' } },
            ],
          },
          { role: "user", content: "<system-update>\nOperator update.\n</system-update>" },
          { role: "tool", tool_call_id: "call_1", content: '{"sunny":true}' },
        ],
        stream: true,
      })
    }),
  )

  it.effect("keeps an empty assistant message with no content key", () =>
    Effect.gen(function* () {
      const body = yield* CohereChat.protocol.body.from(request(cohereModel, 2))

      expect(body).toEqual({
        model: "command-a-03-2025",
        messages: [
          { role: "user", content: [{ type: "text", text: "Hello" }] },
          { role: "assistant" },
        ],
        stream: true,
      })
    }),
  )

  it.effect("keeps whitespace-only assistant text", () =>
    Effect.gen(function* () {
      const body = yield* CohereChat.protocol.body.from(request(cohereModel, 3))

      expect(body).toEqual({
        model: "command-a-03-2025",
        messages: [
          { role: "user", content: [{ type: "text", text: "Hello" }] },
          { role: "assistant", content: [{ type: "text", text: "   " }] },
        ],
        stream: true,
      })
    }),
  )

  it.effect("keeps unsigned reasoning as a thinking content part", () =>
    Effect.gen(function* () {
      const body = yield* CohereChat.protocol.body.from(request(cohereModel, 4))

      expect(body).toEqual({
        model: "command-a-03-2025",
        messages: [
          { role: "user", content: [{ type: "text", text: "Hello" }] },
          { role: "assistant", content: [{ type: "thinking", thinking: "Think" }] },
        ],
        stream: true,
      })
    }),
  )

  it.effect("omits the tools key instead of sending an empty array", () =>
    Effect.gen(function* () {
      const body = yield* CohereChat.protocol.body.from(request(cohereModel, 5))

      expect(body).toEqual({
        model: "command-a-03-2025",
        messages: [
          { role: "user", content: [{ type: "text", text: "Lookup Paris" }] },
          {
            role: "assistant",
            tool_calls: [
              { id: "call_1", type: "function", function: { name: "lookup", arguments: '{"city":"Paris"}' } },
            ],
          },
          { role: "tool", tool_call_id: "call_1", content: '{"sunny":true}' },
        ],
        stream: true,
      })
    }),
  )

  it.effect("rejects an uppercase image media type instead of lowercasing it", () =>
    Effect.gen(function* () {
      const error = yield* CohereChat.protocol.body.from(request(cohereModel, 6)).pipe(Effect.flip)

      expect(error.reason._tag).toBe("InvalidRequest")
    }),
  )
})
