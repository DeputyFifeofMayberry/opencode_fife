# Protocol Lowering Architecture Evaluation

**Status:** investigation complete; decision recorded
**Date:** 2026-11-02
**Scope:** request lowering in `packages/ai/src/protocols` — the path from a canonical `LLMRequest` to a provider wire body
**Outcome:** §10. No production code was changed by this investigation.

---

## 0. Evidence base and method

| Evidence | What was used | Confidence |
| --- | --- | --- |
| Source inspection | All 72 files in `packages/ai/src/protocols` (18,264 lines); the nine in-scope protocols read in full; `schema/messages.ts`; `route/protocol.ts`; `protocols/shared.ts` | High — read directly |
| Measurement | Physical line counts, lowering-region spans, cross-protocol import graph (see §2.6, §3.4) | High — reproducible commands in §12 |
| Git history | 40 most recent commits touching the directory; targeted diffs for multi-protocol commits | High for what it shows; intent inferred from messages only |
| Test inventory | 156 files, **2,046 tests** (measured 2026-11-02: 2,018 pass, 28 skip, 0 fail), including 59 recorded-cassette suites | High — measured baseline |
| Runtime measurement | None | Absent by design — §9.4 |
| Originating review | Not available (§0.1) | — |

Nothing here is a claim about runtime performance. Where a statement is inference rather than observation it says so.

### 0.1 The originating review is not in the repository

No architecture-review document dated 2026-11-01 exists in the working tree or in history. It is *referenced* in four places:

- `docs/plans/effort-evidence-owner-plan.md:7` — "the status/transition duplication and the `packages/ai` candidates from the architecture review are out of scope"
- `docs/plans/effort-evidence-owner-plan.md:167-168` — "Protocol lowering, provider facades, media routes."
- `docs/plans/effort-evidence-owner/implementation-plan.final.md:15`
- `docs/plans/effort-evidence-owner/plan-change-log.md:49`

Three nouns survive; no findings list, severity, or proposed design does. **The review's hypothesis could therefore only be tested against code.** Everything in §3 is derived independently.

### 0.2 Not done

During the investigation: no production file edited, no dependency added, no prototype written, no git state changed (upstream divergence is read from the local tracking ref, without a fetch).

After the investigation, at implementation start (2026-11-02), the baseline was executed rather than assumed: 2,046 tests, 2,018 pass, 28 skip, 0 fail. Reaching green required one test-only repair — `openai-chat.test.ts` had lost its `LLM` import in the earlier `ai.request` refactor, failing 5 cases with `ReferenceError: LLM is not defined`. That repair is commit `68b4c70cb5` on branch `lowering-kit`; no production code was involved.

---

## 1. Executive assessment

**The concern is real. The review named the wrong layer, and overstated the count.**

Request lowering does suffer measurable change amplification: one semantic rule is re-encoded per protocol, and history shows the same rule fixed twice and later reversed twice (§3.5). That is a maintenance cost with a concrete signature.

But the repeated work is not the message loop. It is:

1. **Part-level interpretation** — what a part *means*. Already centralised in `protocols/shared.ts` (`toolResultText`, `mediaReference`, `wrappedSystemUpdate`, `supportsContent`, …). This is why it never appeared in a duplication count.
2. **Provider policy represented as scattered literals** — tool-id normalisation (4 policies), mime acceptance (5 different ladders), `tools: []` vs `undefined`, `parallel_tool_calls` guarding, reasoning-demotion rules. One concept, N encodings, with drift.
3. **Cross-message assembly** — merging, hoisting, ordering. Not shared, and on inspection largely *not shareable*: seven distinct shapes encoding real wire constraints (§4.3).

Three findings decide the outcome:

- The eight message loops are **not** nine independent traversals of one structure, and `openai-responses.ts` has no traversal at all — it delegates to `open-responses.ts` through a three-member adapter. **The "shared traversal + adapter" pattern already exists here and works.**
- Fifteen protocol files already compose one of the eight bases; nine of them are under 120 lines. **Protocol reuse is the established extension mechanism**, and it operates at the *wire-family* level, not across families.
- The loop region is **1,099 lines** across 8,881 (§3.4) — 12% of the in-scope code. A universal engine could replace at most that, and only by turning each protocol's merge rules into callbacks.

**Selected: a narrow lowering kit — part-capability manifests, tool-result lowering, tool-id policy, and shared field decisions — with each protocol keeping its own loop.** Candidate B, strengthened by one idea from Candidate C (compile-time exhaustiveness), and deliberately smaller than what the review proposed.

The decisive property is not line-count reduction. It is that **adding a part kind today fails silently; after this change it fails a conformance test that enumerates every part kind against every protocol**, backed by one compile-time tripwire on the canonical kind list.

---

## 2. Current-state architecture

### 2.1 The one seam

Every protocol is a `Protocol<Body, Frame, Event, State>` (`packages/ai/src/route/protocol.ts:37-68`). Lowering is exactly one member:

```ts
export interface ProtocolBody<Body> {
  readonly schema: Schema.Codec<Body, unknown>        // validates + encodes the wire body
  readonly from: (request: LLMRequest) => Effect.Effect<Body, AIError>
}
```

`route/client.ts:631` calls it once per request: `const body = yield* route.body.from(resolved)`.

No central registry exists. `ProtocolID` is `Schema.String` (`schema/ids.ts:4`); provider facades bind routes explicitly, e.g. `providers/openai.ts:30` — `export const routes = [OpenAIResponses.route, OpenAIChat.route]`.

