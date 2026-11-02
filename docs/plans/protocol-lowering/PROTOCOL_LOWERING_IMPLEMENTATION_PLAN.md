# Protocol Lowering Kit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make protocol part-capability and tool-result policy explicit, single-sourced, and test-enforced, without changing a single emitted request body.

**Architecture:** Add `packages/ai/src/protocols/lowering/` — four pure modules (content capability, tool-result material, tool-call id policy, presence decisions) plus a namespace aggregator. Each protocol keeps its own `body.from` message loop and merge rules; it replaces scattered guard literals, id switches, and result splits with calls into the kit. A cross-protocol conformance test enumerates every part kind against every protocol.

**Tech Stack:** TypeScript, Effect 4 (`Effect.fnUntraced`, `Effect.gen`), Effect Schema, `bun test`.

**Spec:** `docs/plans/protocol-lowering/PROTOCOL_LOWERING_ARCHITECTURE_SPEC.md`
**Evaluation:** `docs/plans/protocol-lowering/PROTOCOL_LOWERING_ARCHITECTURE_EVALUATION.md`
**Test matrix:** `docs/plans/protocol-lowering/PROTOCOL_LOWERING_TEST_MATRIX.md`

---

## Global Constraints

- **No emitted body may change.** Every `test/provider/*.test.ts` that asserts `toEqual` on the wire body must pass unmodified, except the one documented diagnostic-string change in `PROTOCOL_LOWERING_ARCHITECTURE_SPEC.md` §8.2.
- **No public export removed or renamed.** `ProtocolBody`, `Protocol`, `Route`, `LLMRequest`, `ProviderShared`, and `open-responses`'s `resolveParallelToolCalls` stay.
- **No `package.json` change.** `packages/ai/package.json` lists explicit subpaths; `lowering/` is internal.
- **No new dependency.** The kit imports only `effect`, `../../schema/index.js`, and existing local modules.
- **Do not modify `protocols/shared.ts`.** It is the most-reused file in the directory and an upstream conflict hotspot.
- **Tests run from `packages/ai`**, never from repo root: `cd packages\ai` then `bun test ...`.
- **Style:** no `any`; no star imports (`import * as`); no aliased imports; no `else` (early returns); bind Effect services to named variables before calling methods; `Effect.fnUntraced` for internal Effectful helpers; inline single-use values at the call site.
- **Commits:** conventional, scoped `ai`. Example: `test(ai): pin protocol lowering ordering behaviour`.
- **No changeset files.**
- **Verification per task:** the task's own test file plus `bun typecheck` from `packages/ai`. Full-suite runs are called out explicitly where required.
- **Never claim a check passed that was not run.**

## Review Focus

Five input classes the design does not normalise and that a careless consolidation would silently change. Each has a test in the task that owns the code.

1. **Zero-part and whitespace-only messages** — four protocols disagree on whether to drop them (`openai-chat:735-739`, `anthropic:961/995`, `mistral:353-358`, `open-responses:673`). A new shared helper must not converge the predicates. *Test: Task 1.*
2. **A system update positioned between a `tool-call` and its `tool-result`** — Anthropic throws, four protocols insert a user/developer message. *Test: Task 1.*
3. **Tool-result media placement** — hoisted (openai-chat, Bedrock for non-claude/nova), inline (Anthropic, open-responses, Mistral), rejected (Cohere). Getting placement wrong changes the message count, not just a field. *Tests: Tasks 11, 12.*
4. **Mixed-case media types** — five protocols lowercase before comparing; Cohere does not (`cohere-chat:193`). The kit must not add case handling. *Test: Task 1.*
5. **Id collisions after normalisation** — `MistralToolID` truncates to 9 characters, so two distinct ids can collide. Consolidation must preserve the current collision behaviour, not dedupe or renumber. *Tests: Tasks 2, 5.*

---

## Prerequisites

- Worktree or branch `lowering-kit` based on current local `dev`. Do not work on another session's branch.
- `git status` clean in `packages/ai`.
- Confirm the baseline is green **before** Task 1: from `packages/ai`, `bun test --timeout 30000 --only-failures`. If it is already red, record the failing files and do not proceed until they are understood — a red baseline makes every later comparison meaningless.
- Note the run duration; stages 7–17 need the full suite several times.

---

## File structure

**Create**

| Path | Responsibility |
| --- | --- |
| `packages/ai/src/protocols/lowering/content.ts` | Part kinds, canonical list, `ContentPolicy`, `accepts`, `assert`, `kindsOf` |
| `packages/ai/src/protocols/lowering/tool-result.ts` | `ToolResultPlan`, `plan()` |
| `packages/ai/src/protocols/lowering/tool-id.ts` | `ToolIDPolicy`, named policies, `forModel`, `apply` |
| `packages/ai/src/protocols/lowering/fields.ts` | `hasToolHistory`, `parallelToolCalls` |
| `packages/ai/src/protocols/lowering/index.ts` | Namespace aggregator |
| `packages/ai/test/lowering/content.test.ts` | Unit |
| `packages/ai/test/lowering/tool-result.test.ts` | Unit |
| `packages/ai/test/lowering/tool-id.test.ts` | Unit |
| `packages/ai/test/lowering/fields.test.ts` | Unit |
| `packages/ai/test/provider/lowering-ordering.test.ts` | Characterization (new file, current behaviour) |
| `packages/ai/test/provider/lowering-ids.test.ts` | Characterization (current id outputs) |
| `packages/ai/test/provider/lowering-conformance.test.ts` | Cross-protocol conformance |

