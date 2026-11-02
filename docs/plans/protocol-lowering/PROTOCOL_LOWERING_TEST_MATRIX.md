# Protocol Lowering Test Matrix

**Purpose:** define, per protocol, what must be proven before and after the lowering kit lands
**Date:** 2026-11-02
**Companions:** `PROTOCOL_LOWERING_ARCHITECTURE_SPEC.md`, `PROTOCOL_LOWERING_IMPLEMENTATION_PLAN.md`

---

## 1. Method

### 1.1 Two kinds of proof

| Kind | Meaning | Where it applies |
| --- | --- | --- |
| **Exact** | `expect(JSON.parse(body)).toEqual({...})` — the full wire body, plus URL and headers | Every request-side behaviour. Required wherever field presence, ordering, or encoding is contractual. |
| **Semantic** | decoded events, usage, assets, typed errors | Streaming, hosted-tool replay, unsupported-content failures |

Exactness is the default because the existing suite already works that way and because a lowering refactor's only credible proof is byte equality. Semantic assertions are used where the wire body legitimately cannot be fixed (stream state machines) or where the contract is an error type.

### 1.2 Baseline discipline

The baseline is **current code at commit-on-`dev`**, pinned before any change:

- Existing suites are the primary baseline and must pass unchanged.
- A characterization test is added **only** where no suite pins the behaviour. It records today's output; it is not a specification and must not be "corrected" during migration.
- No snapshot is generated from the new implementation. A snapshot produced by the code under test proves nothing.

### 1.3 Commands

```powershell
# from the package directory — never from repo root
cd packages\ai
bun test --timeout 30000 --only-failures
bun typecheck            # local gate
bun run typecheck:tsc    # CI gate; declarations included
```

Single file: `bun test test/provider/openai-chat.test.ts --timeout 30000`.

### 1.4 Coverage status vocabulary

| Mark | Meaning |
| --- | --- |
| **Pinned** | Existing test asserts this exactly; read as verified evidence of intent, not of passing (no suite was run during the investigation) |
| **Recorded** | A cassette suite exists; asserts provider output, **not** request body |
| **Gap** | No test found; a characterization test is required |
| **N/A** | Protocol has no such capability; the manifest must declare it unsupported |

Assertion style was confirmed for `anthropic-messages`, `openai-chat`, `bedrock-converse`, `gemini` and the image suites. For `cohere`, `mistral-chat`, `open-responses*` and `openai-responses`, the files exist but their assertion style was **not** individually verified — treat "Pinned" there as unconfirmed until the first test run.

---

## 2. Cross-protocol conformance (new)

The kit's central claim is that capability becomes data. This is the only test class that checks it.

**File:** `packages/ai/test/provider/lowering-conformance.test.ts` (new)

| Case | Assertion | Applies to |
| --- | --- | --- |
| Manifest totality | every kind in `PartKinds` produces an outcome in every role of every protocol: accepted by the guard, or rejected with `InvalidRequestError` | all 8 bases |
| Supported kind lowers | a request containing the kind in that role does **not** produce `InvalidRequestError` from the guard | each declared-supported cell |
| Unsupported kind fails typed | the guard produces `AIError` with `InvalidRequestError`, message naming the route and role | each declared-unsupported cell |
| Guard reads policy | a locally modified policy flips behaviour (proves the manifest is the source of truth, not a parallel description) | one representative protocol |
| No silent drop by omission | for every kind unsupported in a role, the failure is the guard's, not an incidental throw deeper in the mapper | all 8 |

**Invocation:** call `protocol.body.from(request)` directly with a constructed `LLMRequest` and a model from the corresponding provider facade. No HTTP. This is also the first test in the repository to drive `body.from` uniformly across protocols.

**Limits, stated honestly:** "supported" means *accepted by the guard*, not *emitted unchanged*. A protocol may accept `reasoning` and still drop an unsigned part under a documented rule. Those rules are covered by the per-protocol rows below, not by conformance.

---

## 3. Per-protocol matrix

Legend: **Pinned** = existing exact-body test · **Recorded** = cassette only · **Gap** = required new characterization · **N/A** = declare unsupported.

### 3.1 `openai-chat.ts` — tests: `openai-chat.test.ts` (90 cases), `openai-chat-reasoning.recorded.test.ts`, `openai-compatible-chat.test.ts`