### 2.2 Data flow

```
caller (core / sdk)
  └─ ai.stream / ai.generate
      └─ route/client.ts
          ├─ resolve auth, model, endpoint, transport
          ├─ route.body.from(request)          ← THE LOWERING SEAM (per protocol)
          │     ├─ ProviderShared.* helpers     ← part-level, already shared
          │     ├─ per-protocol message loop    ← not shared
          │     └─ per-protocol encoder         ← not shared
          ├─ route.body.schema.encode           ← wire JSON
          └─ transport (http / websocket)
                └─ protocol.stream.step         ← response side, out of scope
```

Lowering is stateless and single-pass. No protocol mutates the input `LLMRequest`; the two that need a transformed view (`flattenToolRequest`, Bedrock's `removeEmptyToolInputKeys`) build new objects.

### 2.3 The canonical model

Single source of truth: `schema/messages.ts` (377 lines), Effect Schema. `packages/ai/AGENTS.md`: "The Schema classes in `src/schema/` are the data model. Do not add a parallel shape or a second construction path."

```ts
export interface LLMRequest<Model extends LanguageModel = LanguageModel> {
  readonly id?: string
  readonly model: Model
  readonly system: ReadonlyArray<SystemPart>
  readonly messages: ReadonlyArray<Message>
  readonly tools: ReadonlyArray<ToolEntry>
  readonly toolChoice?: ToolChoice
  readonly generation?: GenerationOptions
  readonly providerOptions?: LanguageModelProviderOptions<Model>
  readonly http?: HttpOptions
  readonly cache?: CachePolicy
  readonly promptCacheKey?: string
  readonly metadata?: Record<string, unknown>
  readonly includeRaw?: boolean
}
```

Four roles (`messages.ts:19`): `system | user | assistant | tool`. Seven part kinds (`messages.ts:232`, tagged union):

| Part | Fields that matter to lowering |
| --- | --- |
| `text` | `text`, `cache?` |
| `media` | `media: Media.Asset` (bytes / base64 / url / provider ref), `filename?` |
| `tool-call` | `id`, `name`, `namespace?`, `input: unknown`, `providerExecuted?` |
| `tool-result` | `id`, `name`, `namespace?`, `result: json \| text \| error \| content[]` |
| `reasoning` | `text`, `encrypted?` |
| `compaction` | `provider`, `id?`, `encrypted?`, `text?` |
| `effort` | `effort?`, `previous?` |

Plus `Message.native`, `providerMetadata`, and `ToolEntry = ToolDefinition | ToolNamespace`.

The input space is small: 7 part kinds × 4 roles, plus options. The difficulty in this subsystem is not the size of the input — it is the number of provider rules per input, and the fact that those rules live in prose comments and literals rather than in a checkable declaration.

### 2.4 What is already shared

`protocols/shared.ts` (457 lines) is the existing common layer, re-exported as `ProviderShared`, imported by at least 30 protocol files:

| Group | Symbols | Responsibility |
| --- | --- | --- |
| Schema/build | `JsonObject`, `optionalArray`, `optionalNull`, `optionalNullish`, `lenient`, `knownString` | Tolerating wire variance during decode |
| Billing/usage | `ReportedBilling`, `reportedBilling`, `totalTokens`, `subtractTokens`, `sumTokens`, `fitThinkingBudget` | Inclusive vs exclusive token accounting |
| Errors | `eventError`, `invalidRequest`, `unsupportedOperation`, `errorText`, `validateWith` | One error vocabulary |
| System updates | `joinText`, `wrapSystemUpdate`, `systemUpdateText`, `wrappedSystemUpdate` | Lowering chronological `Message.system` |
| Content interpretation | `supportsContent`, `unsupportedContent`, `toolResultText`, `toolFileMedia`, `mediaUrl`, `mediaReference`, `requireInlineMedia`, `inlineRequired` | Deciding what a part is and how a provider can address it |
| Tools | `flattenTools`, `flattenToolRequest`, `matchToolChoice`, `parseToolInput` | Namespace flattening, choice mapping, streamed input |
| Transport | `jsonPost`, `promptCacheKey`, `sendsPromptCacheKey`, `OPENAI_PROMPT_CACHE_KEY_MAX_LENGTH` | Request construction, cache-key policy |

Two facts constrain every candidate:

- **Part-level responsibility is already centralised.** No protocol re-implements tool-result→text, asset→addressable-string, or system→user-text.
- **Assembly is not shared at all.** `shared.ts` contains no function that iterates `request.messages`. Not one.

The duplication therefore sits exactly where `shared.ts` deliberately stops — and §4.3 explains why most of that region resists sharing.

### 2.5 Package position

`packages/ai` depends only on `@opencode/schema` and `@opencode/util`. `packages/core` depends on `@opencode/ai`. No reverse import exists. `packages/ai/AGENTS.md` requires: canonical model only; reuse protocols rather than cloning them; identical `ai` behaviour on Promise and Effect (`test/promise-parity.types.ts`). Everything proposed here lives inside `packages/ai` and consumes `LLMRequest`, so no documented dependency-direction rule is engaged.

### 2.6 Reuse already exists — at the wire-family level

Fifteen protocol files import one of the eight bases:

| Base | Composing files |
| --- | --- |
| `openai-chat.ts` | `alibaba-chat.ts` (94), `venice-chat.ts` (349), `zai-chat.ts` (70), `openai-compatible-chat.ts` (22) |
| `open-responses.ts` | `openai-responses.ts` (386), `xai-responses.ts` (111), `meta-responses.ts` (231), `alibaba-responses.ts` (96), `open-responses-channel.ts` (219), `open-responses-continuation.ts` (208), `openai-decisions.ts` (150), `openai-compatible-responses.ts` (21) |
| `anthropic-messages.ts` | `meta-messages.ts` (67), `zai-messages.ts` (34), `alibaba-messages.ts` (49) |
| `open-responses.ts` (helper only) | `openai-chat.ts` imports `resolveParallelToolCalls` |

`openai-responses.ts` is the proof case: 386 lines, **no message traversal**, delegating conversation lowering to `OpenResponses.lowerConversation(request, adapter)` where `ProviderAdapter` has three members (`id`, `name`, `restoreHostedToolItem`) plus an optional `lowerMedia` hook.

**Observation, not inference:** the successful reuse in this codebase is *intra-family composition with a narrow adapter*. There is no cross-family traversal anywhere, and none has been attempted.

---

## 3. Validated problem definition

### 3.1 Did nine independent traversals exist?

**Partly. The count and the equivalence claim are both wrong.**

| File | Lines | Message loop | Assembly shape |
| --- | ---: | --- | --- |
| `openai-chat.ts` | 1,507 | yes (L641) | system merged into user; tool-result files deferred to a following user turn; `bridgeTools` for Mistral |
| `anthropic-messages.ts` | 1,702 | yes (L903) | held system-update queue, native-vs-wrapped gate, tool_result block concat |
| `open-responses.ts` | 1,562 | yes (L644) | per-role item emission, text grouped by item id + phase, no message coalescing |
| `openai-responses.ts` | 386 | **none** | delegates to `open-responses` via adapter |
| `bedrock-converse.ts` | 992 | yes (L354) | system/user/tool merge into one user content array; deferred image flush; assistant never merges |
| `mistral-chat.ts` | 772 | yes (L325) | no merging; trailing assistant gets `prefix: true` |
| `gemini.ts` | 973 | yes (L312) | system merged into previous user turn unless it holds `functionResponse`; deferred media flush |
| `google-interactions.ts` | 630 | yes (L254) | step stream; `thought`/`function_call`/`function_result` are message siblings |
| `cohere-chat.ts` | 357 | yes (L146, inline) | no merging; tool list filtered to the selected tool |

**Eight implementations contain a loop; seven assembly shapes plus one delegation.** "Nine independent traversals" is an overcount, and "of the same structure" is false for at least two of them.

### 3.2 Duplication taxonomy

**A — identical behaviour (shareable as-is)**

| Behaviour | Occurrences |
| --- | --- |
| user part ladder (`text` → text, `media` → `lowerMedia`, else `unsupportedContent(route, "user", ["text","media"])`) | `openai-chat:508-518`, `mistral-chat:231-241`, `anthropic-messages:934-945`, `open-responses:671-675`, `bedrock-converse:383-392`, `gemini:335-341` |
| tool-message guard + `toolResultText` | `openai-chat:597`, `mistral-chat:294`, `anthropic-messages:1003`, `open-responses:794`, `bedrock-converse:439`, `gemini:409` |
| tool-result content item split (text vs `toolFileMedia`) | `anthropic-messages:816-819` and `open-responses:620-627` are byte-parallel modulo type names; `openai-chat:610-616` and `mistral-chat:306-312` differ only in accumulation target |
| `wrappedSystemUpdate` → user message | `mistral-chat:340-346` and `cohere-chat:161-164` identical; `openai-chat`, `gemini`, `bedrock`, `interactions` merge into a preceding turn instead |
| media location ladder (`mediaUrl(asset) ?? requireInlineMedia(route, asset).dataUrl`) | `openai-chat`, `mistral-chat`, `cohere-chat`, `open-responses`, `anthropic-messages` |

**B — conceptually shared, requires parameters (the real target)**

| Concept | Current encodings | Drift observed |
| --- | --- | --- |
| Tool-call id normalisation | openai-chat per-family switch (L673-683: Mistral 9-char pad, claude `_` scrub, OpenAI 40-char slice, identity); `scrubToolCallID` (anthropic L592); `MistralToolID.normalizer` (mistral L326); raw passthrough (open-responses, cohere) | Four policies for one responsibility; one lives in `utils/`, one inline, one imported across protocol files |
| Tool-result file policy | hoist to following user turn (openai-chat), inline as blocks (anthropic, open-responses, bedrock), inline in tool message (mistral), reject (cohere) | Policy is legitimate; the *mechanism* is re-implemented five times |
| `tools` field when history has tool calls but no active tools | `tools: []` (openai-chat L896-902 `hasToolHistory`); `undefined` (anthropic L1072, mistral L396, cohere L223-228, open-responses L877) | One ordering rule enforced in one of six |
| `parallel_tool_calls` guard | exported from `open-responses.ts` (L847), imported by `openai-chat.ts` (L29), re-guarded with `hasActiveTools` (L848); applied unconditionally in `open-responses` | Cross-protocol import in the wrong direction; guard applied in one caller |
| Media mime acceptance | 5 ladders with different accept/reject sets; `cohere-chat:193` tests raw case while all others lowercase first | Case-sensitivity divergence on a schema-permitted input |
| Assistant-authored media | converted to a user message (open-responses L771-779); throws in openai-chat, anthropic, mistral, cohere | Same history replays in 1 of 5 protocols |

**C — necessary protocol-specific behaviour (must not be shared)**

- System placement: field (`anthropic`, `mistral`, `cohere`, `open-responses` `instructions`) vs message (`openai-chat`) vs `developer` message (`open-responses`) vs model-and-placement-gated native message (`anthropic`).
- Merge/ordering: all seven shapes in §3.1. Bedrock's cache-point emission between blocks, its 4-breakpoint budget across tools → system → messages, and its tool-result image hoisting are wire constraints, not style.
- Thinking/reasoning replay: signature requirements differ per model family and per protocol; the demotion rule is model-gated in three different ways.
- `google-interactions` step model: no role envelope; `function_result` as a top-level sibling; signature deltas that retroactively patch an emitted step.
- Wire schema shapes themselves: six tool-definition shapes among six protocols (nested vs flat, `input_schema` vs `parameters`, `strict` conditional/literal/absent, `type` discriminator present or not).

**D — incidental similarity (should stay independent)**

- `for…of` vs `entries()` vs `Effect.forEach`, `splice`-cleared buffers, local array replacement. Style, not responsibility.
- The two-line media location expression. Sharing it would be syntax-level DRY; the caller already composes two shared helpers.
- Wire event schemas.

**E — uncertain (requires a test, not an opinion)**

| Question | Why it matters | Resolution path |
| --- | --- | --- |
| Is a system update between a `tool-call` and its `tool-result` legal on each wire? | Anthropic throws (`splitsLocalToolResults`, L926-927); openai-chat inserts a user message; mistral and cohere insert unconditionally. Four outcomes for one input. | Characterization test per protocol (§ Test matrix, ordering family) |
| Should a zero-part or whitespace-only assistant message be dropped everywhere? | Four different predicates (`openai-chat:735-739`, `anthropic:961/995`, `mistral:353-358`, `open-responses:673`) disagree on reasoning-only and whitespace cases. | Characterization test; decide per protocol, do not normalise |
| Is `cohere`'s case-sensitive mime test a defect? | Same input routes differently than in five other protocols. | One test; fix only if it is a defect |
| Does any provider require `tools: []` when history carries tool calls? | Only openai-chat sends it; the comment at `anthropic:1073` records a related constraint. | Recorded-cassette evidence, not speculation |

### 3.3 What the tests already pin

2,046 tests in 156 files, of which 59 files use recorded cassettes. Baseline measured green on 2026-11-02: 2,018 pass, 28 skip, 0 fail. Non-recorded provider tests assert the **complete outbound body** with `toEqual`, plus exact URL and headers. Recorded suites replay provider bytes and assert SDK-level output only, so a request-side regression is caught by the non-recorded sibling or not at all.

There is **no test that asserts two protocols lower the same semantic intent to their respective shapes**, and no test that asserts a protocol's part-kind coverage. Coverage is implicit in scattered `supportsContent([...])` arrays: `bedrock` 6 call sites, `gemini` 6, `openai-chat` 5, `open-responses` 4, `anthropic` 3, `mistral` 3, `cohere` 2, `interactions` 2.

### 3.4 Measured scale

| Metric | Value |
| --- | ---: |
| Files in `packages/ai/src/protocols` | 72 |
| Lines in that directory | 18,264 |
| Lines in the nine in-scope files | 8,881 (8,060 non-blank) |
| Share of directory | 48.6% |
| Lowering region (`lowerMessages`/`lowerConversation` → `fromRequest`) | **1,099 lines** |
| Largest lowering region | `open-responses` 240 lines (15.4%) |
| `shared.ts` | 457 lines, no message iteration |

The lowering region bounds what any universal traversal could replace: **at most 1,099 lines, 12% of the nine files** — and that bound is not achievable, because the merge logic inside those regions would move into callbacks rather than disappear.

### 3.5 Change amplification, with evidence

91 commits in 30 days touched the directory; 16 of the last 37 committed to 3+ protocol files. Most are mechanical (one `Protocol` interface reshape reached 37 files in `a24a239456` and needed no abstraction — the shared interface already did that job). The genuine amplification is three documented cases:

- **`9007700546`** — cache-TTL enum duplicated verbatim in `anthropic-messages.ts` and `meta-messages.ts`; `venice-chat.ts` needed a third, different implementation of the same option.
- **`822594b9ae`** — "demote unsigned reasoning to text" existed independently in `anthropic-messages.ts` and `bedrock-converse.ts`, each with its own rationale comment; both were removed in one commit. **The same defect was fixed twice, then reversed twice.**
- **`78c31ea68c`** — one "provider image size" concept needed three mechanisms: a string remap in `google-images.ts`, a new injection point (`makeProtocol(sizing)`) in `openai-images.ts`, a third variant in `xai-images.ts`.

Read together: amplification concentrates in **policy literals** (options, ids, media acceptance), not in loop structure. That is the finding the review did not reach, and it is what the selected design targets.

### 3.6 Decision gate A

1. **Is there a real architectural problem?** Yes, but narrower than claimed: policy scatter plus unenforced capability coverage, not loop duplication.
2. **What exactly is it?** (a) Adding a part kind compiles everywhere and drops silently at runtime; (b) tool-id, tool-result-file, and `tools`-field decisions are re-implemented with drift; (c) capability differences are undiscoverable except by reading eight files.
3. **Measurable consequence?** Yes: two identical fixes then two reversals; four id policies; one rule enforced in 1 of 6 protocols; 1,099 lines of loop region that any engine could at best relocate.
4. **What must remain protocol-specific?** System placement, merge/ordering, cache-point budgeting, thinking replay rules, wire schemas, and the interactions step model.
5. **Is a broad refactor justified?** **No.** A targeted kit is. That narrows Part II accordingly.

---

## 4. Duplication and responsibility analysis

### 4.1 Responsibility map

| Responsibility | Owner today | Should be | Evidence |
| --- | --- | --- | --- |
| What a part means | `shared.ts` + each protocol | Shared (already) | §2.4 |
| Which role accepts which parts | each protocol, as literals | **Declared per protocol, verified by conformance** | 30 call sites of `supportsContent` |
| Tool-result payload → text/files | each protocol, 5 shapes | **Shared mechanism, per-protocol file policy** | A-class duplication |
| Tool-call id legality | 4 implementations | **Shared policy module** | §3.2 B |
| Media mime acceptance | 5 ladders | Shared ladder, per-protocol policy table | §3.2 B |
| `tools` / `tool_choice` / `parallel_tool_calls` presence | each protocol | **Shared decision functions** | §3.2 B |
| Message merge / hoist / ordering | each protocol | **Each protocol** | §3.2 C |
| Wire schemas, stream parsing | each protocol | **Each protocol** | out of scope |

### 4.2 Cohesion test applied

The five B-class items share a property: each is a *pure decision over request data* whose inputs are identical across protocols and whose outputs are one of a small set of shapes, with the protocol supplying only parameters. That is a real shared responsibility.

The A-class items are shared *mechanisms* already; only their call sites are duplicated. Extracting the call sites is worthwhile but low-value on its own — which is why the selected design pairs it with enforced capability coverage rather than selling line-count alone.

The C-class items fail the cohesion test decisively: they are decisions about *position in a specific wire grammar*. `google-interactions` cannot express its output as "content inside a message", so no interface over messages can host it without an escape hatch.

### 4.3 Why the loop is the wrong abstraction boundary

Three concrete counterexamples, each verified in source:

1. **Bedrock** emits 0–2 blocks per part: a text block plus an optional sibling `cachePoint`, with a global 4-breakpoint budget spent tools → system → messages (`bedrock-converse:263-280`, `596-614`). A per-part mapper cannot see the budget or the sibling position.
2. **Gemini** merges a system update into the previous user turn *only if* that turn holds no `functionResponse` (`gemini:328-334`). The decision depends on the accumulated output, not on the part.
3. **Google Interactions** has no message envelope: `function_result` is a sibling element with `call_id` (`google-interactions:277-283`), and `thought_signature` deltas retroactively rewrite an already-emitted step (`464-475`).

An interface general enough to express all three becomes "a state machine over an ordered event stream with deferred emission", i.e. the union of the protocols. The complexity moves; it does not leave.

---

## 5. Candidate architectures

### A. Retain independent traversals; fix only proven defects

Keep eight bases and fifteen composers. Fix id/media/ordering defects in place. Add nothing.

- **Data flow:** unchanged.
- **Extension mechanism:** copy a base and adapt (the current de-facto method).
- **Benefit:** zero migration risk, zero upstream conflict, zero new concepts.
- **Cost:** the `822594b9ae` failure mode persists — a new part kind still compiles everywhere and can still vanish at runtime; policy drift continues.

### B. Extract focused shared utilities

Add a small set of modules, each owning one pure decision: part-capability manifest per protocol, tool-result lowering with a file policy, tool-call id policy, and presence decisions for `tools`/`tool_choice`/`parallel_tool_calls`. Loops stay.

- **Data flow:** `body.from` calls `Lowering.*` for decisions, keeps its own loop.
- **Extension mechanism:** add a value to the manifest / policy; compose bases as today.
- **Benefit:** one location per policy; a canonical part-kind list that cannot silently omit a union member; per-protocol conformance tests that fail when a kind is unhandled.
- **Cost:** a manifest is a second description of capability and can drift from the loop — unless the loop's guard *reads* the manifest, which is the mitigation in §9.

### C. Shared traversal with protocol handlers

One engine walks messages and parts; protocols supply handlers (`onUserPart`, `onAssistantPart`, `onToolPart`, `onSystem`, plus hooks for deferral and merging).

- **Data flow:** `body.from` → `Traverse.run(request, handlers)` → wire items.
- **Extension mechanism:** new handler per protocol; new part kind = engine change plus a handler per protocol.
- **Benefit:** one traversal implementation; ordering decided centrally.
- **Cost:** the handler interface must express deferred flushes (openai-chat, gemini, bedrock), held queues (anthropic), per-message grouping (open-responses), and non-message emission (interactions). Every one of those becomes a hook.

### D. Canonical intermediate representation

Normalise `LLMRequest` into a neutral `Turn[]` IR, then map IR → wire.

- **Cost:** `LLMRequest` *is* canonical (`AGENTS.md`: no parallel shape). The IR is a lossy second copy; `providerMetadata`, `native`, `compaction.encrypted`, and per-part `cache` hints either survive verbatim (making the IR a rename) or are lost (breaking replay).

### E. Declarative protocol mapping

Describe each protocol as data: role table, part table, field rules; derive the lowering.

- **Cost:** six tool-definition shapes among six protocols, five media policies, seven assembly shapes. The declaration language would need conditionals, ordering constraints, and budget allocation — it becomes a DSL with an interpreter, tested indirectly through eight protocols.

### F. Hybrid: shared kit + family composition (selected)

Candidate B's modules, plus a written rule that cross-family reuse happens by *composing a base protocol* (as the fifteen variants already do), never by a cross-family engine. Part capabilities are declared per protocol and enforced by the guard and by generated conformance tests.

- **Data flow:** unchanged seam; `body.from` keeps its loop and calls `Lowering.*`.
- **Extension mechanism:** new provider → compose a base (21–96 lines, proven fifteen times); new part kind → tripwire, then a conformance failure per protocol, then a per-protocol decision.
- **Cost:** one new directory, four small modules, eight manifest constants.

---

## 6. Elimination results

| Candidate | Status | Reason |
| --- | --- | --- |
| **C** universal traversal + handlers | **Eliminated** | Cannot express Bedrock cache-point budgeting, Gemini's conditional merge, or the Interactions step model without hooks that reproduce each loop; replaces ≤1,099 lines with an interface that is the union of eight protocols. **Elimination is structural, not aesthetic:** §4.3 shows three of eight protocols cannot be served by a per-part mapper. |
| **D** canonical IR | **Eliminated** | `LLMRequest` is already the canonical model and `AGENTS.md` forbids a parallel shape. The IR either duplicates it (rename, no benefit) or drops `providerMetadata`/`native`/encrypted payloads (breaks replay). |
| **E** declarative mapping | **Eliminated** | Six tool-definition shapes, five media policies, seven assembly shapes. Any declaration general enough is a DSL with an interpreter; debugging moves from "read the function" to "trace the interpreter". Fails §3.4 of the brief (extensibility without an expanding central switch). |
| **A** status quo | **Conditional — not selected** | Fully viable today. Rejected only because it leaves the demonstrated defect class (`822594b9ae`) unfixed: a new part kind compiles silently. If the team values zero churn above that, A is the fallback and this evaluation says so explicitly. |
| **B** focused utilities | **Selected (as F)** | Captures every B-class improvement at one location per policy, adds no traversal abstraction, and its only real risk (manifest drift) is neutralised by making the runtime guard read the manifest. |
| **F** hybrid kit | **Selected** | B plus an explicit boundary rule: cross-family reuse by composition, never by engine. The rule is already the codebase's practice; writing it down is what stops the engine from being reintroduced later. |

No candidate was rejected for suspected problems alone; each elimination cites either source structure (§4.3) or a documented constraint (`AGENTS.md`).

---

## 7. Comparative evaluation

Finalists: **A** (status quo), **B/F** (kit), **C** (engine).

| Dimension | A | B/F | C |
| --- | --- | --- | --- |
| Correctness risk | Lowest (no change) | Low — additive modules, guard reads manifest | **High** — every protocol's assembly moves behind an interface |
| Cohesion | Policy scattered | One module per decision | Traversal cohesive; handlers become a grab-bag |
| Coupling | Low | Low; protocols depend on `Lowering`, nothing depends on protocols | High; all protocols depend on one engine's hook contract |
| Simplicity | Simplest | +4 small modules, +8 manifest constants | One engine + 8 hook sets + deferral protocol |
| Maintainability (common change) | N edits, silent if missed | 1 edit + conformance failures per protocol | 1 engine edit, but N handler updates |
| Extensibility (new part kind) | Silent | **Conformance failure per protocol** + one compile tripwire | Compile-time if the handler type is exhaustive — achievable, at the cost of a handler per protocol |
| Extensibility (new provider) | Copy/adapt base | Compose base (proven ×15) | Implement 5–6 hooks |
| Testability | Per-protocol exact-body tests | + unit tests per decision; + coverage conformance | Engine tests + per-protocol handler tests; failures span two layers |
| Type safety | Weakest (string literals in `supportsContent`) | Strong (typed policies + conformance) | Strong |
| Runtime | Baseline | Negligible: pure functions, same passes, no copying | One extra traversal layer, closures per request |
| Compatibility | — | No public API change; `ProtocolBody` untouched | Same, but higher blast radius |
| Upstream conflict | None | New directory only; `shared.ts` and 8 files barely touched | Eight protocol files rewritten → maximal conflict surface |
| Migration risk | None | Staged per protocol; each stage behaviour-preserving | Big-bang per protocol; exact-body tests break in bulk |
| **Overall** | Safe, leaves defect | **Best balance** | Fails the cohesion test at the hardest cases |

### 7.1 Scenario walk-through (A / B / C)

**1. New part kind** (e.g. `audio`, or a future `citation`).  
*A:* add to `ContentPart`; all 8 protocols still compile; each silently drops it unless someone remembers 8 files.  
*B:* add to `ContentPart`; one canonical list in `lowering/content.ts` fails a type-level completeness assertion, and the conformance test then drives the new kind through all seven roles of all eight protocols, failing on any that neither accepts nor rejects it explicitly. The developer records eight decisions, and the runtime guard reads the manifest so the decision is enforced, not merely documented.  
*C:* engine gains a case; handlers gain a member; same compile-time protection if the hook type is exhaustive — but the developer must also decide ordering/deferral semantics in the engine.

**2. New protocol.** *A/B:* compose a base, 21–96 lines (observed fifteen times). *C:* implement the hook contract; if the provider lacks a message envelope (Interactions), the hooks do not fit.

**3. Change one provider's behaviour.** All three are local. *C* is slightly worse: a behaviour change may need a hook override whose effect is decided inside the engine, so the reader must hold both files.

**4. Fix a common defect** (e.g. id normalisation). *A:* 4 edits, no guarantee of consistency. *B:* 1 edit. *C:* 1 edit, but the engine now owns a rule that is really a policy.

**5. Unusual provider requirement.** *A/B:* write it in that protocol's loop, no blast radius. *C:* extend the hook contract — which is how an engine accumulates provider conditionals.

**6. Debug a production request failure.** *A/B:* the stack ends in the protocol file; the wire body is built in one readable function. *C:* failure may originate in engine state (deferral, ordering) or handler; the exact-body test identifies *what* changed but not *where*.

**7. Sync upstream.** *A:* trivial. *B:* new directory; protocol edits confined to guards (one line each). *C:* eight rewritten files; every upstream change to any protocol conflicts.

**8. Two years out.** *A:* policy literals multiply; the `822594b9ae` class recurs. *B:* policies stay single-sourced; the manifest is the place capability differences are visible. *C:* the hook contract grows a member per provider quirk — the expanding central switch the brief warns against, wearing a different hat.

### 7.2 Challenge to the leader

- **Weakest property of B/F:** the manifest can drift from the loop. **Mitigation:** the loop's guard is `Lowering.assertContent(route, role, manifest, part)`, so a wrong manifest changes runtime behaviour and is caught by the 2,046-test suite — drift is a test failure, not a silent lie.
- **Complexity it adds:** four modules and eight constants that a new maintainer must learn. **Justification:** each module is a pure function over request data with its own unit tests; the alternative (C) adds a protocol.
- **Problem it leaves unresolved:** merge/ordering duplication across seven shapes stays. **Deliberate:** §4.3 shows it is not shareable without an engine.
- **Could something simpler deliver nearly the same?** Candidate A plus *only* the capability manifest and conformance test — yes, and that is the minimum viable slice (plan Tasks 1, 3, 7–10). The tool-result and tool-id modules carry the rest; if those stages are cut, the decision is still sound.
- **Demonstrated or theoretical?** Demonstrated: measured duplication, four id policies, one rule enforced in 1 of 6, two fixes then two reversals. The *benefit* is inferred from those facts, not measured — no candidate was implemented.

---

## 8. Reassessment history

| Stage | Leading candidate | What changed it |
| --- | --- | --- |
| After current-state mapping | C (shared traversal) | Assumed the review's framing: nine similar loops |
| After the three hardest protocols | C → B | Found Interactions has no message envelope; Bedrock budgets cache points across turns; Gemini's merge depends on accumulated output |
| After measurement | B | Lowering region is 1,099 lines; a universal engine could replace ≤12% and would relocate the rest |
| After the composition graph | B/F | Found `openai-responses` delegating through a 3-member adapter and 15 composing variants: the codebase's real reuse pattern is family composition, not cross-family traversal |
| After git history | B/F (strengthened) | Amplification is policy literals (ids, options, media), not loop structure; the fix must target policies and their enforcement |
| After adversarial challenge | B/F (narrowed) | Dropped a proposed media-lowering module as incidental similarity (D); Stage 2 alone is defensible if later stages are cut |

Candidates D and E were eliminated at first pass and not revisited: no new evidence bore on the "parallel model" or "DSL" objections.

---

## 9. Technical feasibility findings

### 9.1 The part-kind tripwire and the conformance test are achievable with plain TypeScript

```ts
export const PartKinds = ["text", "media", "tool-call", "tool-result", "reasoning", "compaction", "effort"] as const
export type PartKind = ContentPart["type"]
type Unlisted = Exclude<PartKind, (typeof PartKinds)[number]>
type _AllKindsListed = [Unlisted] extends [never] ? true : ["part kind missing from PartKinds", Unlisted]
```

Adding a member to the `ContentPart` union makes `Unlisted` non-`never` and the type assertion fails to compile — one tripwire, in one file. The conformance test then iterates `PartKinds` (which the tripwire guarantees is complete) across every role of every protocol, asserting that each kind is either accepted by the guard or rejected by it with a typed error. An unhandled kind fails that test.

This is deliberately stronger than a per-protocol exhaustive record: a record catches an *undecided* protocol, but not one that declares support and forgets to implement it. The conformance test catches both. It also avoids ~28 boilerplate entries per protocol, which would have been the smallest coherent design's largest cost. No generics beyond a conditional type, no code generation, no new dependency.

**Verified in principle, not in code:** the tripwire's failure mode was reasoned from TypeScript's assignability rules, not observed. Stage 1 of the implementation plan includes a step that deliberately adds a part kind on a scratch branch, confirms the type error, and reverts — so the mechanism is proven before anything depends on it.

### 9.2 The guard can be the single source of truth

Today each protocol writes `if (!supportsContent(part, ["text","media"])) return unsupportedContent(...)`. The literals are the only record of capability. After the change the array comes from the manifest, so capability is declared once per protocol and enforced at runtime, and the error text (`formatContentTypes`) stays identical.

### 9.3 Representative difficult cases validate the boundary

- **Bedrock** keeps its loop and its cache-point budget; it only replaces guard literals and the tool-id call. No behaviour change is possible because the emitted blocks are untouched.
- **Google Interactions** keeps its step model; the manifest expresses `assistant: ["text","media","reasoning","tool-call","tool-result"]` and the loop remains responsible for step emission.
- **`openai-responses`** is unaffected except through `open-responses`, which proves the change composes along the existing adapter boundary.

### 9.4 Performance was not measured, and the design does not require it

Every proposed module is a pure function evaluated during a single-pass lowering that already allocates. The manifest is a module constant. No candidate copies the request, adds a traversal, or retains state. A benchmark could only confirm "no change"; the brief asks not to over-optimise hypothetical costs, so no benchmark was run and none is claimed.

### 9.5 Migration is additive

New modules are new files. Each protocol adopts a manifest by replacing guard arguments; the emitted wire body is identical, so exact-body tests pin the result. No stage requires deleting a loop.

---

## 10. Final selection and justification

**Selected: Candidate F — shared lowering kit plus family composition, no traversal engine.**

Contents:

1. `Lowering.Content` — per-protocol part-capability manifest, the canonical kind list with its compile tripwire, and the guard that reads the manifest. Capability is verified by conformance, not merely declared.
2. `Lowering.ToolResult` — tool-result payload lowering (text segments plus media parts) with an explicit per-protocol acceptance policy; placement stays in each protocol.
3. `Lowering.ToolID` — the four id policies behind one interface, applied symmetrically to calls and results.
4. `Lowering.Fields` — presence decisions that must agree across protocols (`tools` with/without active tools, `tool_choice`, `parallel_tool_calls`).
5. A written boundary rule: **cross-family reuse happens by composing a base protocol; a universal traversal is out of scope** (`§4.3` is the technical reason).

**Why it wins.** It targets the only amplification the evidence supports (policy literals) and the only failure mode with a proven cost (silent part-kind drops, fixed twice and reversed twice). It adds no abstraction over message assembly, which is where the eight protocols genuinely differ. Its blast radius on upstream merges is a new directory plus one line per protocol. Its minimum slice (item 1) is independently useful, which means the decision can be partially adopted without being wrong.

**Known compromises.**

- Seven assembly shapes remain duplicated. Accepted: they encode wire constraints.
- One new concept (capability manifest) for maintainers to learn. Offset: it is the artifact that makes capability differences discoverable, which today requires reading eight files.
- The `tools`-field alignment may change behaviour for protocols that currently send `undefined`. That is a **behaviour decision**, not a refactor, and the plan isolates it behind its own test and its own approval.

**Residual risks:** manifest drift (mitigated by the guard); tool-id consolidation changing an id in a recorded cassette (mitigated by characterization tests first); upstream merging the same idea differently (accepted; a new directory is the cheapest possible conflict).

**Conditions that would justify revisiting.**

- If a future provider genuinely requires a message envelope that five others also need *and* the merge rules converge, re-evaluate C for that family only.
- If upstream introduces a shared traversal, adopt theirs rather than maintaining a fork-specific one.
- If the manifest proves unable to express a real capability (e.g. "media in tool results only for model X"), extend the policy with a predicate rather than falling back to literals.

---

## 11. Remaining uncertainties

| Uncertainty | Impact | How to resolve |
| --- | --- | --- |
| Whether the four system-update-between-tool-call-and-result behaviours are defects or intentional | May add one small shared rule; may be out of scope | Characterization tests first (§ Test matrix); fix only with approval |
| Whether `cohere`'s case-sensitive mime test is a defect | One-line fix if so | One test with an uppercase mime |
| Whether any provider needs `tools: []` on tool history | Could make `Lowering.Fields` a behaviour change | Recorded-cassette check |
| Actual upstream divergence beyond the local tracking ref | Affects merge-cost estimate | `git fetch upstream` before implementation |
| Test-suite runtime for staged verification | Affects plan pacing | Measure on first stage, not guessed |

None of these can invalidate the selection; the first three are small, bounded, and test-resolvable, and the design isolates them.

**Decisions taken after implementation (2026-11-02):**

- **Mistral's silent drop is accepted as-is.** Conformance found it drops assistant `tool-result`/`compaction`/`effort` messages before the capability guard. Mistral is not a target, so the behaviour is recorded and not fixed; the fix location is named in the test matrix if that changes.
- **`ToolResult.plan` adoption is limited to `openai-chat`.** All other protocols preserve interleaved text/file order inside a tool result, which a texts-plus-files split cannot express. The module stays for the one call site that fits; broadening it would require an ordered variant, which nothing currently needs.

---

## 12. Supporting evidence

Commands used (all read-only):

```powershell
# per-file and directory line counts (blank-line-accurate)
Get-ChildItem -Recurse -Filter *.ts packages\ai\src\protocols | ForEach-Object { (Get-Content $_.FullName).Count }

# lowering-region span: lowerMessages/lowerConversation → fromRequest
Select-String -Path packages\ai\src\protocols\*.ts -Pattern 'const (lowerMessages|lowerConversation)\s*='

# capability-guard call sites
Select-String -Path packages\ai\src\protocols\*.ts -Pattern 'ProviderShared\.(supportsContent|unsupportedContent)'

# composition graph
Select-String -Path packages\ai\src\protocols\*.ts -Pattern 'from "\./(openai-chat|open-responses|anthropic-messages|...)\.js"'
```

Git evidence: `9007700546`, `822594b9ae`, `78c31ea68c` (amplification); `a24a239456` (mechanical reshape across 37 files); `8bd7898bb0` (last upstream merge).

Source anchors: `route/protocol.ts:37-68`; `route/client.ts:631`; `protocols/shared.ts` (full text reviewed); `schema/messages.ts:19,232,404`; the nine protocol files at the line references cited in §3.1 and §4.3.

**Caveat on the historical review:** no claim in this document depends on it. Its three nouns were treated as a hypothesis and tested against code in §3.
