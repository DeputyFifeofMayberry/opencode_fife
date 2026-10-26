export * as SessionTool from "./session.js"

import { ToolFailure } from "@opencode/ai/effect"
import type { Context } from "@opencode/plugin/effect/plugin"
import { Effect, Schema } from "effect"
import { Database } from "../../database/database.js"
import { SessionMessage } from "../../session/message.js"
import { SessionTranscript } from "../../session/transcript.js"

export const name = "session"

const SearchInput = Schema.Struct({
  query: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(1_000)).annotate({
    description:
      "Words to search for in this session's transcript. Every word must appear; wrap an exact phrase in double quotes.",
  }),
  type: Schema.optionalKey(Schema.Literals(["user", "assistant", "shell", "compaction"])).annotate({
    description: "Only return messages of this type.",
  }),
  limit: Schema.optionalKey(
    Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: SessionTranscript.MAX_SEARCH_LIMIT })),
  ).annotate({ description: `Maximum matches to return. Defaults to ${SessionTranscript.DEFAULT_SEARCH_LIMIT}.` }),
})

const Entry = Schema.Struct({
  messageID: SessionMessage.ID,
  seq: Schema.Int,
  type: Schema.String,
  timeCreated: Schema.Number,
  text: Schema.String,
})

const SearchOutput = Schema.Struct({
  matches: Schema.Array(
    Schema.Struct({
      messageID: SessionMessage.ID,
      seq: Schema.Int,
      type: Schema.String,
      timeCreated: Schema.Number,
      snippet: Schema.String,
    }),
  ),
})

const ReadInput = Schema.Struct({
  messageID: SessionMessage.ID.annotate({
    description: "Message ID returned by session_search.",
  }),
  before: Schema.optionalKey(
    Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: SessionTranscript.MAX_NEIGHBORS })),
  ).annotate({ description: "Also return this many completed messages immediately before the requested one." }),
  after: Schema.optionalKey(
    Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: SessionTranscript.MAX_NEIGHBORS })),
  ).annotate({ description: "Also return this many completed messages immediately after the requested one." }),
})

const ReadOutput = Schema.Struct({
  message: Entry,
  before: Schema.Array(Entry),
  after: Schema.Array(Entry),
})

const timestamp = (value: number) => new Date(value).toISOString()

export const Plugin = {
  id: "opencode.tool.session",
  effect: Effect.fn("SessionTool.Plugin")(function* (ctx: Context) {
    const db = (yield* Database.Service).db

    yield* ctx.tool.transform((draft) => {
      draft.namespace({
        name: "session",
        description:
          "Search and read this session's transcript, including messages that compaction removed from the model's current context.",
      })
      draft.add({
        name: "search",
        description:
          "Search this session's transcript with full-text search. Returns message IDs, types, timestamps, and bounded excerpts. Use it when an earlier decision, command, or file edit is no longer in context.",
        input: SearchInput,
        output: SearchOutput,
        options: { namespace: name, codemode: false },
        execute: (input, context) =>
          Effect.gen(function* () {
            const matches = yield* SessionTranscript.search(db, {
              sessionID: context.sessionID,
              query: input.query,
              type: input.type,
              limit: input.limit,
            })
            if (matches.length === 0)
              return {
                output: { matches },
                content: `No completed transcript messages matched ${JSON.stringify(input.query)}.`,
                metadata: { matches: 0 },
              }
            return {
              output: { matches },
              content: [
                `Found ${matches.length} message${matches.length === 1 ? "" : "s"} matching ${JSON.stringify(input.query)}:`,
                "",
                ...matches.map((match, position) =>
                  [
                    `${position + 1}. ${match.type} (${timestamp(match.timeCreated)}, seq ${match.seq}, ${match.messageID})`,
                    match.snippet,
                  ].join("\n"),
                ),
                "",
                "Use session_read with a message ID to read the complete message.",
              ].join("\n"),
              metadata: { matches: matches.length },
            }
          }),
      })
      draft.add({
        name: "read",
        description:
          "Read one completed message from this session's transcript, bounded to 20,000 characters. Optionally include a few neighboring messages for context.",
        input: ReadInput,
        output: ReadOutput,
        options: { namespace: name, codemode: false },
        execute: (input, context) =>
          Effect.gen(function* () {
            const result = yield* SessionTranscript.read(db, {
              sessionID: context.sessionID,
              messageID: input.messageID,
              before: input.before,
              after: input.after,
            })
            if (!result)
              return yield* new ToolFailure({
                message: `No completed transcript message ${input.messageID} exists in this session.`,
              })
            const entry = (value: typeof result.message) =>
              `[${value.type} ${timestamp(value.timeCreated)}, seq ${value.seq}, ${value.messageID}]\n${value.text || "(no text)"}`
            return {
              output: result,
              content: [
                ...result.before.map(entry),
                entry(result.message),
                ...result.after.map(entry),
              ].join("\n\n"),
              metadata: { messageID: result.message.messageID, seq: result.message.seq },
            }
          }),
      })
    })
  }),
}
