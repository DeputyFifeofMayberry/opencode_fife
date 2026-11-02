import { Effect } from "effect"
import type { MediaPart, ToolResultPart } from "../../schema/index.js"
import { invalidRequest, toolFileMedia, toolResultText } from "../shared.js"

/** Whether a protocol can carry files that arrived inside a tool result. */
export type ToolResultFilePolicy = "allow" | "reject"

export type ToolResultPlan =
  | { readonly type: "text"; readonly text: string }
  | {
      readonly type: "content"
      readonly texts: ReadonlyArray<string>
      readonly files: ReadonlyArray<MediaPart>
    }

/**
 * Splits a tool result into provider-addressable material: text segments and media.
 * Text is not joined and files are not placed — both remain the protocol's choice,
 * because the wire shapes and ordering rules differ per provider.
 */
export const plan = Effect.fnUntraced(function* (
  route: string,
  part: ToolResultPart,
  policy: ToolResultFilePolicy,
) {
  if (part.result.type !== "content") return { type: "text" as const, text: toolResultText(part) }
  const texts = part.result.value.flatMap((item) => (item.type === "text" ? [item.text] : []))
  const files = part.result.value.flatMap((item) => (item.type === "file" ? [toolFileMedia(item)] : []))
  if (policy === "reject" && files.length > 0)
    return yield* invalidRequest(`${route} does not support file content in tool results`)
  return { type: "content" as const, texts, files }
})
