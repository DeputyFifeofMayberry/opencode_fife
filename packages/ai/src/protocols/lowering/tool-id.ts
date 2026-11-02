import type { LLMRequest } from "../../schema/index.js"
import { MistralToolID } from "../utils/mistral-tool-id.js"

/** Turns an internal tool-call id into one the provider accepts. Applied to calls and results alike. */
export type ToolIDPolicy = (id: string) => string

/** Mistral-family model names that require a 9-character alphanumeric id. */
const MISTRAL_FAMILY = ["mistral", "devstral", "codestral", "pixtral", "mixtral"]

export const identity: ToolIDPolicy = (id) => id

export const truncate =
  (max: number): ToolIDPolicy =>
  (id) =>
    id.slice(0, max)

export const scrub =
  (pattern: RegExp, replacement: string): ToolIDPolicy =>
  (id) =>
    id.replace(pattern, replacement)

/**
 * The naive Mistral rule used by the OpenAI-compatible chat route. Distinct ids can
 * collapse to the same value; that is existing behaviour and is preserved deliberately.
 */
export const padded =
  (length: number): ToolIDPolicy =>
  (id) =>
    id
      .replace(/[^a-zA-Z0-9]/g, "")
      .slice(0, length)
      .padEnd(length, "0")

/** The collision-safe Mistral normalizer used by the native Mistral route and Bedrock. */
export const collisions = (request: LLMRequest): ToolIDPolicy => MistralToolID.normalizer(request)

/**
 * The OpenAI-compatible chat family switch. `modelID` is lowercased here, so callers may
 * pass the raw model id.
 */
export const forModel = (input: { readonly provider: string; readonly modelID: string }): ToolIDPolicy => {
  const modelID = input.modelID.toLowerCase()
  if (MISTRAL_FAMILY.some((family) => modelID.includes(family))) return padded(9)
  if (modelID.includes("claude")) return scrub(/[^a-zA-Z0-9_-]/g, "_")
  if (input.provider === "openai" || input.provider === "azure" || modelID.startsWith("openai/")) return truncate(40)
  return identity
}
