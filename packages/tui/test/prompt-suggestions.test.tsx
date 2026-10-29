import { expect, test, beforeEach } from "bun:test"
import { createTestRenderer } from "@opentui/core/testing"
import { Effect, FileSystem } from "effect"
import { Global } from "@opencode/util/global"
import { takeDraft } from "../src/component/prompt/draft-stash"
import type { OpenCodeEvent } from "@opencode/client"
import { createEventStream, createFetch, directory, json } from "./fixture/tui-client"
import { tmpdir } from "./fixture/fixture"

// Earlier app tests in this process can leave a prompt draft that the next app would restore.
beforeEach(() => takeDraft(undefined))

const location = { directory, project: { id: "project", directory, canonical: directory } }

// A unique session per test: the prompt stashes drafts by session, so a shared id
// would restore the previous test's accepted suggestion into the next app.
let sequence = 0

async function boot(options: { experimental?: boolean; suggestion?: string }) {
  const sessionID = `ses_suggest_${++sequence}`
  await using state = await tmpdir()
  const setup = await createTestRenderer({ width: 100, height: 30, kittyKeyboard: true })
  await setup.renderer.setupTerminal()
  setup.renderer.start()
  const ready = Promise.withResolvers<void>()
  const events = createEventStream()
  const suggestionCalls: string[] = []
  const calls = createFetch(async (url) => {
    if (url.pathname === `/api/session/${sessionID}`)
      return json({
        data: {
          id: sessionID,
          projectID: "project",
          title: "Suggestion fixture",
          model: { providerID: "demo", id: "model" },
          location: { directory },
          cost: 0,
          tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
          time: { created: 0, updated: 0 },
        },
      })
    if (url.pathname === `/api/session/${sessionID}/message`) return json({ data: [], cursor: {} })
    if (url.pathname === `/api/session/${sessionID}/agent`) return json({ data: [] })
    if (url.pathname === `/api/session/${sessionID}/inbox` || url.pathname === `/api/session/${sessionID}/permission`)
      return json({ data: [] })
    if (url.pathname === "/api/agent")
      return json({ location, data: [{ id: "build", mode: "primary", hidden: false, permissions: [] }] })
    if (url.pathname === "/api/provider") return json({ location, data: [{ id: "demo", name: "Demo" }] })
    if (url.pathname === "/api/model")
      return json({ location, data: [{ id: "model", providerID: "demo", name: "Demo Model", variants: [] }] })
    if (url.pathname === `/api/session/${sessionID}/suggestion`) {
      suggestionCalls.push(url.pathname)
      return json({ data: { text: options.suggestion ?? "run the tests" } })
    }
    return undefined
  }, events)
  const server = Bun.serve({ port: 0, fetch: (request) => calls.fetch(request) })
  const { run } = await import("../src/app")
  const task = Effect.runPromise(
    run({
      app: { name: "test", version: "test", channel: "test" },
      server: { endpoint: { url: server.url.toString() } },
      config: {
        get: async () => ({
          animations: false,
          ...(options.experimental ? { experimental: { "prompt-suggestions": true } } : {}),
        }),
        update: async () => ({}),
      },
      packages: { prepare: async () => ({ directory: "" }) },
      terminalHandoff: async () => ({ renderer: setup.renderer, mode: "dark", complete: ready.resolve }),
      args: { sessionID },
      log: () => {},
    }).pipe(Effect.provide(Global.layerWith({ state: state.path })), Effect.provide(FileSystem.layerNoop({}))),
  )
  const dispose = async () => {
    try {
      setup.renderer.destroy()
      await task
    } finally {
      await server.stop()
      await state[Symbol.asyncDispose]()
    }
  }
  try {
    await ready.promise
    await setup.waitForFrame((frame) => frame.includes("Demo Model"))
  } catch (error) {
    await dispose()
    throw error
  }
  const succeed = () =>
    events.emit({
      id: `evt_succeeded_${suggestionCalls.length}`,
      created: 0,
      type: "session.execution.succeeded",
      durable: { aggregateID: sessionID, seq: 1, version: 1 },
      data: { sessionID },
    } satisfies OpenCodeEvent)
  return { setup, events, suggestionCalls, succeed, dispose }
}

test("a finished exchange shows the suggestion as ghost text and Tab inserts it", async () => {
  const app = await boot({ experimental: true })
  try {
    app.succeed()
    await app.setup.waitForFrame((frame) => frame.includes("run the tests"))
    app.setup.mockInput.pressTab()
    await app.setup.waitFor(async () => app.setup.renderer.currentFocusedEditor?.plainText === "run the tests")
    // The suggestion became regular input text; the ghost is gone.
    const frame = app.setup.captureCharFrame()
    expect(frame).not.toContain("run the tests\n")
    expect(app.suggestionCalls).toHaveLength(1)
  } finally {
    await app.dispose()
  }
})

test("typing dismisses the suggestion and Tab stops offering it", async () => {
  const app = await boot({ experimental: true })
  try {
    app.succeed()
    await app.setup.waitForFrame((frame) => frame.includes("run the tests"))
    app.setup.mockInput.typeText("x")
    // The ghost must disappear from the frame, not just from the editor value.
    await app.setup.waitForFrame((frame) => !frame.includes("run the tests"))
    expect(app.setup.renderer.currentFocusedEditor?.plainText).toBe("x")
    const before = app.suggestionCalls.length
    app.setup.mockInput.pressTab()
    await app.setup.renderOnce()
    expect(app.setup.renderer.currentFocusedEditor?.plainText).toBe("x")
    expect(app.suggestionCalls).toHaveLength(before)
  } finally {
    await app.dispose()
  }
})

test("Enter on the ghost submits nothing", async () => {
  const app = await boot({ experimental: true })
  try {
    app.succeed()
    await app.setup.waitForFrame((frame) => frame.includes("run the tests"))
    app.setup.mockInput.pressEnter()
    await app.setup.waitForFrame((frame) => !frame.includes("run the tests"))
    expect(app.setup.renderer.currentFocusedEditor?.plainText).toBe("")
  } finally {
    await app.dispose()
  }
})

test("with the experiment off no suggestion request is made", async () => {
  const app = await boot({ experimental: false })
  try {
    app.succeed()
    await app.setup.renderOnce()
    expect(app.suggestionCalls).toHaveLength(0)
    expect(app.setup.captureCharFrame()).not.toContain("run the tests")
  } finally {
    await app.dispose()
  }
})
