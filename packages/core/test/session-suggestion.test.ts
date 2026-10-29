import { beforeEach, expect } from "bun:test"
import { AIError, LLMClient, LLMEvent, LanguageModel, type LLMRequest } from "@opencode/ai/effect"
import { OpenAIChat } from "@opencode/ai/protocols"
import { Agent } from "@opencode/core/agent"
import { Provider } from "@opencode/schema/provider"
import { Money } from "@opencode/schema/money"
import { Model } from "@opencode/schema/model"
import { Session } from "@opencode/schema/session"
import { Database } from "@opencode/core/database/database"
import { AppNodeBuilder } from "@opencode/core/effect/app-node-builder"
import { llmClient } from "@opencode/core/effect/app-node-platform"
import { LayerNode } from "@opencode/util/effect/layer-node"
import { Bus } from "@opencode/core/bus"
import { SessionMessage } from "@opencode/core/session/message"
import { SessionProjector } from "@opencode/core/session/projector"
import { SessionMessageTable, SessionTable } from "@opencode/core/session/sql"
import { SessionStore } from "@opencode/core/session/store"
import { SessionSuggestion } from "@opencode/core/session/suggestion"
import { SessionRunnerModel } from "@opencode/core/session/runner/model"
import { PluginHooks } from "@opencode/core/plugin/hooks"
import { PluginSupervisor } from "@opencode/core/plugin/supervisor"
import { Location } from "@opencode/core/location"
import { Project } from "@opencode/core/project"
import { ProjectTable } from "@opencode/core/project/sql"
import { AbsolutePath } from "@opencode/core/schema"
import { DateTime, Effect, Layer, Schema, Stream } from "effect"
import { testEffect } from "./lib/effect"

let requests: LLMRequest[] = []
const model = LanguageModel.make({
  id: "suggest-model",
  provider: "test",
  route: OpenAIChat.route,
})
const cost = [
  {
    input: Money.USDPerMillionTokens.make(1),
    output: Money.USDPerMillionTokens.make(2),
    cache: {
      read: Money.USDPerMillionTokens.make(0.1),
      write: Money.USDPerMillionTokens.make(0.5),
    },
  },
]
const successfulSuggestion = () =>
  Stream.make(
    LLMEvent.textDelta({ id: "suggestion", text: '  "run the tests"  \n' }),
    LLMEvent.stepFinish({
      index: 0,
      reason: { normalized: "stop" },
      usage: {
        inputTokens: 15,
        outputTokens: 6,
        nonCachedInputTokens: 2,
        cacheReadInputTokens: 13,
        cacheWriteInputTokens: 0,
        reasoningTokens: 0,
      },
    }),
    LLMEvent.finish({ reason: { normalized: "stop" } }),
  )
let suggestionStream: () => Stream.Stream<LLMEvent, AIError> = successfulSuggestion
const client = Layer.mock(LLMClient.Service)({
  stream: (request: LLMRequest) => {
    requests.push(request)
    return suggestionStream()
  },
  generate: () => Effect.die("unused"),
})
const models = Layer.mock(SessionRunnerModel.Service)({
  resolve: () =>
    Effect.succeed(
      SessionRunnerModel.resolved(model, {
        capabilities: { tools: true, input: ["text"], output: ["text"] },
        cost,
        limit: { context: 200_000, output: 32_000 },
      }),
    ),
})
const it = testEffect(
  AppNodeBuilder.build(
    LayerNode.group([
      Database.node,
      Bus.node,
      SessionProjector.node,
      SessionStore.node,
      Agent.node,
      PluginHooks.node,
      SessionSuggestion.node,
    ]),
    [
      llmClient.replace(client),
      SessionRunnerModel.node.replace(models),
      Location.node.replace(Location.boundNode({ directory: AbsolutePath.make("/project") })),
      PluginSupervisor.node.replace(Layer.empty),
    ],
  ),
)

const encodeMessage = Schema.encodeSync(SessionMessage.Info)

const insertSession = (id: Session.ID) =>
  Effect.gen(function* () {
    const { db } = yield* Database.Service
    yield* db
      .insert(ProjectTable)
      .values({ id: Project.ID.global, worktree: AbsolutePath.make("/project"), sandboxes: [] })
      .onConflictDoNothing()
      .run()
      .pipe(Effect.orDie)
    yield* db
      .insert(SessionTable)
      .values({
        id,
        project_id: Project.ID.global,
        slug: id,
        directory: "/project",
        version: "test",
      })
      .onConflictDoNothing()
      .run()
      .pipe(Effect.orDie)
  })

const messageRow = (sessionID: Session.ID, message: SessionMessage.Info, seq: number) => {
  const { id: _, type, ...data } = encodeMessage(message)
  return { id: message.id, session_id: sessionID, type, seq, time_created: 0, data }
}

