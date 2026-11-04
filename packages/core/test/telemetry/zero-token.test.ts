import { describe, expect, test } from "bun:test"
import path from "node:path"
import { Effect, Layer } from "effect"
import { LanguageModel } from "@opencode/ai/effect"
import { OpenAIChat } from "@opencode/ai/protocols/openai-chat"
import { TestLLM } from "@opencode/ai/testing"
import { Agent } from "@opencode/core/agent"
import { AppNodeBuilder } from "@opencode/core/effect/app-node-builder"
import { LayerNodePlatform } from "@opencode/core/effect/app-node-platform"
import { Watcher } from "@opencode/core/filesystem/watcher"
import { LocationServiceMap } from "@opencode/core/location-service-map"
import { Model } from "@opencode/core/model"
import { Provider } from "@opencode/core/provider"
import { AbsolutePath } from "@opencode/core/schema"
import { Session } from "@opencode/core/session"
import { SessionRunnerModel } from "@opencode/core/session/runner/model"
import { ShellSelect } from "@opencode/core/shell/select"
import { TaskStore } from "@opencode/core/telemetry/task"
import { LayerNode } from "@opencode/util/effect/layer-node"
import { Global } from "@opencode/util/global"
import { withEnv } from "../fixture/env"
import { tempGlobalLayer } from "../fixture/global"
import { offlineModels } from "../fixture/models"
import { tmpdirScoped } from "../fixture/tmpdir"
import { testEffect } from "../lib/effect"

const llmLayer = TestLLM.testLayer({ fallback: TestLLM.text("done", "done") })

const it = testEffect(
  Layer.merge(
    llmLayer,
    AppNodeBuilder.build(LayerNode.group([Session.node, LocationServiceMap.node, TaskStore.node]), [
      Global.node.replace(tempGlobalLayer),
      offlineModels,
      Watcher.node.replace(Watcher.configured({ enabled: false })),
      LayerNodePlatform.llmClient.replace(llmLayer),
      SessionRunnerModel.node.replace(
        Layer.succeed(SessionRunnerModel.Service, {
          resolve: (session) =>
            Effect.succeed(
              SessionRunnerModel.resolved(
                LanguageModel.make({ id: session.model?.id ?? "parent", provider: "test", route: OpenAIChat.route }),
                {
                  capabilities: { tools: true, input: ["text"], output: ["text"] },
                  cost: [],
                  limit: { context: 200_000, output: 32_000 },
                },
              ),
            ),
        }),
      ),
    ]),
  ),
)

const parentModel = Model.Ref.make({ id: Model.ID.make("parent"), providerID: Provider.ID.make("test") })

/**
 * A shell that can actually be stat'd. The runner resolves `SHELL` before dispatch, and a
 * Windows app-execution alias such as `...\WindowsApps\pwsh.exe` fails `stat` with EACCES,
 * which would fail the turn before any model call and make these assertions meaningless.
 */
const shellEnv = { SHELL: process.platform === "win32" ? (process.env.COMSPEC ?? "cmd.exe") : "/bin/sh" }

/**
 * Telemetry must not add a model request, alter a captured request, or run inside a turn.
 * These assertions are executable: the request array is compared byte for byte before and
 * after task operations, and a second turn must cost exactly one more request.
 *
 * Each session is created with a title so the runner does not schedule its separate
 * background title request, and each turn is asserted to have succeeded so a turn that
 * failed before dispatch cannot satisfy the request count by accident.
 */
describe("telemetry zero-token guarantee", () => {
  it.live("adds no request and leaves captured requests untouched", () =>
    withEnv(shellEnv, () =>
      Effect.gen(function* () {
        const tmp = yield* tmpdirScoped()
        const sessions = yield* Session.Service
        const llm = yield* TestLLM.Test
        const store = yield* TaskStore.Service

        // The shell resolver caches by bin path for the whole process; reset so this test
        // resolves against the pinned SHELL instead of a value cached by an earlier file.
        yield* Effect.sync(() => ShellSelect.resolve.reset())

        const session = yield* sessions.create({
          location: { directory: AbsolutePath.make(tmp.path) },
          agent: Agent.ID.make("build"),
          model: parentModel,
          title: "zero-token",
        })

        yield* sessions.prompt({ sessionID: session.id, text: "hello" })
        yield* sessions.wait(session.id)

        const messages = yield* sessions.messages({ sessionID: session.id })
        expect(messages.some((message) => message.type === "assistant")).toBe(true)
        expect(messages.some((message) => message.type === "idle" && message.outcome === "succeeded")).toBe(true)

        const before = yield* llm.requests()
        expect(before).toHaveLength(1)
        const snapshot = JSON.stringify(before)

        const task = yield* store.ensure({ sessionID: session.id, label: "zero-token" })
        yield* store.record({ taskID: task.id, outcome: "accepted", source: "test" })
        yield* store.history(task.id)

        const after = yield* llm.requests()
        expect(after).toHaveLength(1)
        expect(JSON.stringify(after)).toBe(snapshot)
      }),
    ),
  )

  it.live("costs exactly one request per session with telemetry present", () =>
    withEnv(shellEnv, () =>
      Effect.gen(function* () {
        const tmp = yield* tmpdirScoped()
        const sessions = yield* Session.Service
        const llm = yield* TestLLM.Test
        const store = yield* TaskStore.Service

        yield* Effect.sync(() => ShellSelect.resolve.reset())

        const first = yield* sessions.create({
          location: { directory: AbsolutePath.make(tmp.path) },
          agent: Agent.ID.make("build"),
          model: parentModel,
          title: "first",
        })
        const task = yield* store.ensure({ sessionID: first.id })
        yield* sessions.prompt({ sessionID: first.id, text: "first" })
        yield* sessions.wait(first.id)
        expect(yield* llm.requests()).toHaveLength(1)

        yield* store.record({ taskID: task.id, outcome: "unverified" })

        const second = yield* sessions.create({
          location: { directory: AbsolutePath.make(tmp.path) },
          agent: Agent.ID.make("build"),
          model: parentModel,
          title: "second",
        })
        yield* sessions.prompt({ sessionID: second.id, text: "second" })
        yield* sessions.wait(second.id)
        expect(yield* llm.requests()).toHaveLength(2)
      }),
    ),
  )
})

/**
 * Structural guard: the session runtime must not reach into telemetry. If this fails, a
 * future change has wired collection into the execution path and the runtime guarantee no
 * longer holds by construction.
 */
test("the session runtime never imports telemetry", async () => {
  const root = path.join(import.meta.dir, "../../src/session")
  const offenders: string[] = []
  for (const relative of new Bun.Glob("**/*.ts").scanSync(root)) {
    const text = await Bun.file(path.join(root, relative)).text()
    if (text.includes("/telemetry/")) offenders.push(relative)
  }
  expect(offenders).toEqual([])
})