| Behaviour | Status | Existing evidence | Required test |
| --- | --- | --- | --- |
| text user/assistant; all-text collapse to string | Pinned | `openai-chat.test.ts` | none new; must stay byte-identical |
| system field vs chronological system update merged into user turn | Pinned | `openai-chat.test.ts` | add a case where the previous message is a `tool` result |
| tool definitions (function + custom + `strict` gating) | Pinned | `openai-chat.test.ts`, `freeform-tools.test.ts` | none |
| tool choice (auto/none/required/tool, custom-tool form) | Pinned | `openai-chat.test.ts`, `empty-tool-choice.test.ts` | none |
| tool call/result pairing through the model-family id policy | Pinned (Mistral family) | `bedrock-mistral-ids.test.ts` covers the shared util, not this caller | add per-family id cases (OpenAI 40-char, claude scrub, identity) |
| multiple tool results in one turn | Pinned | `openai-chat.test.ts` | none |
| user media: image URL, video URL, PDF inline | Pinned | `openai-chat.test.ts`, `pdf.recorded.test.ts` | none |
| tool-result files hoisted to a following user turn | Pinned | `openai-chat.test.ts` | restate via `ToolResult.plan` and keep bytes equal |
| assistant media | N/A (throws) | `openai-chat.test.ts` (unsupported) | conformance row |
| reasoning replay (field selection, `reasoning_details`, Kimi index strip) | Pinned + Recorded | `openai-chat.test.ts`, `openai-chat-reasoning.recorded.test.ts` | none |
| compaction part | N/A (throws) | none | conformance row + exact error |
| `tools: []` when history has tool calls but no active tools | Pinned | `openai-chat.test.ts` | keep; do not "align" with other protocols without approval |
| `parallel_tool_calls` only with active tools | Pinned | `openai-chat.test.ts` | none |
| blank / zero-part assistant message dropped | **Gap** | none found | characterization |
| system update between `tool-call` and `tool-result` | **Gap** | none found | characterization (see §5.1) |

### 3.2 `anthropic-messages.ts` — tests: `anthropic-messages.test.ts` (80), `anthropic-messages.recorded.test.ts`, `anthropic-messages-cache.recorded.test.ts`, `anthropic-thinking-binding.test.ts`, `anthropic-compaction.test.ts`

| Behaviour | Status | Existing evidence | Required test |
| --- | --- | --- | --- |
| text, blank-text skip, empty user not pushed | Pinned | `anthropic-messages.test.ts` | none |
| system as field; empty parts filtered; cache per part | Pinned | `anthropic-messages.test.ts` | none |
| native system message vs wrapped user text (version + placement gate) | Pinned | `anthropic-messages.test.ts` | add the hold-and-release queue case explicitly |
| tool definitions (`input_schema`, no `type`) | Pinned | `anthropic-messages.test.ts` | none |
| tool choice → `auto`/`none`/`any`/`tool` | Pinned | `anthropic-messages.test.ts` | none |
| tool call/result id scrub + symmetric pairing | Pinned | `anthropic-messages.test.ts` | none |
| tool results appended to a preceding `tool_result` turn | Pinned | `anthropic-messages.test.ts` | none |
| media: video, file_id, URL, plain text, PDF, base64 image | Pinned | `anthropic-messages.test.ts`, `pdf.recorded.test.ts` | none |
| tool-result files inline as blocks | Pinned | `anthropic-messages.test.ts` | restate via `plan()` |
| reasoning: signed, unsigned allowlist, redacted | Pinned | `anthropic-thinking-binding.test.ts` | none |
| compaction part | Pinned | `anthropic-compaction.test.ts` | none |
| cache breakpoint budget (4) and allocation order | Pinned | `anthropic-messages-cache.recorded.test.ts` | none |
| system update that splits a local tool call (throws) | Pinned | `anthropic-messages.test.ts` | keep as the reference behaviour |
| assistant media | N/A (throws) | `anthropic-messages.test.ts` | conformance row |

### 3.3 `open-responses.ts` — tests: `open-responses-errors.test.ts`, `open-responses-finals.test.ts`, `open-responses-lifecycle.test.ts`, `open-responses-replay.test.ts`, `conversation-lowering.test.ts`

