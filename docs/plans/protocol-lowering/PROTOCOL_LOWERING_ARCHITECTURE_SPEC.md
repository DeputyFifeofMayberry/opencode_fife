# Protocol Lowering Architecture Specification

**Status:** approved design, not yet implemented
**Date:** 2026-11-02
**Implements decision:** `PROTOCOL_LOWERING_ARCHITECTURE_EVALUATION.md` §10
**Scope:** `packages/ai/src/protocols/lowering/` (new) plus one-line adoptions in eight protocol files

---

## 1. Purpose and scope

### 1.1 What this infrastructure is for

Request lowering has one recurring failure mode: **a fact about content that every protocol must honour is written down as a string literal inside each protocol, so forgetting one is silent.** The kit makes two of those facts explicit and checkable:

1. **Which part kinds each role accepts** — today encoded only as `["text","media"]` arguments scattered across 30 call sites. After: one explicit manifest per protocol, enforced by the same guard the loop already calls, plus a conformance test that proves the declaration against behaviour.
2. **How a tool result becomes provider-addressable material** — today five near-identical splits of `result.content` into text items and files. After: one function plus an explicit per-protocol file policy.

It also consolidates two policies that already drifted: **tool-call id normalisation** (four implementations) and **presence decisions for `parallel_tool_calls` / tool history** (one rule enforced in one of six protocols).

### 1.2 What it deliberately does not do

- It does not walk messages. Each protocol keeps its `body.from` loop and its merge/ordering rules.
- It does not define an intermediate representation. `LLMRequest` remains the only model.
- It does not build wire blocks. Every emitted shape stays in the protocol.
- It does not change streaming, transport, auth, or response parsing.
- It does not normalise provider capability differences. Protocols that reject assistant media still reject it; the manifest just says so out loud.

### 1.3 Why the boundary sits here

The evaluation's §4.3 establishes that message assembly is not shareable: Bedrock budgets cache points across turns, Gemini's merge depends on accumulated output, and Google Interactions has no message envelope. The parts that *are* shareable are pure decisions over request data with protocol-supplied parameters. The kit contains only those.

---

## 2. Architecture

```
packages/ai/src/protocols/
  shared.ts                     unchanged: existing part-level helpers (ProviderShared)
  lowering/                     NEW
    index.ts                    namespace aggregator
    content.ts                  PartKind, ContentPolicy, accept()
    tool-result.ts              ToolResultPlan, plan()
    tool-id.ts                  ToolIDPolicy, forModel(), apply()
    fields.ts                   hasToolHistory(), parallelToolCalls()
  openai-chat.ts                loop unchanged; guard + id + result calls swapped
  anthropic-messages.ts         same
  open-responses.ts             same
  bedrock-converse.ts           same
  gemini.ts                     same
  mistral-chat.ts               same
  google-interactions.ts        same
  cohere-chat.ts                same
  openai-responses.ts           unchanged (delegates to open-responses)
```

`lowering/index.ts`:

```ts
export * as Content from "./content.js"
export * as ToolResult from "./tool-result.js"
export * as ToolID from "./tool-id.js"
export * as Fields from "./fields.js"
```

Call sites read `accepts(policy, role, part)` as the guard and `kindsOf(policy, role)` in the diagnostic, mirroring the existing `ProviderShared.unsupportedContent` signature.

**No package export is added.** `packages/ai/package.json` lists explicit subpaths, so an internal folder is invisible to consumers. `protocols/index.ts` is not modified.

---

## 3. Components

### 3.1 `lowering/content.ts` — part capability manifest

**Responsibility.** Declare, per protocol and per role, which of the seven part kinds are accepted; enforce that declaration at the point where the protocol already guards; derive the diagnostic message from it.

**Why it is not just a rename of the literal.** Two mechanisms make the declaration enforceable. First, `lowering/content.ts` holds a canonical `PartKinds` list with a type-level completeness assertion, so a new `ContentPart` member that is not listed fails to compile in one place. Second, the conformance test drives every listed kind through every role of every protocol, so a protocol that neither accepts nor rejects a kind fails a test — including the case the compiler cannot see, where a protocol *declares* support but its mapper does not implement it. The current string literals provide neither mechanism: they cannot be enumerated, and nothing checks them against the schema.