const converse = (sessionID: Session.ID, userText: string) =>
  Effect.gen(function* () {
    const { db } = yield* Database.Service
    yield* db
      .insert(SessionMessageTable)
      .values([
        messageRow(
          sessionID,
          SessionMessage.User.make({
            id: SessionMessage.ID.create(),
            type: "user",
            text: userText,
            time: { created: DateTime.makeUnsafe(1) },
          }),
          1,
        ),
        messageRow(
          sessionID,
          SessionMessage.Assistant.make({
            id: SessionMessage.ID.create(),
            type: "assistant",
            agent: Agent.ID.make("build"),
            model: { id: Model.ID.make("model"), providerID: Provider.ID.make("provider") },
            content: [{ type: "text", text: "Done. The change is in place." }],
            time: { created: DateTime.makeUnsafe(2), completed: DateTime.makeUnsafe(3) },
          }),
          2,
        ),
      ])
      .run()
      .pipe(Effect.orDie)
  })

const enableBuildAgent = Effect.gen(function* () {
  const agents = yield* Agent.Service
  yield* agents.transform((editor) => {
    editor.update(Agent.ID.make("build"), (agent) => {
      agent.mode = "primary"
      agent.hidden = false
    })
  })
})

beforeEach(() => {
  requests = []
  suggestionStream = successfulSuggestion
})

const sessionID = Session.ID.make("ses_suggestion")

it.effect("suggests a sanitized next prompt with a capped, cache-keyed request", () =>
  Effect.gen(function* () {
    yield* enableBuildAgent
    yield* insertSession(sessionID)
    yield* converse(sessionID, "Fix the failing watcher test")

    const suggestion = yield* SessionSuggestion.Service
    const text = yield* suggestion.generate(sessionID)

    expect(text).toBe("run the tests")
    expect(requests).toHaveLength(1)
    expect(requests[0]?.promptCacheKey).toBe(sessionID)
    expect(requests[0]?.generation).toEqual(expect.objectContaining({ maxTokens: 160 }))
    const messages = requests[0]?.messages ?? []
    expect(JSON.stringify(messages.at(-1))).toContain("SUGGESTION MODE")
    expect(JSON.stringify(messages)).toContain("Fix the failing watcher test")
    const store = yield* SessionStore.Service
    const updated = yield* store.get(sessionID)
    expect(updated?.tokens).toEqual({ input: 2, output: 6, reasoning: 0, cache: { read: 13, write: 0 } })
  }),
)

it.effect("skips the request while the last message is still the user's", () =>
  Effect.gen(function* () {
    yield* enableBuildAgent
    yield* insertSession(sessionID)
    const { db } = yield* Database.Service
    yield* db
      .insert(SessionMessageTable)
      .values([
        messageRow(
          sessionID,
          SessionMessage.User.make({
            id: SessionMessage.ID.create(),
            type: "user",
            text: "Fix the failing watcher test",
            time: { created: DateTime.makeUnsafe(1) },
          }),
          1,
        ),
      ])
      .run()
      .pipe(Effect.orDie)

    const suggestion = yield* SessionSuggestion.Service
    expect(yield* suggestion.generate(sessionID)).toBeUndefined()
    expect(requests).toHaveLength(0)
    const store = yield* SessionStore.Service
    const updated = yield* store.get(sessionID)
    expect(updated?.tokens).toEqual({ input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } })
  }),
)

it.effect("skips unusable model output without retrying", () =>
  Effect.gen(function* () {
    yield* enableBuildAgent
    yield* insertSession(sessionID)
    yield* converse(sessionID, "Fix the failing watcher test")
    suggestionStream = () => Stream.make(LLMEvent.textDelta({ id: "s", text: "Thanks!" }))

    const suggestion = yield* SessionSuggestion.Service
    expect(yield* suggestion.generate(sessionID)).toBeUndefined()
    expect(requests).toHaveLength(1)
  }),
)

it.effect("records usage and yields nothing when the provider fails", () =>
  Effect.gen(function* () {
    yield* enableBuildAgent
    yield* insertSession(sessionID)
    yield* converse(sessionID, "Fix the failing watcher test")
    suggestionStream = () =>
      Stream.make(
        LLMEvent.stepFinish({
          index: 0,
          reason: { normalized: "stop" },
          usage: {
            inputTokens: 10,
            outputTokens: 1,
            nonCachedInputTokens: 0,
            cacheReadInputTokens: 10,
            cacheWriteInputTokens: 0,
            reasoningTokens: 0,
          },
        }),
        LLMEvent.providerError({ message: "Provider unavailable" }),
      )

    const suggestion = yield* SessionSuggestion.Service
    expect(yield* suggestion.generate(sessionID)).toBeUndefined()
    // The burned tokens are still metered against the session.
    const store = yield* SessionStore.Service
    const updated = yield* store.get(sessionID)
    expect(updated?.tokens).toEqual({ input: 0, output: 1, reasoning: 0, cache: { read: 10, write: 0 } })
  }),
)

it.effect("does not repeat the user's own last prompt", () =>
  Effect.gen(function* () {
    yield* enableBuildAgent
    yield* insertSession(sessionID)
    yield* converse(sessionID, "run the tests")
    suggestionStream = () =>
      Stream.make(LLMEvent.textDelta({ id: "s", text: "Run the tests" }), LLMEvent.finish({ reason: { normalized: "stop" } }))

    const suggestion = yield* SessionSuggestion.Service
    expect(yield* suggestion.generate(sessionID)).toBeUndefined()
  }),
)
