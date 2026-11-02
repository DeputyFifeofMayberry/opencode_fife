import { afterAll, describe, expect } from "bun:test"
import { Effect, Result } from "effect"
import { ai, Media, Message } from "../../src/effect.js"
import { Content } from "../../src/protocols/lowering/index.js"
import { AnthropicMessages } from "../../src/protocols/anthropic-messages.js"
import { BedrockConverse } from "../../src/protocols/bedrock-converse.js"
import { CohereChat } from "../../src/protocols/cohere-chat.js"
import { Gemini } from "../../src/protocols/gemini.js"
import { GoogleInteractions } from "../../src/protocols/google-interactions.js"
import { MistralChat } from "../../src/protocols/mistral-chat.js"
import { OpenAIChat } from "../../src/protocols/openai-chat.js"
import { OpenAIResponses } from "../../src/protocols/openai-responses.js"
import { OpenResponses } from "../../src/protocols/open-responses.js"
import { AmazonBedrock, Google, Mistral, OpenAI } from "../../src/providers.js"
import { Cohere } from "../../src/providers/cohere.js"
import { Auth } from "../../src/route.js"
import type { ContentPart, MessageRole } from "../../src/schema/index.js"
import { it } from "../lib/effect.js"

const openaiChatModel = OpenAIChat.route
  .with({ endpoint: { baseURL: "https://api.openai.test/v1/" }, auth: Auth.bearer("test") })
  .model({ id: "gpt-4o-mini" })

const anthropicModel = AnthropicMessages.route
  .with({ endpoint: { baseURL: "https://api.anthropic.test/v1/" }, auth: Auth.header("x-api-key", "test") })
  .model({ id: "claude-sonnet-4-5" })

const openResponsesModel = OpenAI.configure({ apiKey: "test" }).responses("example-model")

const openaiResponsesModel = OpenAIResponses.route
  .with({ endpoint: { baseURL: "https://api.openai.test/v1/" }, auth: Auth.bearer("test") })
  .model({ id: "gpt-4.1-mini" })

const bedrockModel = AmazonBedrock.configure({
  baseURL: "https://bedrock-runtime.test",
  apiKey: "test-bearer",
}).model("anthropic.claude-sonnet-4-5-20250929-v1:0")

const mistralModel = Mistral.configure({ apiKey: "fixture" }).model("mistral-large-latest")

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

const cohereModel = Cohere.configure({ apiKey: "fixture" }).model("command-a-03-2025")

/**
 * One entry per protocol in the lowering kit. Each lowers a hand-built request so the only
 * difference between entries is the adapter, not the request.
 */
const protocols = [
  {
    name: "openai-chat",
    lower: (messages: ReadonlyArray<Message>) =>
      OpenAIChat.protocol.body.from(ai.request({ model: openaiChatModel, messages, cache: "none" })),
  },
  {
    name: "anthropic-messages",
    lower: (messages: ReadonlyArray<Message>) =>
      AnthropicMessages.protocol.body.from(ai.request({ model: anthropicModel, messages, cache: "none" })),
  },
  {
    name: "open-responses",
    lower: (messages: ReadonlyArray<Message>) =>
      OpenResponses.protocol.body.from(ai.request({ model: openResponsesModel, messages, cache: "none" })),
  },
  {
    name: "openai-responses",
    lower: (messages: ReadonlyArray<Message>) =>
      OpenAIResponses.protocol.body.from(ai.request({ model: openaiResponsesModel, messages, cache: "none" })),
  },
  {
    name: "bedrock-converse",
    lower: (messages: ReadonlyArray<Message>) =>
      BedrockConverse.protocol.body.from(ai.request({ model: bedrockModel, messages, cache: "none" })),
  },
  {
    name: "mistral-chat",
    lower: (messages: ReadonlyArray<Message>) =>
      MistralChat.protocol.body.from(ai.request({ model: mistralModel, messages, cache: "none" })),
  },
  {
    name: "gemini",
    lower: (messages: ReadonlyArray<Message>) =>
      Gemini.protocol.body.from(ai.request({ model: geminiModel, messages, cache: "none" })),
  },
  {
    name: "google-interactions",
    lower: (messages: ReadonlyArray<Message>) =>
      GoogleInteractions.protocol.body.from(ai.request({ model: interactionsModel, messages, cache: "none" })),
  },
  {
    name: "cohere-chat",
    lower: (messages: ReadonlyArray<Message>) =>
      CohereChat.protocol.body.from(ai.request({ model: cohereModel, messages, cache: "none" })),
  },
] as const

const parts = {
  text: { type: "text", text: "hi" },
  media: { type: "media", media: Media.base64("Zm9v", "image/png") },
  "tool-call": { type: "tool-call", id: "call_1", name: "read", input: {} },
  "tool-result": { type: "tool-result", id: "call_1", name: "read", result: { type: "text", value: "ok" } },
  reasoning: { type: "reasoning", text: "thinking" },
  compaction: { type: "compaction", provider: "anthropic", text: "summary" },
  effort: { type: "effort", effort: "high" },
} satisfies Record<Content.PartKind, ContentPart>

const roles = ["system", "user", "assistant", "tool"] as const satisfies ReadonlyArray<MessageRole>

/**
 * A message carrying exactly one part. Assistant and tool turns get a preceding user text
 * message because most protocols need history before a non-initial turn.
 */
const history = (role: MessageRole, part: ContentPart): ReadonlyArray<Message> => {
  const message = Message.make({ role, content: [part] })
  return role === "assistant" || role === "tool" ? [Message.user("hi"), message] : [message]
}

const lowered: string[] = []

afterAll(() => {
  console.log(`lowered to a body (${lowered.length}):\n${lowered.join("\n")}`)
})

for (const protocol of protocols) {
  describe(protocol.name, () => {
    for (const kind of Content.PartKinds) {
      for (const role of roles) {
        const label = `${role} / ${kind}`
        it.effect(label, () =>
          Effect.gen(function* () {
            const result = yield* Effect.result(protocol.lower(history(role, parts[kind])))
            if (Result.isSuccess(result)) {
              lowered.push(`${protocol.name} ${label}`)
              return
            }
            expect(
              result.failure.reason._tag !== "InvalidRequest"
                ? `${protocol.name} ${label}: ${JSON.stringify(result.failure.reason)}`
                : undefined,
            ).toBeUndefined()
          }),
        )
      }
    }
  })
}