**Inputs.** A policy constant (module scope), a role, a `ContentPart`.
**Outputs.** `void` on acceptance, or `AIError` carrying `InvalidRequestError` with the existing message format.
**Dependencies.** `schema/index.js` (types), `shared.ts` (`unsupportedContent`, `formatContentTypes` via the existing error constructor).
**Invariants.** Pure; no allocation beyond the error path; no mutation; canonical kind order for diagnostics (see §8.2).

### 3.2 `lowering/tool-result.ts` — tool-result material

**Responsibility.** Turn the four `ToolResultPart.result` shapes into the two things every protocol needs: text segments and media parts. Decide whether files are permitted at all.

**Inputs.** Route name, `ToolResultPart`, `ToolResultFilePolicy`.
**Outputs.** `{ type: "text", text }` or `{ type: "content", texts, files }`, or a typed failure when the policy is `reject` and files are present.
**Dependencies.** `shared.ts` (`toolResultText`, `toolFileMedia`).
**Invariants.** `toolFileMedia` is the only conversion path for files; no protocol re-derives a `MediaPart` from a `Tool.FileContent`; joining text segments and placing files remain the caller's choice (`"\n"` vs array; hoist vs inline).

**Policy is acceptance only — placement stays in the protocol.** Bedrock hoists files for some model families and inlines them for others (`L442-456`); Gemini nests them for 3+ and defers them for 2.5 (`L415-418`). Those are assembly rules over the returned `files`, not a kit decision.

**Ordering limitation, found in implementation.** `plan` returns texts and files as separate lists, so it cannot serve a protocol that emits per-item blocks in their original interleaved order (Anthropic, open-responses, Bedrock, Gemini, Mistral). It is adopted only by `openai-chat`, which already joins texts into one message and hoists files. The other protocols keep their per-item loops; this is a deliberate scope boundary, not an oversight.

| Protocol | Policy | Today's behaviour |
| --- | --- | --- |
| `openai-chat` | `allow` | files detached by the protocol to a following user message (`L610-616`) |
| `mistral-chat` | `allow` | files inline in the tool message (`L306-312`) |
| `anthropic-messages` | `allow` | files as result content blocks (`L816-819`) |
| `open-responses` | `allow` | files inside `function_call_output` (`L620-627`) |
| `bedrock-converse` | `allow` | inline for claude/nova, hoisted otherwise — protocol rule |
| `gemini` | `allow` | nested for 3+, deferred turn for 2.5 / `fileData` — protocol rule |
| `cohere-chat` | `reject` | throws on files (`L169-170`) |
| `google-interactions` | `allow` | own `lowerToolResult`; adopts `plan()` for the text/files split only |

### 3.3 `lowering/tool-id.ts` — tool-call identifier policy

**Responsibility.** One place where "make this id legal for this provider" lives, applied symmetrically to calls and results so pairing cannot diverge.

**Inputs.** `LLMRequest` (for model-family selection) or an explicit policy; an id.
**Outputs.** The provider-legal id.
**Dependencies.** `utils/mistral-tool-id.ts` (existing semantics, moved behind the policy type).
**Invariants.** One policy instance is used for both `tool-call` and `tool-result` in a request; two parts with the same input id produce the same output id; policies are pure except `collisions`, which is request-scoped by construction (`MistralToolID.normalizer(request)`).

**Policies to lift, unchanged in behaviour:**

| Policy | Source | Rule |
| --- | --- | --- |
| `identity` | open-responses, cohere | passthrough |
| `truncate(40)` | openai-chat (`openai`/`azure`/`openai/` models) | first 40 chars |
| `scrub(/[^A-Za-z0-9_-]/g, "_")` | anthropic `scrubToolCallID`; claude models in openai-chat | replace illegal chars |
| `padded(9)` | openai-chat, Mistral-family models | strip non-alnum, slice to 9, right-pad `0` — **can collide** |
| `collisions(request)` | `MistralToolID.normalizer` (mistral-chat, Bedrock `mistral.*`) | hash plus probe against reserved ids — collision-safe |
| `forModel({ provider, modelID })` | openai-chat | selects among the four stateless policies above |