| Behaviour | Status | Existing evidence | Required test |
| --- | --- | --- | --- |
| `instructions` string vs empty omission | Pinned | `conversation-lowering.test.ts`, `open-responses-*.test.ts` | none |
| `developer` message for chronological system updates | Pinned | `open-responses-replay.test.ts` | none |
| text grouping by item id + phase | Pinned | `open-responses-replay.test.ts` | none |
| reasoning items with encrypted content; drop when empty | Pinned | `open-responses-replay.test.ts` | none |
| compaction item replay (provider + encrypted required) | **Gap** | `compaction.test.ts` targets the tool, not this mapping | characterization |
| hosted tool item replay (`providerExecuted`) | Pinned | `open-responses-replay.test.ts` | none |
| non-hosted `providerExecuted` call dropped; result synthesized | **Gap** | none found | characterization |
| assistant media → user message | **Gap** | none found | characterization |
| tool definitions incl. namespaces and hosted native tools | Pinned | `open-responses-lifecycle.test.ts` | none |
| `function_call_output` / custom output with `call_id` | Pinned | `open-responses-replay.test.ts` | none |
| server item id kept only with `_` separator | **Gap** | none found | characterization |
| media: image/video/file with `detail` | Pinned | `open-responses-*.test.ts`, `image-detail.test.ts` | none |
| unsupported generation settings excluded | Pinned | `conversation-lowering.test.ts` | none |

### 3.4 `openai-responses.ts` — tests: `openai-responses.test.ts` (157), `openai-responses-cache.recorded.test.ts`, `openai-responses-images.recorded.test.ts`, `openai-responses-websocket.recorded.test.ts`, `responses-routes.recorded.test.ts`, `openai-compatible-responses.test.ts`

| Behaviour | Status | Existing evidence | Required test |
| --- | --- | --- | --- |
| no message traversal; delegates to `open-responses` | Pinned | `openai-responses.test.ts` | none — but the conformance table must call through this file, not the base, so the adapter path is covered |
| hosted `image_generation` tool + base64 result validation | Pinned | `openai-responses-images.recorded.test.ts` | none |
| native tool passthrough vs typed failure | Pinned | `openai-responses.test.ts` | none |
| `reasoning` merge (effort + mode + context) | Pinned | `openai-responses.test.ts` | none |
| effort-update gating (GPT-6+, `pro`, context management) | Pinned | `openai-responses.test.ts` | none |
| compaction trigger body constraints | Pinned | `checkpoint.test.ts`, `compaction.test.ts` | none |
| defaults `store:false`, `include:[reasoning.encrypted_content]` | Pinned | `openai-responses.test.ts` | none |
| `tools`/`tool_choice` omitted with no tools | Pinned | `openai-responses.test.ts` | none |

### 3.5 `bedrock-converse.ts` — tests: `bedrock-converse.test.ts` (81), `bedrock-converse-cache.test.ts` + `.recorded`, `bedrock-converse-options.test.ts` + `.recorded`, `bedrock-converse-thinking-binding.test.ts` + `.recorded`, `bedrock-mantle.test.ts`

| Behaviour | Status | Existing evidence | Required test |
| --- | --- | --- | --- |
| user/assistant/tool merge into one user content array | Pinned | `bedrock-converse.test.ts` | none |
| assistant message dropped when empty | Pinned | `bedrock-converse.test.ts` | none |
| system field + chronological updates wrapped into user turn | Pinned | `bedrock-converse.test.ts` | none |
| cache points: 4-breakpoint budget, tools → system → messages, overflow warning | Pinned | `bedrock-converse-cache.test.ts` | none |
| tool spec + sibling `cachePoint` | Pinned | `bedrock-converse-cache.test.ts` | none |
| tool-result image hoisting + `"See attached image."` placeholder | Pinned | `bedrock-converse.test.ts` | restate via `plan()`; hoisting stays in the protocol |
| inline images for claude/nova models | Pinned | `bedrock-converse-options.test.ts` | none |
| tool-call id normalisation (Mistral models) | Pinned | `bedrock-mistral-ids.test.ts` | consolidate through `ToolID`; bytes unchanged |
| reasoning: signature required, redacted, unsigned dropped | Pinned | `bedrock-converse-thinking-binding.test.ts` | none |
| typed options in `additionalModelRequestFields` | Pinned | `bedrock-converse-options.test.ts` | none |
| message-level system update inside a user turn | **Gap** | partially covered | characterization for the merge-into-previous case |
| compaction part | N/A | none | conformance row |
| assistant media | N/A | none | conformance row |

