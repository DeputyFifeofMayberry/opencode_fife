import { Effect } from "effect"
import type { AIError, ContentPart, MessageRole } from "../../schema/index.js"
import { unsupportedContent } from "../shared.js"

export type PartKind = ContentPart["type"]

/**
 * Canonical order of content part kinds, used for diagnostics and conformance.
 * `partKindsComplete` below is a type-level guard: adding a member to `ContentPart`
 * without listing it here fails to compile.
 */
export const PartKinds = ["text", "media", "tool-call", "tool-result", "reasoning", "compaction", "effort"] as const

type Unlisted = Exclude<PartKind, (typeof PartKinds)[number]>
type AllKindsListed = [Unlisted] extends [never] ? true : ["part kind missing from PartKinds", Unlisted]

/** Never read. Its type is the assertion that `PartKinds` covers every `ContentPart` member. */
export const partKindsComplete: AllKindsListed = true

/** Which part kinds a protocol accepts, per role. Each protocol declares its own. */
export interface ContentPolicy {
  readonly route: string
  readonly system: ReadonlyArray<PartKind>
  readonly user: ReadonlyArray<PartKind>
  readonly assistant: ReadonlyArray<PartKind>
  readonly tool: ReadonlyArray<PartKind>
}

export const accepts = (policy: ContentPolicy, role: MessageRole, part: ContentPart) => policy[role].includes(part.type)

/**
 * Accepted kinds in canonical order, so the diagnostic message does not depend on
 * declaration order. Single-kind roles are returned as declared.
 */
export const kindsOf = (policy: ContentPolicy, role: MessageRole): ReadonlyArray<PartKind> => {
  const accepted = policy[role]
  if (accepted.length <= 1) return accepted
  return PartKinds.filter((kind) => accepted.includes(kind))
}

/**
 * The shared guard. Deliberately returns `void`: the previous per-protocol guard was a
 * type predicate, and routing the part back through an Effect would lose that narrowing.
 * Callers discriminate `part.type` inside their own branches.
 */
export const assert = (policy: ContentPolicy, role: MessageRole, part: ContentPart): Effect.Effect<void, AIError> =>
  accepts(policy, role, part)
    ? Effect.void
    : Effect.fail(unsupportedContent(policy.route, role, kindsOf(policy, role)))