**Modify** (guards, id calls, result splits only — never merge/order logic):

`openai-chat.ts`, `anthropic-messages.ts`, `open-responses.ts`, `bedrock-converse.ts`, `gemini.ts`, `mistral-chat.ts`, `google-interactions.ts`, `cohere-chat.ts`, and one paragraph in `packages/ai/AGENTS.md`.

---

## Stage 1 — Baseline protection

### Task 1: Characterize ordering, message predicates, and media case

**Files:**
- Create: `packages/ai/test/provider/lowering-ordering.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: a recorded current-behaviour table the later stages must not disturb.

- [ ] **Step 1: Write the characterization test**

For each of the eight bases, add one `it.effect` per case below, asserting the **whole** outbound body with `toEqual` (or the exact `AIError` reason `_tag` where the protocol throws). Build requests and models exactly as the sibling suite does — copy the construction idiom from `test/provider/openai-chat.test.ts` (for `ai`/`Message` usage), and from each protocol's own suite for the model.

```ts
// packages/ai/test/provider/lowering-ordering.test.ts
import { expect } from "bun:test"
import { Effect } from "effect"
import { it } from "../lib/effect.js"
// one import per protocol under test + the provider facade that builds its model

it.effect("anthropic rejects a system update between a tool call and its result", () =>
  Effect.gen(function* () {
    // request: user, assistant(tool-call), system("update"), tool(tool-result)
    // assert: AIError whose reason._tag === "InvalidRequestError"
  }))

it.effect("openai-chat inserts a user message for a system update between a tool call and its result", () =>
  Effect.gen(function* () {
    // same request shape; assert full body with toEqual
  }))
```

Cases required (the matrix in `PROTOCOL_LOWERING_TEST_MATRIX.md` §5 lists the expected outcome per protocol):

| Case | Protocols |
| --- | --- |
| system update between `tool-call` and `tool-result` | all 8 bases |
| zero-part assistant message | all 8 |
| whitespace-only assistant text | all 8 |
| reasoning-only assistant message with unsigned reasoning | all 8 |
| `tools: []` vs omitted when history has tool calls and no active tools | all 8 |
| `mediaType: "IMAGE/PNG"` on a user media part | all 8 |

- [ ] **Step 2: Run it and confirm every case passes against current code**

Run: `cd packages\ai` then `bun test test/provider/lowering-ordering.test.ts --timeout 30000`
Expected: PASS. This test describes today, not a target. If a case fails, the assertion is wrong about current behaviour — correct the assertion, not the protocol.

- [ ] **Step 3: Record the two divergences that are defects**

If `IMAGE/PNG` is rejected by Cohere while five protocols accept it, and if a system update between call and result produces an invalid request on any protocol, add a comment above those cases:

```ts
// Divergence recorded 2026-11-02: Cohere compares the raw mediaType ("IMAGE/PNG") while every
// other protocol lowercases first. Not fixed here; the kit must not change this silently.
```

Do **not** fix them in this plan.

- [ ] **Step 4: Commit**

```bash
git add packages/ai/test/provider/lowering-ordering.test.ts
git commit -m "test(ai): pin protocol lowering ordering and predicate behaviour"
```

### Task 2: Characterize tool-call id normalisation

**Files:**
- Create: `packages/ai/test/provider/lowering-ids.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: the exact current id for a fixed input table, per protocol — the oracle for Task 5.

- [ ] **Step 1: Write the table test**

Use a single input id set that exercises every branch: a 45-character id, an id containing `.` and `:`, an id that is already 9 alphanumeric characters, and two distinct long ids that both truncate to the same 9-character prefix (the collision case).

```ts
const ids = [
  "call_0123456789012345678901234567890123456789", // 45 chars, OpenAI truncation
  "call.abc:def/ghi",                               // illegal chars, Anthropic scrub
  "abcdefghi",                                       // already 9, Mistral passthrough
  "0123456789abcdef",                                // 16 chars
  "012345678zabcdef",                                // collides with the previous after 9-char truncation
]
```

For each protocol that transforms ids (`openai-chat` per family, `anthropic-messages`, `bedrock-converse` with a `mistral.*` model, `mistral-chat`), assert the emitted `tool_call_id` / `toolUseId` / `call_id` for both the call and the result, with `toEqual` on the full body.

- [ ] **Step 2: Run it**

Run: `bun test test/provider/lowering-ids.test.ts --timeout 30000`
Expected: PASS, and the collision case shows two results sharing one normalised id. Record that output in a comment — it is the behaviour Task 5 must preserve.

- [ ] **Step 3: Commit**

```bash
git add packages/ai/test/provider/lowering-ids.test.ts
git commit -m "test(ai): pin tool-call id normalisation per protocol"
```

---

## Stage 2 — Core infrastructure

### Task 3: `lowering/content.ts`

**Files:**
- Create: `packages/ai/src/protocols/lowering/content.ts`
- Create: `packages/ai/test/lowering/content.test.ts`