### 3.6 `mistral-chat.ts` — tests: `mistral-chat.test.ts`, `mistral.recorded.test.ts`

| Behaviour | Status | Existing evidence | Required test |
| --- | --- | --- | --- |
| system string vs multi-part array | Pinned | `mistral-chat.test.ts` | none |
| chronological system update as plain user message | Pinned | `mistral-chat.test.ts` | none |
| text collapse / structured content | Pinned | `mistral-chat.test.ts` | none |
| tool definitions (nested, literal `strict:false`) | Pinned | `mistral-chat.test.ts` | none |
| tool choice: `required`→`any`, tool→function object | Pinned | `mistral-chat.test.ts` | none |
| id normalisation, symmetric for calls and results | Pinned | `bedrock-mistral-ids.test.ts`, `mistral-chat.test.ts` | move to `ToolID`, bytes unchanged |
| tool-result files inline | **Gap** | none found | characterization + `plan()` with protocol placement |
| reasoning only when native thinking metadata present | Pinned | `mistral-chat.test.ts` | none |
| trailing assistant gets `prefix: true` | Pinned | `mistral-chat.test.ts` | none |
| `random_seed`, `safe_prompt`, document limits | Pinned | `mistral-chat.test.ts` | none |
| compaction | N/A | none | conformance row |
| assistant media | N/A (throws) | none | conformance row |

**Found by conformance (2026-11-02):** Mistral silently drops an assistant message whose only part is `tool-result`, `compaction` or `effort` — its outer loop's "no calls, no thinking, blank text → skip" predicate runs before the capability guard. Conformance reports those as *lowered* because a body comes back. This is the silent-drop class the evaluation's §3.2 E predicted, now with a concrete case; it is recorded, not fixed.

### 3.7 `gemini.ts` — tests: `gemini.test.ts` (60), `gemini-cache.recorded.test.ts`, `gemini-openai-chat.recorded.test.ts`

| Behaviour | Status | Existing evidence | Required test |
| --- | --- | --- | --- |
| `contents` with `user`/`model` roles | Pinned | `gemini.test.ts` | none |
| system field → `systemInstruction` parts | Pinned | `gemini.test.ts` | none |
| system update merged into previous user turn unless `functionResponse` | Pinned | `gemini.test.ts` | add the negative case (previous turn is a function response) |
| user media: inline data vs file data | Pinned | `gemini.test.ts` | none |
| assistant media replayed as model-role media | **Gap** | none found | characterization |
| tool definitions (`parametersJsonSchema`) | Pinned | `gemini.test.ts` | none |
| function call id omitted for 1.x/2.x; thought signature validator | Pinned | `gemini.test.ts` | none |
| tool-result media: nested for Gemini 3+, deferred user turn for 2.5 / fileData | Pinned | `gemini.test.ts` | restate both branches via `plan()` + protocol rule |
| reasoning as `thought` with signature | Pinned | `gemini.test.ts` | none |
| continuation across requests resets and re-sums usage | Recorded | `gemini-openai-chat.recorded.test.ts` | none |
| compaction | N/A | none | conformance row |
| `tool_choice` `none` → `mode:"NONE"` | Pinned | `gemini.test.ts` | none |

### 3.8 `google-interactions.ts` — tests: `google-interactions.test.ts`, `google-interactions.recorded.test.ts`, `google-vertex-interactions.test.ts`

| Behaviour | Status | Existing evidence | Required test |
| --- | --- | --- | --- |
| step stream (`user_input`/`model_output`) with same-message merging only | Pinned | `google-interactions.test.ts` | none |
| system update as a `user_input` text step at its position | Pinned | `google-interactions.test.ts` | none |
| `thought` / `function_call` / `function_result` as sibling steps | Pinned | `google-interactions.test.ts` | none |
| `call_id` association without grouping | Pinned | `google-interactions.test.ts` | none |
| hosted tools rejected; unsupported generation params rejected | Pinned | `google-interactions.test.ts` | none |
| media: image/audio/video/pdf/csv, URI only for http(s) video | Pinned | `google-interactions.test.ts` | none |
| thought-signature validator injected on unsigned first call | Pinned | `google-interactions.recorded.test.ts` | none |
| compaction | N/A | none | conformance row |
| tool-result file policy | N/A — uses its own `lowerToolResult` | none | adopt `plan()` for the text/files split only; bytes unchanged |