### 3.4 `lowering/fields.ts` — shared presence decisions

**Responsibility.** The two decisions that already exist in more than one protocol and must agree: whether the request has tool history, and whether `parallel_tool_calls` may be sent.

**Inputs.** `LLMRequest`.
**Outputs.** `boolean` / `boolean | undefined`.
**Dependencies.** none beyond schema types.
**Invariants.** No wire shape; no defaults invented. `resolveParallelToolCalls` keeps its existing behaviour and remains re-exported from `open-responses.ts` so no public export disappears.

**Explicitly deferred (not in this component):** aligning `tools: []` with protocols that send `undefined`. That is a behaviour decision for providers whose wire may require the key; it is isolated in §9.6 of the implementation plan and needs separate approval.

---

## 4. Data flow

```
LLMRequest
   │
   ├─ protocol-specific: schema decode of providerOptions
   │
   ├─ ContentPolicy (module constant)  ──►  Content.accepts(policy, role, part)
   │                                            │
   │                                            ├─ supported  → protocol maps the part
   │                                            └─ unsupported → AIError(InvalidRequest)
   │
   ├─ ToolID.forModel(request)  ──►  ToolID.apply(policy, part)
   │
   ├─ ToolResult.plan(route, part, filePolicy)  ──►  texts / files / typed failure
   │
   ├─ Fields.parallelToolCalls(request)  ──►  boolean | undefined
   │
   └─ protocol-specific: loop, merge, hoist, cache points, wire blocks
            │
            └─ body: ProviderBody  ──►  route.body.schema.encode  ──►  transport
```

Shared behaviour ends at the four calls. Everything to the right of the last arrow remains protocol-owned.

---

## 5. TypeScript contracts

```ts
// lowering/content.ts
import type { ContentPart, MessageRole } from "../../schema/index.js"

export type PartKind = ContentPart["type"]

/** Canonical order for diagnostics and conformance. The assertion below keeps it complete. */
export const PartKinds = ["text", "media", "tool-call", "tool-result", "reasoning", "compaction", "effort"] as const

type Unlisted = Exclude<PartKind, (typeof PartKinds)[number]>
type _AllKindsListed = [Unlisted] extends [never] ? true : ["part kind missing from PartKinds", Unlisted]

export interface ContentPolicy {
  readonly system: ReadonlyArray<PartKind>
  readonly user: ReadonlyArray<PartKind>
  readonly assistant: ReadonlyArray<PartKind>
  readonly tool: ReadonlyArray<PartKind>
}

export const accepts: <const Policy extends ContentPolicy, const Role extends MessageRole>(
  policy: Policy,
  role: Role,
  part: ContentPart,
) => part is Extract<ContentPart, { readonly type: Policy[Role][number] }>

/** The accepted kinds for a role, in canonical order — used for the diagnostic message. */
export const kindsOf: (policy: ContentPolicy, role: MessageRole) => ReadonlyArray<PartKind>
```

There are exactly two primitives, and both are used by the protocol at the point it already branches. `accepts` is a **type predicate**: policies are declared `as const satisfies ContentPolicy`, so after `if (!accepts(policy, "user", part)) return …` TypeScript narrows `part` to the declared kinds and the existing `part.type` branches keep compiling. `kindsOf` returns the accepted kinds in canonical order for the diagnostic.

No `assert` helper exists. An implementation experiment showed why: an Effect-returning guard loses the type predicate, so every downstream `part.result` / `part.media` access breaks, and passing the route through a policy labels adapter-derived protocols (`open-responses`) with the wrong name. The guard stays a predicate; the route stays a call-site argument.

*Verified in code:* the const-generic predicate with `as const satisfies` typechecks across all six adopted protocols, and narrowing is proven by a unit test that fails to compile without it.

Declarations stay readable — one array per role — and `kindsOf` sorts them into canonical order so the diagnostic does not depend on declaration order. The completeness assertion is the only machinery; there is no mapped record to fill in per protocol.