**Interfaces:**
- Consumes: `ContentPart`, `MessageRole` from `../../schema/index.js`; `unsupportedContent` from `../shared.js`.
- Produces:
  - `Content.PartKinds: readonly ["text","media","tool-call","tool-result","reasoning","compaction","effort"]`
  - `Content.PartKind`
  - `Content.ContentPolicy` — `{ route, system, user, assistant, tool }`, each `ReadonlyArray<PartKind>`
  - `Content.accepts(policy, role, part): boolean`
  - `Content.kindsOf(policy, role): ReadonlyArray<PartKind>`
  - `Content.assert(policy, role, part): Effect.Effect<void, AIError>`

- [ ] **Step 1: Write the failing tests**

```ts
// packages/ai/test/lowering/content.test.ts
import { expect } from "bun:test"
import { Effect } from "effect"
import { it } from "../lib/effect.js"
import { Content } from "../../src/protocols/lowering/index.js"
import { Message } from "../../src/schema/index.js"

const policy: Content.ContentPolicy = {
  route: "Test Protocol",
  system: ["text"],
  user: ["text", "media"],
  assistant: ["text", "reasoning"],
  tool: ["tool-result"],
}

it.effect("accepts only declared kinds per role", () =>
  Effect.gen(function* () {
    const text = Message.text("hi").content[0]
    const reasoning = { type: "reasoning" as const, text: "thinking" }
    expect(Content.accepts(policy, "user", text)).toBe(true)
    expect(Content.accepts(policy, "user", reasoning)).toBe(false)
    expect(Content.accepts(policy, "assistant", reasoning)).toBe(true)
  }))

it.effect("reports accepted kinds in canonical order, not declaration order", () =>
  Effect.gen(function* () {
    const reordered: Content.ContentPolicy = { ...policy, assistant: ["reasoning", "text"] }
    expect(Content.kindsOf(reordered, "assistant")).toEqual(["text", "reasoning"])
  }))

it.effect("fails unsupported content with the shared error shape", () =>
  Effect.gen(function* () {
    const part = { type: "tool-call" as const, id: "1", name: "t", input: {} }
    const error = yield* Effect.flip(Content.assert(policy, "user", part))
    expect(error.reason._tag).toBe("InvalidRequestError")
    expect(error.reason.message).toBe("Test Protocol user messages only support text and media content for now")
  }))

it.effect("accepts without mutating the part", () =>
  Effect.gen(function* () {
    const text = Message.text("hi").content[0]
    const before = JSON.stringify(text)
    yield* Content.assert(policy, "user", text)
    expect(JSON.stringify(text)).toBe(before)
  }))
```

Note: confirm the `Message.text(...)` accessor and the exact `InvalidRequestError` field names against `src/schema/messages.ts` and `src/schema/errors.ts` before running; adjust the test's construction, never the module's contract.

- [ ] **Step 2: Run to see it fail**

Run: `bun test test/lowering/content.test.ts --timeout 30000`
Expected: FAIL — cannot resolve `../../src/protocols/lowering/index.js`.

- [ ] **Step 3: Implement `content.ts` and the aggregator**

```ts
// packages/ai/src/protocols/lowering/content.ts
import { Effect } from "effect"
import type { AIError, ContentPart, MessageRole } from "../../schema/index.js"
import { unsupportedContent } from "../shared.js"

export type PartKind = ContentPart["type"]

export const PartKinds = ["text", "media", "tool-call", "tool-result", "reasoning", "compaction", "effort"] as const

/** Compile tripwire: a new ContentPart member must be added to PartKinds above. */
type Unlisted = Exclude<PartKind, (typeof PartKinds)[number]>
type AllKindsListed = [Unlisted] extends [never] ? true : ["part kind missing from PartKinds", Unlisted]

export interface ContentPolicy {
  readonly route: string
  readonly system: ReadonlyArray<PartKind>
  readonly user: ReadonlyArray<PartKind>
  readonly assistant: ReadonlyArray<PartKind>
  readonly tool: ReadonlyArray<PartKind>
}

export const accepts = (policy: ContentPolicy, role: MessageRole, part: ContentPart) => policy[role].includes(part.type)

export const kindsOf = (policy: ContentPolicy, role: MessageRole) => {
  const accepted = policy[role]
  if (accepted.length <= 1) return accepted
  return PartKinds.filter((kind) => accepted.includes(kind))
}

export const assert = (policy: ContentPolicy, role: MessageRole, part: ContentPart) =>
  accepts(policy, role, part) ? Effect.void : Effect.fail(unsupportedContent(policy.route, role, kindsOf(policy, role)))
```

`AllKindsListed` must be used somewhere or the compiler may elide nothing but a linter may flag it — reference it in a type position inside the module's own declaration:

```ts
export const _allKindsListed: AllKindsListed = true
```

If the project's lint rejects underscore-prefixed exports, use a non-exported `const allKindsListed: AllKindsListed = true` and reference it from `PartKinds`'s declaration comment. Either way, `bun typecheck` must accept it.

```ts
// packages/ai/src/protocols/lowering/index.ts
export * as Content from "./content.js"
```

- [ ] **Step 4: Run the tests**

Run: `bun test test/lowering/content.test.ts --timeout 30000`
Expected: PASS.