### 3.9 `cohere-chat.ts` — tests: `cohere.test.ts`, `cohere.recorded.test.ts`

| Behaviour | Status | Existing evidence | Required test |
| --- | --- | --- | --- |
| system string vs array; chronological update as user message | Pinned | `cohere.test.ts` | none |
| `content: undefined` for tool-call-only / thinking-only assistant | Pinned | `cohere.test.ts` | none |
| tool definitions; tool list filtered to selected tool; missing tool throws | Pinned | `cohere.test.ts` | none |
| `tool_choice` two-value enum (`NONE`/`REQUIRED`) | Pinned | `cohere.test.ts`, `empty-tool-choice.test.ts` | none |
| `tool_plan` reconstructed from reasoning parts | Pinned | `cohere.test.ts` | none |
| user image only; non-image throws | Pinned | `cohere.test.ts` | none |
| tool-result files rejected | Pinned | `cohere.test.ts` | `plan()` policy `reject`, same error |
| **case-sensitive mime check** | **Gap** | none found | characterization with `IMAGE/PNG` (see §5.2) |
| compaction / assistant media | N/A | none | conformance row |

---

## 4. Shared-component tests (new)

### 4.1 `packages/ai/test/lowering/content.test.ts`

| Case | Assertion |
| --- | --- |
| canonical list | `PartKinds` lists every `ContentPart` member (compile tripwire, verified once in plan Task 3 Step 5) |
| acceptance | `accepts` true exactly for declared kinds, per role |
| failure shape | `accepts` is false and `kindsOf` yields the list used in `"<route> <role> messages only support <list> content for now"` |
| canonical order | the list is ordered by `PartKinds`, not by declaration order |
| narrowing | after `accepts(policy, role, part)` returns true, the part type is the declared union (a test fails to compile otherwise) |

### 4.2 `packages/ai/test/lowering/tool-result.test.ts`

