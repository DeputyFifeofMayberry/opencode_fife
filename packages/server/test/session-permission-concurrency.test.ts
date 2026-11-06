import { expect } from "bun:test"
import path from "node:path"
import { Agent } from "@opencode/core/agent"
import { App } from "@opencode/core/app"
import { Bus } from "@opencode/core/bus"
import { Config } from "@opencode/core/config"
import { Database } from "@opencode/core/database/database"
import { llmClient } from "@opencode/core/effect/app-node-platform"
import { Watcher } from "@opencode/core/filesystem/watcher"
import { Instance } from "@opencode/core/instance"
import { ModelsDev } from "@opencode/core/models-dev"
import { Permission } from "@opencode/core/permission"
import { Session } from "@opencode/core/session"
import { SessionRunnerModel } from "@opencode/core/session/runner/model"
import { Document, Info } from "@opencode/schema/config"
import { ConfigEffort } from "@opencode/schema/config/effort"
import { Location } from "@opencode/schema/location"
import { AbsolutePath } from "@opencode/schema/schema"
import { LayerNode } from "@opencode/util/effect/layer-node"
import { Global } from "@opencode/util/global"
import { Context, Deferred, Effect, Fiber, Layer, Stream } from "effect"
import { HttpEffect, HttpRouter, HttpServer } from "effect/http"
import { LanguageModel, LLMClient } from "../../ai/src/effect"
import { OpenAIChat } from "../../ai/src/protocols/openai-chat"
import { TestLLM } from "../../ai/src/testing"
import { tempGlobalLayer } from "../../core/test/fixture/global"
import { tmpdirScoped } from "../../core/test/fixture/tmpdir"
import { it } from "../../core/test/lib/effect"
import { createEmbeddedRoutes } from "../src/routes"

const exists = (directory: string, name: string) =>
  Effect.promise(() => Bun.file(path.join(directory, name)).exists())

it.live(
  "completes another session's shell while a shell permission remains pending",
  () =>
    Effect.gen(function* () {
      const directory = yield* tmpdirScoped()
      const location = Location.Ref.make({ directory: AbsolutePath.make(directory.path) })
      const askCommand = "echo first > a-marker.txt"
      const allowedCommand = "echo second > b-marker.txt"
      const first = Session.ID.make("ses_permission_first")
      const second = Session.ID.make("ses_permission_second")
      const llm = yield* TestLLM.Test.pipe(Effect.provide(TestLLM.testLayer()))
      const model = SessionRunnerModel.resolved(
        LanguageModel.make({ id: "permission-model", provider: "test", route: OpenAIChat.route }),
        {
          capabilities: { tools: true, input: ["text"], output: ["text"] },
          cost: [],
          limit: { context: 200_000, output: 8_192 },
        },
      )
      const replacements: LayerNode.Replacements = [
        Global.node.replace(tempGlobalLayer),
        // The workspace gate only engages when verification commands are configured.
        Config.node.replace(
          Config.testLayer([
            new Document({
              type: "document",
              info: new Info({
                effort_policy: new ConfigEffort.Info({ verification_commands: ["pnpm typecheck"] }),
              }),
            }),
          ]),
        ),
        Database.node.replace(Database.node),
        Bus.node.replace(Bus.node),
        App.node.replace(App.node),
        ModelsDev.node.replace(ModelsDev.configured({ fetch: false })),
        Watcher.node.replace(Watcher.configured({ enabled: false })),
        llmClient.replace(Layer.succeed(LLMClient.Service, llm)),
        SessionRunnerModel.node.replace(
          Layer.succeed(SessionRunnerModel.Service, { resolve: () => Effect.succeed(model) }),
        ),
      ]
      const context = yield* Layer.build(
        createEmbeddedRoutes({}, replacements).pipe(Layer.provide(HttpServer.layerServices)),
      )
      const sessions = Context.get(context, Session.Service)
      const instances = Context.get(context, Instance.Service)
      const bus = Context.get(context, Bus.Service)
      const handler = Context.get(context, HttpRouter.HttpRouter)
        .asHttpEffect()
        .pipe(HttpEffect.toWebHandlerWith(context))
      const request = (route: string, body?: unknown) =>
        Effect.promise(() =>
          handler(
            new Request(
              `http://opencode.local${route}`,
              body === undefined
                ? undefined
                : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) },
            ),
          ),
        )

      yield* Effect.forEach([first, second], (id) =>
        sessions.create({ id, title: id, agent: Agent.ID.make("build"), model: model.ref, location }),
      )
      // Only the exact first command asks; every other shell command stays prompt-free for the second Session.
      yield* Effect.forEach([first, second], (id) =>
        Effect.flatMap(sessions.get(id), (session) =>
          Effect.gen(function* () {
            const agents = yield* Agent.Service
            yield* agents.transform((editor) =>
              editor.update(Agent.ID.make("build"), (agent) => {
                agent.permissions = [
                  { action: "shell", resource: "*", effect: "allow" },
                  { action: "shell", resource: "echo first*", effect: "ask" },
                ]
              }),
            )
          }).pipe(instances.provide(session)),
        ),
      )

      const asked = yield* Deferred.make<Permission.Request>()
      yield* bus.subscribe(Permission.Event.Asked).pipe(
        Stream.filter((event) => event.data.sessionID === first),
        Stream.runForEach((event) => Deferred.succeed(asked, event.data).pipe(Effect.asVoid)),
        Effect.forkChild,
      )

      yield* sessions.prompt({ sessionID: first, text: "run the first command", resume: false })
      yield* llm.push(TestLLM.toolCall("call_first", "shell", { command: askCommand }))
      const runningFirst = yield* sessions.resume(first).pipe(Effect.forkChild)
      const permission = yield* Effect.race(
        Deferred.await(asked),
        Fiber.await(runningFirst).pipe(
          Effect.flatMap((exit) =>
            Effect.fail(new Error(`Session finished before asking for permission (${exit._tag})`)),
          ),
        ),
      ).pipe(Effect.timeout("10 seconds"))
      expect(permission.resources.some((resource) => resource.includes("first"))).toBe(true)

      const pending = yield* request(`/api/session/${first}/permission`)
      expect(pending.status).toBe(200)
      const pendingBody = yield* Effect.promise<{ data: { id: string }[] }>(() => pending.json())
      expect(pendingBody.data.map((entry) => entry.id)).toEqual([permission.id])

      yield* sessions.prompt({ sessionID: second, text: "run the second command", resume: false })
      yield* llm.push(
        TestLLM.toolCall("call_second", "shell", { command: allowedCommand }),
        TestLLM.text("second finished", "second-final"),
      )
      const runningSecond = yield* sessions.resume(second).pipe(Effect.forkChild)
      yield* Fiber.join(runningSecond).pipe(Effect.timeout("10 seconds"))
      expect(yield* exists(directory.path, "b-marker.txt")).toBe(true)
      expect(yield* exists(directory.path, "a-marker.txt")).toBe(false)

      yield* llm.push(TestLLM.text("first finished", "first-final"))
      const reply = yield* request(`/api/session/${first}/permission/${permission.id}/reply`, {
        decision: "once",
      })
      expect(reply.status).toBe(204)
      yield* Fiber.join(runningFirst).pipe(Effect.timeout("10 seconds"))
      expect(yield* exists(directory.path, "a-marker.txt")).toBe(true)

      const cleared = yield* request(`/api/session/${first}/permission`)
      expect(yield* Effect.promise<{ data: unknown[] }>(() => cleared.json())).toEqual({ data: [] })
    }),
  30_000,
)