- [ ] **Step 5: Prove the tripwire fires**

Temporarily add a member to the `ContentPart` union in `packages/ai/src/schema/messages.ts` (e.g. a `Literal("scratch")` variant), run `bun typecheck`, and confirm the error names `PartKinds`. Revert the scratch edit with `git checkout -- packages/ai/src/schema/messages.ts` and confirm `git status` is clean.

This step validates the only mechanism in the design that was reasoned about rather than observed.

- [ ] **Step 6: Commit**

```bash
git add packages/ai/src/protocols/lowering/content.ts packages/ai/src/protocols/lowering/index.ts packages/ai/test/lowering/content.test.ts
git commit -m "feat(ai): add protocol content capability manifest"
```

### Task 4: `lowering/tool-result.ts`

**Files:**
- Create: `packages/ai/src/protocols/lowering/tool-result.ts`
- Create: `packages/ai/test/lowering/tool-result.test.ts`
- Modify: `packages/ai/src/protocols/lowering/index.ts`

**Interfaces:**
- Consumes: `toolResultText`, `toolFileMedia`, `invalidRequest` from `../shared.js`.
- Produces:
  - `ToolResult.ToolResultFilePolicy = "allow" | "reject"`
  - `ToolResult.ToolResultPlan = { type: "text"; text: string } | { type: "content"; texts: ReadonlyArray<string>; files: ReadonlyArray<MediaPart> }`
  - `ToolResult.plan(route: string, part: ToolResultPart, policy: ToolResultFilePolicy): Effect.Effect<ToolResultPlan, AIError>`

- [ ] **Step 1: Write the failing tests**

Cases: `json` result; `text` result; `error` result (string and structured); `content` with texts only; `content` with a text and a data-URL file; `content` with files under `reject`; empty `content`; declared mime overriding a data-URL prefix.

Construct tool-result parts by copying the construction from an existing suite that already builds `result: { type: "content", value: [...] }` (see `test/provider/openai-chat.test.ts` tool-result cases) rather than inventing the `Tool.Content` shape.

```ts
it.effect("splits content into texts and files without joining", () =>
  Effect.gen(function* () {
    const plan = yield* ToolResult.plan("Test", part, "allow")
    expect(plan).toEqual({
      type: "content",
      texts: ["first", "second"],
      files: [{ /* MediaPart produced by toolFileMedia */ }],
    })
  }))

it.effect("rejects files when the protocol cannot carry them", () =>
  Effect.gen(function* () {
    const error = yield* Effect.flip(ToolResult.plan("Cohere Chat", part, "reject"))
    expect(error.reason._tag).toBe("InvalidRequestError")
  }))
```

- [ ] **Step 2: Run to see it fail**

Run: `bun test test/lowering/tool-result.test.ts --timeout 30000`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`plan` returns `{ type: "text", text: toolResultText(part) }` for `json`/`text`/`error`. For `content`, map text items to strings, map file items through `toolFileMedia`, and fail with `invalidRequest` when the policy is `reject` and files exist. Do not join; do not place. Add `export * as ToolResult from "./tool-result.js"` to `index.ts`.

- [ ] **Step 4: Run the tests**

Run: `bun test test/lowering/tool-result.test.ts --timeout 30000`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/ai/src/protocols/lowering/tool-result.ts packages/ai/src/protocols/lowering/index.ts packages/ai/test/lowering/tool-result.test.ts
git commit -m "feat(ai): add shared tool-result lowering"
```

### Task 5: `lowering/tool-id.ts`

**Files:**
- Create: `packages/ai/src/protocols/lowering/tool-id.ts`
- Create: `packages/ai/test/lowering/tool-id.test.ts`
- Modify: `packages/ai/src/protocols/lowering/index.ts`

**Interfaces:**
- Consumes: `MistralToolID` from `../utils/mistral-tool-id.js`; `LLMRequest`.
- Produces: `ToolID.identity`, `ToolID.truncate(max)`, `ToolID.scrub(pattern, replacement)`, `ToolID.mistral`, `ToolID.forModel(request)`, `ToolID.apply(policy, id)`.

- [ ] **Step 1: Write the failing tests**

Port the table from Task 2 into unit form: each policy's rule, `forModel`'s family selection, and symmetry (`apply(policy, id)` called twice returns the same value; the collision pair still collides).

- [ ] **Step 2: Run to see it fail**

Run: `bun test test/lowering/tool-id.test.ts --timeout 30000`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement by lifting the existing bodies**

Copy — do not rewrite — the rules from `openai-chat.ts:673-683`, `anthropic-messages.ts` `scrubToolCallID`, and `MistralToolID`. `forModel` reproduces the openai-chat family switch exactly, including its default branch.

- [ ] **Step 4: Run the unit tests and the id characterization test**

Run: `bun test test/lowering/tool-id.test.ts test/provider/lowering-ids.test.ts --timeout 30000`
Expected: PASS. The characterization test must still pass because no caller uses the new module yet.

- [ ] **Step 5: Commit**

```bash
git add packages/ai/src/protocols/lowering/tool-id.ts packages/ai/src/protocols/lowering/index.ts packages/ai/test/lowering/tool-id.test.ts
git commit -m "feat(ai): add shared tool-call id policy"
```

### Task 6: `lowering/fields.ts`

**Files:**
- Create: `packages/ai/src/protocols/lowering/fields.ts`
- Create: `packages/ai/test/lowering/fields.test.ts`
- Modify: `packages/ai/src/protocols/lowering/index.ts`

**Interfaces:**
- Consumes: `LLMRequest`.
- Produces: `Fields.hasToolHistory(request): boolean`, `Fields.parallelToolCalls(request): boolean | undefined`.

- [ ] **Step 1: Write the failing tests**

`hasToolHistory` true for a `tool-call` or `tool-result` in any message, false for empty and text-only requests. `parallelToolCalls` respects `disableParallelToolUse` and the model-compatibility override, returning `undefined` when unset.

- [ ] **Step 2: Run to see it fail**

Run: `bun test test/lowering/fields.test.ts --timeout 30000`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement by lifting**

Move the bodies of `openai-chat.ts`'s private `hasToolHistory` (`L756-762`) and `open-responses.ts`'s exported `resolveParallelToolCalls` (`L847`). **`open-responses.ts` must keep exporting `resolveParallelToolCalls`,** re-exporting from the new module so `openai-chat.ts:29` and any external consumer still work:

```ts
export const resolveParallelToolCalls = Fields.parallelToolCalls
```

- [ ] **Step 4: Run the tests plus the two affected suites**

Run: `bun test test/lowering/fields.test.ts test/provider/openai-chat.test.ts test/provider/open-responses-replay.test.ts --timeout 30000`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/ai/src/protocols/lowering/fields.ts packages/ai/src/protocols/lowering/index.ts packages/ai/test/lowering/fields.test.ts packages/ai/src/protocols/open-responses.ts
git commit -m "feat(ai): share tool-history and parallel-tool-call decisions"
```

