import type { SessionV1 } from "@opencode/schema/session-v1"

export type MessageWithParts = SessionV1.Info & { parts: SessionV1.Part[] }

/**
 * The share API (`share_data` / `share_poll`) serves opencode 0.x session payloads: role-keyed
 * messages with a `metadata` block and AI-SDK-style `parts`. That wire format predates `SessionV1`
 * and has no `@opencode/schema` equivalent, so it stays a local type; `fromV1` upgrades it to the
 * `SessionV1` shapes the renderer consumes. Remote payloads only resemble this shape, so `fromV1`
 * guards the render-critical fields and throws on the rest.
 */
export type LegacyShareMessage = {
  id: string
  role: "user" | "assistant"
  metadata: {
    sessionID: string
    time: { created: number; completed?: number }
    assistant?: {
      cost: number
      path: { cwd: string; root: string }
      summary?: boolean
      tokens?: {
        total?: number
        input: number
        output: number
        reasoning: number
        cache: { read: number; write: number }
      }
      modelID: string
      providerID: string
    }
    error?: SessionV1.Assistant["error"]
    tool: Record<string, { title: string; time: { start: number; end: number } }>
  }
  parts: Array<
    { type: "text"; text: string }
    | { type: "step-start" }
    | {
        type: "tool-invocation"
        toolInvocation:
          | { state: "partial-call"; toolCallId: string; toolName: string }
          | { state: "call"; toolCallId: string; toolName: string; args: Record<string, unknown> }
          | {
              state: "result"
              toolCallId: string
              toolName: string
              args: Record<string, unknown>
              result: string
            }
      }
    | { type: "file"; mediaType: string; filename?: string; url: string }
  >
}

export function fromV1(v1: LegacyShareMessage): MessageWithParts {
  // The payload is remote and only resembles the type above; guard the fields the renderer
  // dereferences inside memos, where a throw crashes the page instead of landing in the poll
  // handler's catch.
  if (
    typeof v1?.id !== "string" ||
    typeof v1.metadata?.time?.created !== "number" ||
    !Array.isArray(v1.parts)
  ) {
    throw new Error("malformed legacy share message")
  }
  // Legacy share ids predate SessionV1's branded prefixes (ses_/msg_/prt_); cast once at the boundary.
  const id = v1.id as SessionV1.Assistant["id"]
  const sessionID = v1.metadata.sessionID as SessionV1.Assistant["sessionID"]

  if (v1.role === "assistant") {
    const assistant = v1.metadata.assistant
    if (!assistant) throw new Error("assistant message without assistant metadata")
    return {
      id,
      sessionID,
      role: "assistant",
      parentID: "" as SessionV1.Assistant["parentID"],
      agent: "build",
      time: {
        created: v1.metadata.time.created,
        completed: v1.metadata.time.completed,
      },
      cost: assistant.cost,
      path: assistant.path,
      summary: assistant.summary,
      tokens: assistant.tokens ?? {
        input: 0,
        output: 0,
        cache: {
          read: 0,
          write: 0,
        },
        reasoning: 0,
      },
      modelID: assistant.modelID as SessionV1.Assistant["modelID"],
      providerID: assistant.providerID as SessionV1.Assistant["providerID"],
      mode: "build",
      error: v1.metadata.error,
      parts: v1.parts.flatMap((part, index): SessionV1.Part[] => {
        const base = {
          id: index.toString() as SessionV1.ToolPart["id"],
          messageID: id,
          sessionID,
        }
        if (part.type === "text") {
          return [
            {
              ...base,
              type: "text",
              text: part.text,
            },
          ]
        }
        if (part.type === "step-start") {
          return [
            {
              ...base,
              type: "step-start",
            },
          ]
        }
        if (part.type === "tool-invocation") {
          return [
            {
              ...base,
              type: "tool",
              callID: part.toolInvocation.toolCallId,
              tool: part.toolInvocation.toolName,
              state: (() => {
                if (part.toolInvocation.state === "partial-call") {
                  return {
                    status: "pending",
                    input: {},
                    raw: "",
                  }
                }

                const { title, time, ...metadata } = v1.metadata.tool[part.toolInvocation.toolCallId]
                if (part.toolInvocation.state === "call") {
                  return {
                    status: "running",
                    input: part.toolInvocation.args,
                    time: {
                      start: time.start,
                    },
                  }
                }

                if (part.toolInvocation.state === "result") {
                  return {
                    status: "completed",
                    input: part.toolInvocation.args,
                    output: part.toolInvocation.result,
                    title,
                    time,
                    metadata,
                  }
                }
                throw new Error("unknown tool invocation state")
              })(),
            },
          ]
        }
        return []
      }),
    }
  }

  if (v1.role === "user") {
    return {
      id,
      sessionID,
      role: "user",
      agent: "user",
      model: { providerID: "", modelID: "" } as SessionV1.User["model"],
      time: {
        created: v1.metadata.time.created,
      },
      parts: v1.parts.flatMap((part, index): SessionV1.Part[] => {
        const base = {
          id: index.toString() as SessionV1.ToolPart["id"],
          messageID: id,
          sessionID,
        }
        if (part.type === "text") {
          return [
            {
              ...base,
              type: "text",
              text: part.text,
            },
          ]
        }
        if (part.type === "file") {
          return [
            {
              ...base,
              type: "file",
              mime: part.mediaType,
              filename: part.filename,
              url: part.url,
            },
          ]
        }
        return []
      }),
    }
  }

  throw new Error("unknown message type")
}