```ts
// lowering/tool-result.ts
export type ToolResultFilePolicy = "allow" | "reject"

export type ToolResultPlan =
  | { readonly type: "text"; readonly text: string }
  | {
      readonly type: "content"
      readonly texts: ReadonlyArray<string>
      readonly files: ReadonlyArray<MediaPart>
    }

export const plan: (
  route: string,
  part: ToolResultPart,
  policy: ToolResultFilePolicy,
) => Effect.Effect<ToolResultPlan, AIError>
```

```ts
// lowering/tool-id.ts
export type ToolIDPolicy = (id: string) => string

export const identity: ToolIDPolicy
export const truncate: (max: number) => ToolIDPolicy
export const scrub: (pattern: RegExp, replacement: string) => ToolIDPolicy
export const padded: (length: number) => ToolIDPolicy
export const collisions: (request: LLMRequest) => ToolIDPolicy
export const forModel: (input: { readonly provider: string; readonly modelID: string }) => ToolIDPolicy
```

A policy is the function itself; there is no `apply` wrapper.

```ts
// lowering/fields.ts
export const hasToolHistory: (request: LLMRequest) => boolean
export const parallelToolCalls: (request: LLMRequest) => boolean | undefined
```

Every contract above is plain TypeScript over existing schema types. No generics beyond a mapped type, no conditional types, no code generation.

---

## 6. Ownership boundaries

| Change | Where it goes |
| --- | --- |
| New part kind | `schema/messages.ts` union → the `PartKinds` tripwire fails → conformance fails per protocol → per-protocol decision in that protocol's `content` policy → canonical order |
| New capability for one protocol | that protocol's `policy(...)` array; if the wire block changes, that protocol's loop |
| New protocol | compose an existing base (`Route.make`), or copy the closest base and write its `policy(...)` |
| New provider option | that protocol's `providerOptions` schema; shared only if it maps to an existing `Fields` decision |
| New shared decision | new module under `lowering/`, pure, with unit tests |
| New wire shape | the protocol file, never the kit |
| Behaviour question about a provider | a characterization test in `packages/ai/test/provider/`, then decide |

The rule that keeps the kit small: **anything that needs to know about position in a wire grammar belongs to a protocol.**

---

## 7. Extension mechanisms

1. **Add a part kind.** The union changes; `PartKinds` fails its completeness assertion until the new kind is listed. The conformance test then exercises it in every role of every protocol and fails wherever the outcome is neither acceptance nor a typed rejection. Every protocol that should support it gets a one-line policy change plus its mapper; every protocol that should not gets a conformance row asserting the failure.
2. **Add a protocol for a new wire format.** Write `body.from` with its own loop and a `policy(...)`. Adopt `ToolResult.plan` if the result split applies.
3. **Add a protocol for an existing wire family.** Compose the base, as the fifteen existing variants do (`providers/openai.ts:30` style). No kit change.
4. **Add a media rule.** If it is a mime policy, it belongs to the protocol (it is a provider fact). If it is a location ladder, it already lives in `ProviderShared`.
5. **Add an id rule.** Extend `ToolIDPolicy` with a named policy and use it from `forModel`; do not inline a new switch in a protocol.

---

## 8. Compatibility requirements

### 8.1 Hard constraints

- `ProtocolBody`, `Protocol`, `Route`, `LLMRequest`, and every wire body type are unchanged.
- Every emitted request body is byte-identical to today for all covered cases. The 2,046-test suite, whose provider files assert complete wire bodies, is the proof.
- No public export is removed. `ProviderShared` and `open-responses`'s `resolveParallelToolCalls` remain.
- `packages/ai` gains no dependency; the kit imports only `schema` and existing local modules.
- Promise and Effect `ai` remain identical (`test/promise-parity.types.ts`).

### 8.2 One documented diagnostic change

`unsupportedContent` builds its message from the accepted-kind list. Today each protocol passes a hand-ordered array; after the change the order is canonical (`text`, `media`, `tool-call`, `tool-result`, `reasoning`, `compaction`, `effort`). For `openai-chat`'s assistant guard this changes `"text, reasoning, and tool-call"` to `"text, tool-call, and reasoning"`.

