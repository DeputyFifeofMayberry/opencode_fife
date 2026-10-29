export * as SessionSuggestion from "./suggestion.js"

import { LLMClient, LLMEvent, Message, type AIError } from "@opencode/ai/effect"
import { Context, Effect, Layer, Stream } from "effect"
import { makeLocationNode } from "@opencode/util/effect/app-node"
import { llmClient } from "../effect/app-node-platform.js"
import { Bus } from "../bus.js"
import { Database } from "../database/database.js"
import type { FileSystem } from "../filesystem.js"
import { SessionContext } from "./context.js"
import type { AgentNotFoundError } from "./error.js"
import { SessionEvent } from "./event.js"
import { SessionHistory } from "./history.js"
import type { Instructions } from "../instructions/index.js"
import { SessionModelRequest } from "./model-request.js"
import type { SessionRunnerModel } from "./runner/model.js"
import type { SessionSchema } from "./schema.js"
import { SessionStore } from "./store.js"
import { SessionUsage } from "./usage.js"
import { INSTRUCTION, sanitize } from "./suggestion-text.js"

export type Error =
  | AgentNotFoundError
  | Instructions.InitializationBlocked
  | SessionRunnerModel.Error
  | AIError
  | FileSystem.DirectoryNotFoundError

export interface Interface {
  /** Suggests the user's next prompt from settled history, or `undefined` when nothing qualifies. */
  readonly generate: (sessionID: SessionSchema.ID) => Effect.Effect<string | undefined, Error>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/SessionSuggestion") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const bus = yield* Bus.Service
    const llm = yield* LLMClient.Service
    const context = yield* SessionContext.Service
    const db = (yield* Database.Service).db

    const generate = Effect.fn("SessionSuggestion.generate")(function* (sessionID: SessionSchema.ID) {
      const selection = yield* context.select(sessionID)
      const model = yield* context.resolveModel(selection.session)
      const history = yield* SessionHistory.preview(db, selection.session.id, selection.instructions, model.ref)
      // Suggest the follow-up to a finished exchange only. A trailing user message
      // means the user already typed (or queued) their next prompt.
      const last = history.messages.at(-1)
      if (last?.type !== "assistant" || last.time.completed === undefined) return
      const priorUser = history.messages.findLast((message) => message.type === "user")

      const chunks: string[] = []
      let failed = false
      let usage: SessionUsage.Recorded | undefined
      const recordUsage = Effect.suspend(() =>
        usage
          ? bus.publish(SessionEvent.UsageRecorded, {
              sessionID: selection.session.id,
              source: "suggestion",
              ...usage,
            })
          : Effect.void,
      )
      const transcript = SessionModelRequest.baseTranscript({
        agent: selection.agent.info,
        model,
        tools: selection.tools,
        initial: history.initial,
        messages: history.messages,
      })
      const prepared = yield* context.request.suggestion({
        session: selection.session,
        agent: selection.agent.id,
        model,
        tools: selection.tools,
        system: transcript.system,
        messages: [
          ...transcript.messages,
          ...(history.instructionUpdate ? [Message.system(history.instructionUpdate)] : []),
          Message.user(INSTRUCTION),
        ],
      })
      yield* llm.stream(prepared.request, prepared.options).pipe(
        Stream.runForEach((event) => {
          if (LLMEvent.is.providerError(event)) failed = true
          if (LLMEvent.is.textDelta(event)) chunks.push(event.text)
          if (LLMEvent.is.stepFinish(event)) {
            const step = SessionUsage.record(event.usage, model.cost)
            usage = usage ? SessionUsage.add(usage, step) : step
          }
          return Effect.void
        }),
        Effect.catchTag("AI.Error", () =>
          Effect.sync(() => {
            failed = true
          }),
        ),
        Effect.onInterrupt(() => recordUsage.pipe(Effect.asVoid)),
      )
      yield* recordUsage
      if (failed) return
      const suggestion = sanitize(chunks.join(""))
      if (!suggestion) return
      // A suggestion that repeats the user's own last prompt teaches nothing.
      if (priorUser && priorUser.text.trim().toLowerCase() === suggestion.toLowerCase()) return
      return suggestion
    })

    return Service.of({ generate })
  }),
)

export const node = makeLocationNode({
  service: Service,
  layer,
  deps: [Bus.node, llmClient, SessionContext.node, SessionStore.node, Database.node],
})