| Case | Assertion |
| --- | --- |
| `json` / `text` / `error` results | `{type:"text"}` with `toolResultText`'s exact string |
| `content` with texts only | `{type:"content", texts, files: []}` |
| `content` with files, policy `allow` | files present as `MediaPart` produced by `toolFileMedia` (data URL, URI, raw base64, declared mime wins); the module does not place them |
| `content` with files, policy `reject` | typed `InvalidRequestError`, nothing emitted |
| empty `content` | `texts: []`, no failure |
| caller owns joining | the module never joins (`"\n"` stays the protocol's choice) |

### 4.3 `packages/ai/test/lowering/tool-id.test.ts`

| Case | Assertion |
| --- | --- |
| `truncate(40)` | 41+ chars → 40; 40 or fewer unchanged |
| `scrub` | every illegal char replaced, length preserved |
| `mistral` | 9 alnum chars, right-padded `0`; stable for an already-valid id |
| `forModel` | claude / mistral / openai / default branches select the documented policy |
| symmetry | `apply(policy, call.id) === apply(policy, result.id)` for the same input |

### 4.4 `packages/ai/test/lowering/fields.test.ts`

| Case | Assertion |
| --- | --- |
| history detection | true for a tool-call or tool-result anywhere; false otherwise; empty request false |
| parallel tool calls | respects `disableParallelToolUse` and compatibility override; `undefined` when unset |

### 4.5 Conformance and characterization

- `lowering-conformance.test.ts` — §2.
- `lowering-ordering.test.ts` — §5, records current behaviour only.

---

## 5. Uncertain cases: characterize before deciding

These are the evaluation's §3.2 E items. Each test is written **against current code** and its result is reported before any change. None blocks the kit; each may produce a follow-up fix.

### 5.1 System update between a `tool-call` and its `tool-result`

| Protocol | Observed behaviour (measured 2026-11-02) | Where |
| --- | --- | --- |
| anthropic | rejects with `reason._tag === "InvalidRequest"` (`splitsLocalToolResults`) | `lowering-ordering-chat.test.ts` |
| openai-chat | inserts a `user` message (`<system-update>` wrapper) **before** the tool result | `lowering-ordering-chat.test.ts` |
| open-responses | inserts a `developer` message between `function_call` and `function_call_output` | `lowering-ordering-responses.test.ts` |
| openai-responses | identical to `open-responses` through the adapter | `lowering-ordering-responses.test.ts` |
| cohere | inserts a `user` message with the wrapped system text before the tool message | `lowering-ordering-responses.test.ts` |
| bedrock | merges the wrapped text into the **same** user message as the `toolResult` | `lowering-ordering-structured.test.ts` |
| gemini | emits three turns: its own user turn for the system text, then a `functionResponse` turn | `lowering-ordering-structured.test.ts` |
| google-interactions | accepts it as its own `user_input` step | `lowering-ordering-structured.test.ts` |
| mistral | **not characterized** — the chat file covers openai-chat and anthropic only | gap |

Seven distinct outcomes for one input. Whether the inserting protocols produce an invalid history (a `tool` message must usually follow the `tool_calls` message immediately) is a **behaviour question, not a refactor**: it is recorded, not fixed, and the kit must not normalise it.

### 5.2 Uppercase media type in `cohere-chat`

**Observed:** Cohere **rejects** (`reason._tag === "InvalidRequest"`); every other protocol accepts and emits a lowercase media type. The mechanism is narrower than "Cohere compares raw case": `Media.Asset.mediaType` preserves the caller's casing, while `inline().dataUrl` lowercases, so protocols that build a data URL or call `kindOf` normalise for free and Cohere's `mediaType.startsWith("image/")` is the only raw comparison. Reachable through `Media.base64(data, "IMAGE/PNG")`; confirmed in `lowering-ordering-responses.test.ts`. Verdict: latent defect, one-line fix, **not applied** — it is a behaviour change and needs its own approval.

### 5.3 Blank and zero-part messages

**Observed:** a zero-part assistant message is dropped by openai-chat, anthropic, bedrock, open-responses, openai-responses and google-interactions; **kept as an empty container** by gemini (`{role:"model",parts:[]}`) and cohere (`{role:"assistant"}`). A whitespace-only text is dropped by openai-chat and anthropic, and kept by bedrock, gemini, cohere and google-interactions. Unsigned reasoning is kept by openai-chat (`reasoning_content`), gemini (`thought`), cohere (`thinking`) and google-interactions (`thought`); dropped by anthropic, bedrock and open-responses. Do not converge these predicates.

### 5.4 `tools: []` with tool history

**Observed:** only **openai-chat** sends `tools: []`; anthropic, open-responses, openai-responses, cohere, bedrock, gemini and google-interactions all omit the key. No protocol requires it in a way the current code misses; the divergence is intentional in openai-chat and is pinned. Any change is a behaviour decision, not part of the kit.

---

## 6. Regression protection: what each failure looks like

| Failure | Detected by | Signal |
| --- | --- | --- |
| Lost content | exact-body suites | a missing element in `toEqual` |
| Incorrect mapping | exact-body suites | diff at the mapped field |
| Unexpected default | exact-body suites | an extra key |
| Changed message order | exact-body suites | array order diff |
| Broken tool-call association | exact-body + `tool-id` symmetry test | `call_id` mismatch |
| Cross-protocol leakage | conformance + per-protocol suites | a protocol accepting a kind its manifest rejects, or vice versa |
| Silent omission | conformance | declared-supported kind throws, or declared-unsupported succeeds |
| Invalid serialization | `body.schema.encode` in every protocol test | decode/encode failure |
| Manifest drift | guard reads policy; conformance flips behaviour when the policy is edited | behavioural change under a test |

---

## 7. Performance verification

**Not performed, and not required.** Every component is a pure function added to a lowering pass that already allocates a body. No candidate copies the request, adds a traversal, or retains state; the manifest is a module constant.

If a future change makes a component non-trivial (e.g. a policy that scans history per part), measure then: assert that a 200-message request with 1,000 parts lowers in the same order of magnitude as today, using a local timing harness rather than a committed benchmark. No target is invented now.

---

## 8. Matrix completeness check

- All eight base protocols have a row for every capability they claim.
- `openai-responses` is covered through the adapter path, not only through `open-responses`.
- Every "N/A" is a manifest entry the conformance test asserts.
- Every "Gap" has a named test file and a named case.
- Every shared module has unit tests independent of any protocol.
- No row depends on a test that does not exist or on a suite that was claimed to pass.