This affects diagnostic text only — never a wire body — and is accepted deliberately to keep one source of truth. The plan requires grepping for the old phrasing and updating any test that pins it.

### 8.3 Error taxonomy preserved

`unsupportedContent` and `invalidRequest` continue to produce `AIError` with `InvalidRequestError`. Consumers branching on `reason._tag` are unaffected: the tag is `InvalidRequest` (the class is `InvalidRequestError` — the names differ, and tests must assert the tag).

### 8.4 Upstream

The kit is a new directory plus guard-line changes. `shared.ts` is not modified. Protocol files change only where they call the guard, the id transform, and the result split — the smallest possible conflict surface for a directory that upstream changes weekly.

---

## 9. Testing design

| Layer | What it proves | Location |
| --- | --- | --- |
| Unit: content | `accepts` is exact per role and narrows the part type; `kindsOf` returns canonical order; the canonical list is complete | `packages/ai/test/lowering/content.test.ts` |
| Unit: tool-result | four `result` shapes × three file policies; text joining stays with the caller; `reject` fails typed | `packages/ai/test/lowering/tool-result.test.ts` |
| Unit: tool-id | each policy's rule; symmetry of call/result application; `forModel` family selection | `packages/ai/test/lowering/tool-id.test.ts` |
| Unit: fields | tool history detection; `parallel_tool_calls` gating | `packages/ai/test/lowering/fields.test.ts` |
| Conformance | for each protocol: every kind in `PartKinds` is either accepted by the guard or rejected with `InvalidRequestError`; declared-supported kinds lower without failure | `packages/ai/test/provider/lowering-conformance.test.ts` |
| Regression | exact wire bodies unchanged | existing `packages/ai/test/provider/*.test.ts` |
| Characterization | current behaviour for the four uncertain cases in the evaluation's §3.2 E | `packages/ai/test/provider/lowering-ordering.test.ts` |

**Conformance is the new capability.** It is the first test in the repository that asserts a *property across protocols* rather than a body snapshot, and it is what turns "capability lives in eight files" into "capability is data".

**Recorded cassettes are not changed.** They replay provider bytes; the kit does not touch decode paths.

---

## 10. Architectural invariants

1. Shared lowering performs no I/O and holds no state across requests.
2. No module mutates `LLMRequest` or any part; derived values are new objects.
3. The runtime guard reads the manifest. A manifest that lies changes behaviour and fails the exact-body suite.
4. No protocol re-implements a tool-result text/file split or a tool-id rule.
5. The kit contains no provider name other than as data in a policy constant; no `if (protocol === …)` anywhere.
6. A part kind is never dropped because it was unconsidered. Conditional drops (unsigned reasoning, empty assistant messages, hosted-tool replays) remain protocol rules and are covered by that protocol's tests.
7. Adding a part kind to the schema breaks the canonical list's completeness assertion and, if unhandled, fails conformance for every protocol — never a silent runtime drop.
8. Wire shapes are produced only by protocols.

---

## 11. Maintenance guidance

**Warning signs the kit is growing into an engine:**

- A `lowering/` module imports a concrete protocol.
- A policy gains a callback that receives accumulated output (that is assembly).
- `ContentPolicy` gains a third state beyond supported/unsupported (that is per-condition logic, which belongs in the protocol).
- A protocol needs to pass a mutable buffer into the kit.
- Two protocols ask the kit to emit arrays they then post-process positionally.

If any appear, the change belongs in the protocol file. The evaluation's §7 (Scenario 5 and 8) records why: the kit's value is that it stays a set of pure decisions.

**Reading order for a new maintainer.** `lowering/index.ts` → `content.ts` → one protocol's `policy(...)` → that protocol's loop. If understanding a wire body requires opening more than the protocol file plus `shared.ts`, the boundary has been crossed.

**Documentation obligation.** `packages/ai/AGENTS.md` gains one paragraph: protocol lowering keeps its loop; shared lowering is limited to pure decisions under `protocols/lowering/`; cross-family reuse is by composition.
