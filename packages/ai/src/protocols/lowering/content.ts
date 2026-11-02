import type { ContentPart, MessageRole } from "../../schema/index.js"

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

/**
 * Which part kinds a protocol accepts, per role. Declare with `as const satisfies ContentPolicy`
 * so `accepts` can narrow the part type at the call site.
 */
export interface ContentPolicy {
  readonly system: ReadonlyArray<PartKind>
  readonly user: ReadonlyArray<PartKind>
  readonly assistant: ReadonlyArray<PartKind>
  readonly tool: ReadonlyArray<PartKind>
}

export const accepts = <const Policy extends ContentPolicy, const Role extends MessageRole>(
  policy: Policy,
  role: Role,
  part: ContentPart,
): part is Extract<ContentPart, { readonly type: Policy[Role][number] }> => policy[role].includes(part.type)

/**
 * Accepted kinds in canonical order, so the diagnostic message does not depend on
 * declaration order. Single-kind roles are returned as declared.
 */
export const kindsOf = (policy: ContentPolicy, role: MessageRole): ReadonlyArray<PartKind> => {
  const accepted = policy[role]
  if (accepted.length <= 1) return accepted
  return PartKinds.filter((kind) => accepted.includes(kind))
}
