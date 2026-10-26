import { expect } from "bun:test"
import { DateTime, Effect, Schema } from "effect"
import { Database } from "@opencode/core/database/database"
import { ProjectTable } from "@opencode/core/project/sql"
import { SessionMessageTable, SessionTable } from "@opencode/core/session/sql"
import { Tool } from "@opencode/core/tool"
import { SessionTool } from "@opencode/core/tool/plugin/session"
import { Agent } from "@opencode/schema/agent"
import { Model } from "@opencode/schema/model"
import { Project } from "@opencode/schema/project"
import { Provider } from "@opencode/schema/provider"
import { AbsolutePath } from "@opencode/schema/schema"
import { Session } from "@opencode/schema/session"
import { SessionMessage } from "@opencode/schema/session-message"
import { testEffect } from "./lib/effect"
import { executeTool, registerToolPlugin, toolDefinitions, toolIdentity } from "./lib/tool"
import type { ToolExecution } from "./lib/tool"
import { PluginTestLayer } from "./plugin/fixture"

const it = testEffect(PluginTestLayer)
const sessionID = Session.ID.make("ses_session_tool")
const created = DateTime.makeUnsafe(Date.UTC(2026, 0, 1, 12))
const encode = Schema.encodeSync(SessionMessage.Info)

const row = (seq: number, message: SessionMessage.Info): typeof SessionMessageTable.$inferInsert => {
  const encoded = encode(message)
  const { id, type, ...data } = encoded
  return {
    id: SessionMessage.ID.make(id),
    session_id: sessionID,
    type,
    seq,
    time_created: encoded.time.created,
    data,
  }
}

const user = (text: string) =>
  SessionMessage.User.make({ id: SessionMessage.ID.create(), type: "user", text, time: { created } })

const assistant = (text: string, id: SessionMessage.ID) =>
  SessionMessage.Assistant.make({
    id,
    type: "assistant",
    agent: Agent.ID.make("build"),
    model: { id: Model.ID.make("claude"), providerID: Provider.ID.make("anthropic") },
    content: [SessionMessage.AssistantText.make({ type: "text", text })],
    time: { created, completed: created },
  })

const setup = Effect.gen(function* () {
  yield* registerToolPlugin(SessionTool.Plugin)
  const db = (yield* Database.Service).db
  yield* db
    .insert(ProjectTable)
    .values({ id: Project.ID.global, worktree: AbsolutePath.make("/project"), sandboxes: [] })
    .run()
  yield* db
    .insert(SessionTable)
    .values({
      id: sessionID,
      project_id: Project.ID.global,
      slug: "session-tool",
      directory: "/project",
      title: "session tool",
      version: "test",
    })
    .run()
  yield* db
    .insert(SessionMessageTable)
    .values([
      row(1, user("We should use SQLite FTS for transcript retrieval.")),
      row(2, user("Second checkpoint message.")),
      row(3, assistant("The checkpoint cache read was only six percent warm.", SessionMessage.ID.make("msg_warm"))),
      row(4, user("Unrelated request about formatting.")),
    ])
    .run()
  return yield* Tool.Service
})

const run = (registry: Tool.Interface, name: string, input: Record<string, unknown>) =>
  executeTool(registry, {
    sessionID,
    ...toolIdentity,
    call: { type: "tool-call", id: `call-${name}`, name, input },
  })

const text = (result: ToolExecution) =>
  result.content?.[0]?.type === "text" ? result.content[0].text : ""

it.effect("registers search and read as native session tools", () =>
  Effect.gen(function* () {
    const registry = yield* setup
    const names = (yield* toolDefinitions(registry)).map((definition) => definition.name)
    expect(names).toContain("session_search")
    expect(names).toContain("session_read")
  }),
)

it.effect("searches the current session and reads a match with neighbors", () =>
  Effect.gen(function* () {
    const registry = yield* setup
    const searched = yield* run(registry, "session_search", { query: "six percent" })

    expect(searched.status).toBe("completed")
    expect(searched.output.matches).toHaveLength(1)
    const [match] = searched.output.matches
    expect(match.messageID).toBe("msg_warm")
    expect(match.snippet).toContain("percent")
    expect(text(searched)).toContain("session_read")

    const read = yield* run(registry, "session_read", { messageID: match.messageID, before: 1, after: 1 })
    expect(read.status).toBe("completed")
    expect(read.output.message).toMatchObject({
      messageID: "msg_warm",
      seq: 3,
      type: "assistant",
      text: "[Assistant]: The checkpoint cache read was only six percent warm.",
    })
    expect(read.output.before).toMatchObject([{ seq: 2, text: "[User]: Second checkpoint message." }])
    expect(read.output.after).toMatchObject([{ seq: 4, text: "[User]: Unrelated request about formatting." }])
    expect(text(read)).toContain("Second checkpoint")
  }),
)

it.effect("explains an empty search and rejects an unknown message", () =>
  Effect.gen(function* () {
    const registry = yield* setup
    const searched = yield* run(registry, "session_search", { query: "nothing matches this" })
    expect(searched.status).toBe("completed")
    expect(searched.output.matches).toEqual([])
    expect(text(searched)).toContain("No completed transcript messages matched")

    const read = yield* run(registry, "session_read", { messageID: "msg_missing" })
    expect(read.status).toBe("error")
    expect(read.error?.type).toBe("tool.execution")
  }),
)