---

## Stage 3 — Representative integration

### Task 7: Adopt `Content` in `cohere-chat` and `mistral-chat`

**Files:**
- Modify: `packages/ai/src/protocols/cohere-chat.ts` (guard at `L167-204`)
- Modify: `packages/ai/src/protocols/mistral-chat.ts` (guards at `L231-241`, `L279`, `L294-295`)

**Interfaces:**
- Consumes: `Content.ContentPolicy`, `Content.assert`.
- Produces: two policies the conformance test will use.

- [ ] **Step 1: Add the policy constant to each file**

```ts
const content: Content.ContentPolicy = {
  route: "Cohere Chat",
  system: ["text"],
  user: ["text", "media"],
  assistant: ["text", "reasoning", "tool-call"],
  tool: ["tool-result"],
}
```

Same shape for Mistral with `route: "Mistral Chat"`. **Confirm each array against the guard it replaces** — the existing literal is the source of truth, not this plan.

- [ ] **Step 2: Replace the guards**

`if (!ProviderShared.supportsContent(part, ["tool-result"])) return yield* ProviderShared.unsupportedContent(...)` becomes `yield* Content.assert(content, "tool", part)`. Keep the surrounding `continue`/branch structure identical, and keep any `part.type` discrimination the branch relies on.

- [ ] **Step 3: Run both suites**

Run: `bun test test/provider/cohere.test.ts test/provider/mistral-chat.test.ts --timeout 30000`
Expected: PASS with zero edits to those test files. Any body diff means the policy array is wrong.

- [ ] **Step 4: Commit**

```bash
git add packages/ai/src/protocols/cohere-chat.ts packages/ai/src/protocols/mistral-chat.ts
git commit -m "refactor(ai): adopt content policy in cohere and mistral"
```

### Task 8: Adopt `Content` in the chat-family protocols

**Files:**
- Modify: `openai-chat.ts` (`L508-518`, `L538-539`, `L597`), `anthropic-messages.ts` (`L934-947`, `L953-993`, `L1002-1012`), `gemini.ts` (`L335-341`, `L354`, `L409`), `bedrock-converse.ts` (`L383-392`, `L404-412`, `L439`)

**Interfaces:**
- Consumes: `Content.assert`.
- Produces: policies for the four hardest loops.

- [ ] **Step 1: Add policies**

| Protocol | system | user | assistant | tool |
| --- | --- | --- | --- | --- |
| OpenAI Chat | `text` | `text, media` | `text, reasoning, tool-call` | `tool-result` |
| Anthropic Messages | `text` | `text, media` | `compaction, text, reasoning, tool-call, tool-result` | `tool-result` |
| Gemini | `text` | `text, media` | `text, reasoning, tool-call, media` | `tool-result` |
| Bedrock Converse | `text` | `text, media` | `text, reasoning, tool-call` | `tool-result` |

Verify each against its guard before editing. Anthropic's assistant list must match the accepted set at `L991-993`; Gemini's must include assistant media, which it replays.

- [ ] **Step 2: Replace guards only**

No merge, hoist, cache-point, or step logic changes. If a guard's `unsupportedContent` call passes a role-specific list that differs from the policy, the policy is wrong — fix the policy, not the call.

- [ ] **Step 3: Run the four suites**

