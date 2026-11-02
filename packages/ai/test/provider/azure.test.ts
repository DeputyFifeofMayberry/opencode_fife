import { describe, expect } from "bun:test"
import { Effect, Schema } from "effect"
import { HttpClientRequest } from "effect/http"
import { ai } from "../../src/effect.js"
import { Azure } from "../../src/providers.js"
import { LLMClient } from "../../src/route/client.js"
import { it } from "../lib/effect.js"
import { dynamicResponse } from "../lib/http.js"

type AzureModel =
  | ReturnType<typeof Azure.messagesModel>
  | ReturnType<typeof Azure.responsesModel>

const send = (model: AzureModel) =>
  Effect.gen(function* () {
    const seen: Array<Request> = []
    yield* LLMClient.generate(ai.request({ model, prompt: "Hi" })).pipe(
      Effect.provide(
        dynamicResponse((input) =>
          Effect.gen(function* () {
            seen.push(yield* HttpClientRequest.toWeb(input.request))
            return input.respond("", { headers: { "content-type": "text/event-stream" } })
          }),
        ),
      ),
      Effect.flip,
    )
    return seen[0]!
  })

const readBody = (request: Request) =>
  Effect.gen(function* () {
    const text = yield* Effect.promise(() => request.text())
    return Schema.decodeUnknownSync(Schema.UnknownFromJsonString)(text)
  })

describe("Azure Messages", () => {
  it.effect("sends Anthropic Messages to the Foundry resource with x-api-key", () =>
    Effect.gen(function* () {
      const request = yield* send(Azure.messagesModel("claude-haiku-4-5", { resourceName: "fixture", apiKey: "key" }))

      expect(request.url).toBe("https://fixture.services.ai.azure.com/anthropic/v1/messages")
      expect(request.headers.get("x-api-key")).toBe("key")
      expect(request.headers.get("api-key")).toBeNull()
      expect(request.headers.get("anthropic-version")).toBe("2023-06-01")
    }),
  )

  it.effect("uses a configured baseURL as is", () =>
    Effect.gen(function* () {
      const request = yield* send(
        Azure.configure({ baseURL: "https://gateway.example/anthropic/v1/", apiKey: "key" }).messages("claude"),
      )

      expect(request.url).toBe("https://gateway.example/anthropic/v1/messages")
    }),
  )

  it.effect("derives the Foundry host from an Azure OpenAI baseURL", () =>
    Effect.gen(function* () {
      const request = yield* send(
        Azure.configure({
          baseURL: "https://fixture.openai.azure.com/openai",
          resourceName: "fixture",
          apiKey: "key",
        }).messages("claude"),
      )

      expect(request.url).toBe("https://fixture.services.ai.azure.com/anthropic/v1/messages")
    }),
  )

  it.effect("derives the Anthropic path from a bare Foundry root", () =>
    Effect.gen(function* () {
      const request = yield* send(
        Azure.configure({ baseURL: "https://fixture.services.ai.azure.com/", apiKey: "key" }).messages("claude"),
      )

      expect(request.url).toBe("https://fixture.services.ai.azure.com/anthropic/v1/messages")
    }),
  )

  it.effect("keeps an already-correct Foundry baseURL", () =>
    Effect.gen(function* () {
      const request = yield* send(
        Azure.configure({ baseURL: "https://fixture.services.ai.azure.com/anthropic/v1/", apiKey: "key" }).messages(
          "claude",
        ),
      )

      expect(request.url).toBe("https://fixture.services.ai.azure.com/anthropic/v1/messages")
    }),
  )

  it.effect("rejects a baseURL that is neither Anthropic nor Azure", () =>
    Effect.sync(() => {
      expect(() =>
        Azure.configure({ baseURL: "https://gateway.example/openai/v1", apiKey: "key" }).messages("claude"),
      ).toThrow(/https:\/\/gateway\.example\/openai\/v1.*\/anthropic/)
    }),
  )

  it.effect("drops OpenAI options from an Anthropic Messages body", () =>
    Effect.gen(function* () {
      const request = yield* send(
        Azure.configure({
          resourceName: "fixture",
          apiKey: "key",
          providerOptions: { store: false, reasoningEffort: "high", metadata: { user_id: "user_1" } },
        }).messages("claude"),
      )
      const body = yield* readBody(request)

      expect(body).toMatchObject({ metadata: { user_id: "user_1" } })
      expect(body).not.toHaveProperty("store")
      expect(body).not.toHaveProperty("reasoningEffort")
      expect(body).not.toHaveProperty("reasoning_effort")
    }),
  )

  it.effect("drops Anthropic options from an OpenAI Responses body", () =>
    Effect.gen(function* () {
      const request = yield* send(
        Azure.configure({
          resourceName: "fixture",
          apiKey: "key",
          providerOptions: {
            store: true,
            thinking: { type: "enabled", budgetTokens: 1_024 },
            cache_control: { type: "ephemeral" },
          },
        }).responses("gpt-5"),
      )
      const body = yield* readBody(request)

      expect(body).toMatchObject({ store: true })
      expect(body).not.toHaveProperty("thinking")
      expect(body).not.toHaveProperty("cache_control")
    }),
  )
})
