import { expect, test } from "bun:test"
import { fromV1, type LegacyShareMessage } from "./v1"

const assistant = (): LegacyShareMessage => ({
  id: "msg_1",
  role: "assistant",
  metadata: {
    sessionID: "ses_1",
    time: { created: 100, completed: 200 },
    assistant: {
      cost: 0.5,
      path: { cwd: "/tmp/project", root: "/tmp/project" },
      tokens: { input: 1, output: 2, reasoning: 3, cache: { read: 0, write: 0 } },
      modelID: "model-1",
      providerID: "provider-1",
    },
    tool: { call_1: { title: "Reading file", time: { start: 10, end: 20 } } },
  },
  parts: [
    { type: "text", text: "Reading the file" },
    {
      type: "tool-invocation",
      toolInvocation: {
        state: "result",
        toolCallId: "call_1",
        toolName: "read",
        args: { file: "a.ts" },
        result: "contents",
      },
    },
  ],
})

test("throws on malformed payloads instead of corrupting the render", () => {
  const payloads = [
    null,
    {},
    { id: "msg_1" },
    { id: "msg_1", metadata: {}, parts: [] },
    { id: "msg_1", metadata: { time: {} }, parts: [] },
    { id: "msg_1", metadata: { time: { created: 1 } }, parts: "text" },
  ]
  for (const payload of payloads) {
    expect(() => fromV1(payload as unknown as LegacyShareMessage)).toThrow("malformed legacy share message")
  }
})

test("upgrades an assistant message with its tool invocation", () => {
  const message = fromV1(assistant())
  if (message.role !== "assistant") throw new Error("expected assistant message")

  expect(message).toMatchObject({ id: "msg_1" })
  expect(message.cost).toBe(0.5)
  expect(message.tokens).toEqual({ input: 1, output: 2, reasoning: 3, cache: { read: 0, write: 0 } })
  expect(message.parts).toHaveLength(2)
  const tool = message.parts[1]
  if (tool.type !== "tool") throw new Error("expected tool part")
  expect(tool.callID).toBe("call_1")
  expect(tool.state).toMatchObject({
    status: "completed",
    output: "contents",
    title: "Reading file",
    time: { start: 10, end: 20 },
  })
})

test("defaults missing assistant tokens to zeros", () => {
  const payload = assistant()
  payload.metadata.assistant!.tokens = undefined

  const message = fromV1(payload)
  if (message.role !== "assistant") throw new Error("expected assistant message")

  expect(message.tokens).toEqual({ input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } })
})

test("assistant message without assistant metadata throws", () => {
  const payload = assistant()
  payload.metadata.assistant = undefined

  expect(() => fromV1(payload)).toThrow("assistant message without assistant metadata")
})

test("upgrades a user message with text and file parts", () => {
  const message = fromV1({
    id: "msg_2",
    role: "user",
    metadata: { sessionID: "ses_1", time: { created: 50 }, tool: {} },
    parts: [
      { type: "text", text: "hello" },
      { type: "file", mediaType: "image/png", url: "data:image/png;base64,x", filename: "shot.png" },
    ],
  })

  expect(message).toMatchObject({ id: "msg_2" })
  expect(message.parts).toHaveLength(2)
  const file = message.parts[1]
  if (file.type !== "file") throw new Error("expected file part")
  expect(file.mime).toBe("image/png")
  expect(file.filename).toBe("shot.png")
  expect(file.url).toBe("data:image/png;base64,x")
})