Run: `bun test test/provider/openai-chat.test.ts test/provider/anthropic-messages.test.ts test/provider/gemini.test.ts test/provider/bedrock-converse.test.ts --timeout 30000`
Expected: PASS, unmodified test files. The only permitted difference anywhere is the diagnostic string order in a test that asserts `unsupportedContent` text — if one fails for that reason, update the expected string and note it in the commit body.

- [ ] **Step 4: Commit**

```bash
git add packages/ai/src/protocols/openai-chat.ts packages/ai/src/protocols/anthropic-messages.ts packages/ai/src/protocols/gemini.ts packages/ai/src/protocols/bedrock-converse.ts
git commit -m "refactor(ai): adopt content policy in chat-family protocols"
```

### Task 9: Adopt `Content` in the structured protocols

**Files:**
- Modify: `open-responses.ts` (`L613-627`, `L709-788`, `L793-801`), `google-interactions.ts` (`L275-276`, `L316-320`)

**Interfaces:**
- Consumes: `Content.assert`.
- Produces: policies for the two protocols a universal engine could not have served.

- [ ] **Step 1: Add policies**

| Protocol | system | user | assistant | tool |
| --- | --- | --- | --- | --- |
| Open Responses | `text` | `text, media` | `compaction, text, reasoning, tool-call, tool-result, media` | `tool-result` |
| Google Interactions | `text` | `text, media` | `text, media, reasoning, tool-call, tool-result` | `tool-result` |

- [ ] **Step 2: Replace guards only.** The step-emission and item-grouping logic is untouched.

- [ ] **Step 3: Run both suites**

Run: `bun test test/provider/open-responses-replay.test.ts test/provider/open-responses-lifecycle.test.ts test/provider/google-interactions.test.ts --timeout 30000`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/ai/src/protocols/open-responses.ts packages/ai/src/protocols/google-interactions.ts
git commit -m "refactor(ai): adopt content policy in responses and interactions"
```

### Task 10: Cross-protocol conformance test

**Files:**
- Create: `packages/ai/test/provider/lowering-conformance.test.ts`

**Interfaces:**
- Consumes: all eight policies via `body.from`.
- Produces: the executable capability inventory.

- [ ] **Step 1: Write the failing test**

```ts
const protocols = [
  { name: "OpenAI Chat", from: OpenAIChat.protocol.body.from, model: /* facade idiom from openai-chat.test.ts */ },
  { name: "Anthropic Messages", from: AnthropicMessages.protocol.body.from, model: /* ... */ },
  { name: "Open Responses", from: OpenResponses.protocol.body.from, model: /* ... */ },
  { name: "OpenAI Responses", from: OpenAIResponses.protocol.body.from, model: /* ... */ },
  { name: "Bedrock Converse", from: BedrockConverse.protocol.body.from, model: /* ... */ },
  { name: "Mistral Chat", from: MistralChat.protocol.body.from, model: /* ... */ },
  { name: "Gemini", from: Gemini.protocol.body.from, model: /* ... */ },
  { name: "Google Interactions", from: GoogleInteractions.protocol.body.from, model: /* ... */ },
  { name: "Cohere Chat", from: CohereChat.protocol.body.from, model: /* ... */ },
]

