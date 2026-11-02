import type { ContentPart, MessageRole } from "../../schema/index.js"

/** The part of a message these decisions read, so callers need not build a full request. */
export interface HistoryEntry {
  readonly role: MessageRole
  readonly content: ReadonlyArray<ContentPart>
}

/**
 * Whether the conversation already contains tool calls or results. Providers such as
 * Anthropic via LiteLLM and Bedrock require the `tools` key whenever history carries
 * tool calls, even when no tools are active.
 */
export const hasToolHistory = (messages: ReadonlyArray<HistoryEntry>) => {
  for (const message of messages) {
    if (message.role === "tool") return true
    if (message.role === "assistant" && message.content.some((part) => part.type === "tool-call")) return true
  }
  return false
}

export interface ParallelToolCallInput {
  readonly toolChoice?: { readonly disableParallelToolUse?: boolean }
}

/**
 * `parallel_tool_calls` as the wire should carry it. An explicit provider option wins;
 * otherwise the caller's tool choice decides; otherwise the field is omitted.
 */
export const parallelToolCalls = (input: ParallelToolCallInput, configured?: boolean): boolean | undefined => {
  if (configured !== undefined) return configured
  const disabled = input.toolChoice?.disableParallelToolUse
  return disabled === undefined ? undefined : !disabled
}
