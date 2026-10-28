import type { Context } from "@opencode/plugin/effect/plugin"
import type { ToolHooks, ToolFailures } from "@opencode/plugin/effect/tool"
import type { ShellHooks } from "@opencode/plugin/effect/shell"
import type { SessionHooks } from "@opencode/plugin/effect/session"
import type { Hooks } from "@opencode/plugin/effect/registration"
import type { Plugin } from "@opencode/plugin/promise/plugin"
import { fromPromise } from "@opencode/plugin/promise/adapter"
import { EventManifest } from "@opencode/schema/event-manifest"
import { Agent } from "@opencode/schema/agent"
import { SessionID } from "@opencode/schema/session-id"
import { SessionMessage } from "@opencode/schema/session-message"
import { Tool } from "@opencode/schema/tool"
import { Location } from "@opencode/schema/location"
import { AbsolutePath } from "@opencode/schema/schema"
import { ProjectID } from "@opencode/schema/project-id"
import { Deferred, Effect, Exit, PubSub, Schema, Scope, Stream } from "effect"
import { host } from "../plugin/host"

const FixtureEvent = Schema.Union(EventManifest.ServerDefinitions)

function hooks<Spec, Failures extends Record<keyof Spec, unknown> = Record<keyof Spec, never>>() {
  const callbacks = new Map<keyof Spec, Set<(event: unknown) => Effect.Effect<void, unknown>>>()
  const hook: Hooks<Spec, Failures> = (name, callback) =>
    Effect.sync(() => {
      const current = callbacks.get(name) ?? new Set()
      const run = (event: unknown) => callback(event as Spec[typeof name])
      current.add(run)
      callbacks.set(name, current)
      return {
        dispose: Effect.sync(() => {
          current.delete(run)
        }),
      }
    })
  return {
    hook,
    size: () => [...callbacks.values()].reduce((sum, group) => sum + group.size, 0),
    emit: <Name extends keyof Spec>(name: Name, event: Spec[Name]) =>
      Effect.runPromise(Effect.forEach(callbacks.get(name) ?? [], (callback) => callback(event), { discard: true })),
  }
}

export async function fixture(plugin: Plugin, directory: string, options: Context["options"] = { enabled: true }) {
  const scope = await Effect.runPromise(Scope.make())
  const events = await Effect.runPromise(PubSub.unbounded<typeof FixtureEvent.Type>())
  const ready = await Effect.runPromise(Deferred.make<void>())
  const tool = hooks<ToolHooks, ToolFailures>()
  const shell = hooks<ShellHooks>()
  const session = hooks<SessionHooks>()
  const location = new Location.Info({
    directory: AbsolutePath.make(directory),
    project: {
      id: ProjectID.make("ecc-fixture"),
      directory: AbsolutePath.make(directory),
      canonical: AbsolutePath.make(directory),
    },
  })
  const base = host({ location })
  const context: Context = {
    ...base,
    options,
    tool: { ...base.tool, hook: tool.hook },
    shell: { hook: shell.hook },
    session: { ...base.session, hook: session.hook },
    event: {
      // SAFETY: plugins receive only the event types they subscribe to, and the generic
      // signature cannot track that runtime filter, so this matches the production host's
      // cast in ../plugin/host.ts.
      subscribe: ((input?: { readonly types?: ReadonlyArray<string> }) =>
        Stream.unwrap(
          Effect.gen(function* () {
            const queue = yield* PubSub.subscribe(events)
            yield* Deferred.succeed(ready, undefined)
            return Stream.fromSubscription(queue).pipe(
              Stream.filter(
                (event) =>
                  input?.types === undefined || input.types.length === 0 || input.types.includes(event.type),
              ),
            )
          }),
        )) as Context["event"]["subscribe"],
    },
  }
  try {
    await Effect.runPromise(fromPromise(plugin).effect(context).pipe(Effect.provideService(Scope.Scope, scope)))
  } catch (error) {
    await Effect.runPromise(Scope.close(scope, Exit.void))
    throw error
  }
  return {
    tool,
    shell,
    session,
    location,
    subscriptionsReady: () => Effect.runPromise(Deferred.await(ready)),
    publish: async (data: unknown) => {
      const event = Schema.decodeUnknownSync(FixtureEvent)(data)
      await Effect.runPromise(PubSub.publish(events, event))
    },
    close: () => Effect.runPromise(Scope.close(scope, Exit.void)),
    [Symbol.asyncDispose]: () => Effect.runPromise(Scope.close(scope, Exit.void)),
  }
}

export function call(session: string, input: unknown, tool = "write", id = `call-${Math.random()}`) {
  return {
    sessionID: SessionID.make(session),
    agent: Agent.ID.make("build"),
    messageID: SessionMessage.ID.create(),
    id: Tool.CallID.make(id),
    tool,
    input,
  }
}