for (const protocol of protocols) {
  for (const kind of Content.PartKinds) {
    for (const role of ["system", "user", "assistant", "tool"] as const) {
      it.effect(`${protocol.name} decides ${kind} in ${role}`, () =>
        Effect.gen(function* () {
          const request = buildRequest(role, kind, protocol.model)
          const result = yield* Effect.either(protocol.from(request))
          // either a body, or InvalidRequestError from the guard; never a different failure,
          // and never a successful body that silently omits the part
        }))
    }
  }
}
```

`buildRequest` constructs one part of `kind` in `role` via `Message`, `Message.tool`, or `Message.system`, with a single user message first where the protocol needs history. The assertion is: `Either.isRight(result) || result.left.reason._tag === "InvalidRequestError"`. A throw from deeper in the mapper (e.g. a schema decode error, or `unsupportedContent` with the wrong role) fails the case, which is the point.

- [ ] **Step 2: Run it and triage**

Run: `bun test test/provider/lowering-conformance.test.ts --timeout 30000`

Expected initial failures are informative, not noise:
- A kind that yields an error other than `InvalidRequestError` means the guard does not cover it.
- A kind that yields a body but is declared unsupported means the policy is wrong.
- Report each; fix policies, never protocols, unless the guard genuinely does not run for that role.

- [ ] **Step 3: Commit**

```bash
git add packages/ai/test/provider/lowering-conformance.test.ts
git commit -m "test(ai): add cross-protocol lowering conformance"
```

---

## Stage 4 — Remaining integrations

### Task 11: Adopt `ToolResult` in the small protocols

**Files:**
- Modify: `cohere-chat.ts` (`L167-171`), `mistral-chat.ts` (`L293-320`), `anthropic-messages.ts` (`L812-819` tool-result content items)

**Interfaces:**
- Consumes: `ToolResult.plan`.
- Produces: the first three adoptions, including the only `reject` policy.

- [ ] **Step 1: Replace the split, keep placement**

Cohere: `plan("Cohere Chat", part, "reject")` before emitting the tool message; behaviour on files stays a typed failure with the same message.
Mistral: `plan(..., "allow")`, then keep its existing string-join/array shape.
Anthropic: `plan(..., "allow")` inside `lowerToolResultContentItem`, then map each text and each file to the same blocks as today.

- [ ] **Step 2: Run the three suites**

Run: `bun test test/provider/cohere.test.ts test/provider/mistral-chat.test.ts test/provider/anthropic-messages.test.ts --timeout 30000`
Expected: PASS. A message count change means placement was moved into the kit — revert that part.

- [ ] **Step 3: Commit**

```bash
git add packages/ai/src/protocols/cohere-chat.ts packages/ai/src/protocols/mistral-chat.ts packages/ai/src/protocols/anthropic-messages.ts
git commit -m "refactor(ai): adopt shared tool-result lowering"
```

### Task 12: Adopt `ToolResult` in the placement-heavy protocols

**Files:**
- Modify: `openai-chat.ts` (`L597-618`), `bedrock-converse.ts` (`L437-466`), `gemini.ts` (`L393-441`), `open-responses.ts` (`L793-801`), `google-interactions.ts` (its `lowerToolResult`)

**Interfaces:**
- Consumes: `ToolResult.plan`.
- Produces: complete tool-result consolidation.

- [ ] **Step 1: Replace the split, preserve each placement rule**

`openai-chat`: `plan(..., "allow")`, then its existing detach-to-`pendingAttachments` behaviour.
`bedrock`: `plan(..., "allow")`, then its existing per-model hoist/inline and `"See attached image."` placeholder.
`gemini`: `plan(..., "allow")`, then its existing nested-vs-deferred branch.
`open-responses`, `google-interactions`: same split, existing item construction.

- [ ] **Step 2: Run the five suites**

Run: `bun test test/provider/openai-chat.test.ts test/provider/bedrock-converse.test.ts test/provider/gemini.test.ts test/provider/open-responses-replay.test.ts test/provider/google-interactions.test.ts --timeout 30000`
Expected: PASS. In particular the Bedrock placeholder case and the Gemini 2.5 `fileData` case must produce byte-identical bodies.

- [ ] **Step 3: Commit**

```bash
git add packages/ai/src/protocols/openai-chat.ts packages/ai/src/protocols/bedrock-converse.ts packages/ai/src/protocols/gemini.ts packages/ai/src/protocols/open-responses.ts packages/ai/src/protocols/google-interactions.ts
git commit -m "refactor(ai): adopt shared tool-result lowering in placement-heavy protocols"
```

### Task 13: Adopt `ToolID`

**Files:**
- Modify: `openai-chat.ts` (`L673-683` and both call sites), `anthropic-messages.ts` (`L592` and call sites), `bedrock-converse.ts` (`L358`)

**Interfaces:**
- Consumes: `ToolID.forModel`, `ToolID.apply`.
- Produces: one id rule per protocol, applied symmetrically.

- [ ] **Step 1: Replace the call sites; delete the now-unused local helpers only after the tests pass**

Both the call-site and result-site must use the same policy instance for a request — bind it once per `fromRequest` invocation.

- [ ] **Step 2: Run the suites and the id characterization test**

Run: `bun test test/provider/lowering-ids.test.ts test/provider/openai-chat.test.ts test/provider/anthropic-messages.test.ts test/provider/bedrock-converse.test.ts test/provider/bedrock-mistral-ids.test.ts --timeout 30000`
Expected: PASS with identical ids, including the collision pair.

- [ ] **Step 3: Commit**

```bash
git add packages/ai/src/protocols/openai-chat.ts packages/ai/src/protocols/anthropic-messages.ts packages/ai/src/protocols/bedrock-converse.ts
git commit -m "refactor(ai): adopt shared tool-call id policy"
```

### Task 14: Adopt `Fields`

**Files:**
- Modify: `openai-chat.ts` (`L756-762`, `L848`)

**Interfaces:**
- Consumes: `Fields.hasToolHistory`, `Fields.parallelToolCalls`.
- Produces: one implementation of each decision.

- [ ] **Step 1: Replace the private helper and the guard; delete the private copies.**

`open-responses.ts` already re-exports `resolveParallelToolCalls` from Task 6; do not change its public name.

- [ ] **Step 2: Run the suites**

Run: `bun test test/provider/openai-chat.test.ts test/provider/open-responses-replay.test.ts test/provider/open-responses-finals.test.ts --timeout 30000`

- [ ] **Step 3: Commit**

```bash
git add packages/ai/src/protocols/openai-chat.ts
git commit -m "refactor(ai): adopt shared presence decisions"
```

---

## Stage 5 — Redundancy removal

### Task 15: Remove superseded code

**Files:**
- Modify: `openai-chat.ts`, `anthropic-messages.ts`, `bedrock-converse.ts`, `utils/mistral-tool-id.ts` (only if fully superseded)

- [ ] **Step 1: Delete only what is provably unused**

For each candidate, `git grep -n "<symbol>" -- packages/ai` must return no call site. `ProviderShared` helpers are **not** candidates; they are public.

- [ ] **Step 2: Run the full suite**

Run: `bun test --timeout 30000 --only-failures`
Expected: PASS, same failure count as baseline (zero).

- [ ] **Step 3: Commit**

```bash
git add -u packages/ai/src/protocols
git commit -m "refactor(ai): remove superseded lowering code"
```

---

## Stage 6 — Documentation

### Task 16: Record the boundary

**Files:**
- Modify: `packages/ai/AGENTS.md`

- [ ] **Step 1: Add one paragraph under Principles**

```markdown
**Protocol lowering keeps its loop.** Each protocol owns its message loop, merge rules, and wire blocks. Shared lowering is limited to pure decisions under `src/protocols/lowering/`: part capability, tool-result material, tool-call ids, and presence flags. Do not add a cross-family traversal engine: Bedrock's cache-point budget, Gemini's conditional merge, and the Interactions step model cannot be expressed behind one interface. Reuse across providers happens by composing an existing protocol.
```

- [ ] **Step 2: Commit**

```bash
git add packages/ai/AGENTS.md
git commit -m "docs(ai): record the protocol lowering boundary"
```

---

## Stage 7 — Final verification

### Task 17: Full verification

- [ ] **Step 1: Type checks**

```powershell
cd packages\ai
bun typecheck
bun run typecheck:tsc
```
Expected: both exit 0. `tsc` is the source of truth for declaration-emit errors.

- [ ] **Step 2: Full test suite**

```powershell
bun test --timeout 30000 --only-failures
```
Expected: PASS, zero failures. Compare the case count against the baseline recorded in Prerequisites.

- [ ] **Step 3: Repo-level checks**

```powershell
cd ..\..
bun run check
```
Expected: pass. If it fails, fix and rerun; do not weaken a check.

- [ ] **Step 4: Diff review**

```powershell
git diff --stat dev...HEAD
git diff dev...HEAD -- packages/ai/src/protocols/shared.ts
```
Expected: `shared.ts` has no diff. The stat shows one new directory, eight protocol files, one AGENTS.md, and test files.

- [ ] **Step 5: Confirm no public surface changed**

```powershell
git diff dev...HEAD -- packages/ai/package.json packages/ai/src/protocols/index.ts packages/ai/src/route
```
Expected: empty. If not empty, the change exceeded its boundary.

- [ ] **Step 6: Record the outcome in the PR/merge note**

State: bodies unchanged (N suites), conformance covering 9 protocol entries × 7 kinds × 4 roles, the one diagnostic-string change, and any divergence recorded but not fixed.

---

## Integration checkpoints

| After | Gate |
| --- | --- |
| Task 2 | Baseline green; current behaviour captured for the five Review Focus items |
| Task 6 | All four modules unit-tested; no caller changed yet; suite still green |
| Task 7 | One protocol migrated with zero test edits — the pattern is proven |
| Task 10 | Conformance passes for 9 entries; capability is now data |
| Task 12 | All tool-result placement rules preserved |
| Task 14 | All shared policies adopted; no behaviour change anywhere |
| Task 17 | Full green, `shared.ts` untouched, no public surface change |

## Validation commands (recap)

```powershell
cd packages\ai
bun test test/lowering/<module>.test.ts --timeout 30000
bun test test/provider/openai-chat.test.ts --timeout 30000
bun test --timeout 30000 --only-failures
bun typecheck
bun run typecheck:tsc

cd ..\..
bun run check
```

## Risk controls

| Risk | Control |
| --- | --- |
| A guard's policy array does not match its literal | Step 1 of every adoption task says: the existing literal is the source of truth; the suite catches any mismatch |
| Placement moves into the kit | Review Focus 3; Tasks 11 and 12 keep placement in the protocol and re-run the suites |
| Diagnostic-string change breaks a test | Spec §8.2 documents it; the only permitted test edit, noted in the commit body |
| Id consolidation changes a cassette | Task 2 pins ids before Task 13 changes call sites |
| Manifest drifts from behaviour | Guard reads the policy; conformance iterates every kind per role |
| A shared module grows into an engine | Spec §11 warning signs; any module importing a protocol is a review block |
| Upstream conflict | New directory; `shared.ts` untouched; protocol edits confined to guard/id/split lines |

## Rollback

Stages are independently revertible:

- **Tasks 3–6** add unused modules; revert by deleting the directory and tests. No behaviour depends on them.
- **Tasks 7–9** change guards only; `git revert` of one commit restores that protocol's literals with no interaction.
- **Tasks 11–14** change one concern each; revert individually.
- **Task 15** deletes code; revert restores it. This is the only stage where a revert could conflict, so land it last and alone.
- If the whole decision is abandoned, `git revert` the merge — the only lasting trace is the new directory, which nothing outside `protocols/` imports.

## Final completion criteria

- [ ] `packages/ai/src/protocols/lowering/` exists with four modules and an aggregator, each unit-tested.
- [ ] All eight bases declare a `ContentPolicy`; `openai-responses` is covered through its adapter path.
- [ ] Conformance passes for every kind × role × protocol entry.
- [ ] Tool-result splitting and tool-id normalisation each have one implementation.
- [ ] Every existing provider suite passes unmodified except the documented diagnostic string.
- [ ] `bun typecheck`, `bun run typecheck:tsc`, and `bun run check` pass.
- [ ] `shared.ts`, `package.json`, `protocols/index.ts`, and `route/` have no diff.
- [ ] `packages/ai/AGENTS.md` records the boundary.
- [ ] The five Review Focus behaviours are byte-identical to the Task 1 characterization.
