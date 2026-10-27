import { describe, expect, test } from "bun:test"
import { DateTime, Schema } from "effect"
import { Agent } from "@opencode/schema/agent"
import { Model } from "@opencode/schema/model"
import { Money } from "@opencode/schema/money"
import { Provider } from "@opencode/schema/provider"
import { Session } from "@opencode/schema/session"
import { SessionMessage } from "@opencode/schema/session-message"
import { SessionTransfer } from "@opencode/schema/session-transfer"
import type { TokenUsage } from "@opencode/schema/token-usage"
import { AbsolutePath } from "@opencode/core/schema"
import { SessionUsageReport } from "@opencode/core/session/usage-report"
import { SessionInbox } from "@opencode/core/session/inbox"
import { SessionEvent } from "@opencode/core/session/event"
import { Bus } from "@opencode/core/bus"
import { Database } from "@opencode/core/database/database"
import { Project } from "@opencode/core/project"
import { SessionProjector } from "@opencode/core/session/projector"
import { SessionStore } from "@opencode/core/session/store"
import { Session as SessionService } from "@opencode/core/session"
import { SessionTransfer as SessionTransferService } from "@opencode/core/session/transfer"
import { InstructionEntry } from "@opencode/core/session/instruction-entry"
import { SessionExecution } from "@opencode/core/session/execution"
import { LocationServiceMap } from "@opencode/core/location-service-map"
import { AppNodeBuilder } from "@opencode/core/effect/app-node-builder"
import { LayerNode } from "@opencode/util/effect/layer-node"
import { Effect } from "effect"
import { testEffect } from "./lib/effect"
import { globalProjectNode } from "./lib/project"
import { promptLocationNode } from "./fixture/prompt-location"
import { tmpdirScoped } from "./fixture/tmpdir"

const model = Model.Ref.make({
  id: Model.ID.make("model-a"),
  providerID: Provider.ID.make("provider-a"),
})
const deep = Model.Ref.make({
  id: Model.ID.make("model-a"),
  providerID: Provider.ID.make("provider-a"),
  variant: Model.VariantID.make("deep"),
})
const build = Agent.ID.make("build")

function tokens(input = 0, output = 0, reasoning = 0, read = 0, write = 0): TokenUsage.Info {
  return { input, output, reasoning, cache: { read, write } }
}

function session(input: {
  id: string
  created?: number
  parentID?: string
  fork?: boolean
  cost?: number
  tokens?: TokenUsage.Info
  revert?: boolean
}) {
  return Session.Info.make({
    id: Session.ID.make(input.id),
    ...(input.parentID ? { parentID: Session.ID.make(input.parentID) } : {}),
    ...(input.fork
      ? {
          fork: {
            sessionID: Session.ID.make(input.parentID ?? input.id),
            boundary: { type: "before", messageID: SessionMessage.ID.make("msg_fork_boundary") },
          },
        }
      : {}),
    ...(input.revert ? { revert: { messageID: SessionMessage.ID.make("msg_revert") } } : {}),
    projectID: Project.ID.make("project-a"),
    cost: Money.USD.make(input.cost ?? 0),
    tokens: input.tokens ?? tokens(),
    time: {
      created: DateTime.makeUnsafe(input.created ?? 1_000),
      updated: DateTime.makeUnsafe(input.created ?? 1_000),
    },
    location: { directory: AbsolutePath.make("/project") },
  })
}

function messageID(id: string) {
  return SessionMessage.ID.make(id)
}

function assistant(input: {
  id: string
  created?: number
  content?: ReadonlyArray<SessionMessage.AssistantContent>
  cost?: number
  tokens?: TokenUsage.Info
  retry?: number
  error?: boolean
  model?: Model.Ref
}) {
  return SessionMessage.Assistant.make({
    id: messageID(input.id),
    type: "assistant",
    agent: build,
    model: input.model ?? model,
    content: input.content ?? [],
    ...(input.cost === undefined ? {} : { cost: Money.USD.make(input.cost) }),
    ...(input.tokens === undefined ? {} : { tokens: input.tokens }),
    ...(input.retry === undefined
      ? {}
      : {
          retry: {
            attempt: input.retry,
            at: DateTime.makeUnsafe(2_000),
            error: { type: "provider", message: "retry" },
          },
        }),
    ...(input.error ? { error: { type: "provider", message: "failed" } } : {}),
    time: { created: DateTime.makeUnsafe(input.created ?? 1_000) },
  })
}

function user(id: string, text: string) {
  return SessionMessage.User.make({
    id: messageID(id),
    type: "user",
    text,
    time: { created: DateTime.makeUnsafe(1_000) },
  })
}

function compaction(input: {
  id: string
  status: "completed" | "failed"
  cost?: number
  tokens?: TokenUsage.Info
  model?: Model.Ref
  precomputed?: boolean
}) {
  const usage = {
    id: messageID(input.id),
    type: "compaction" as const,
    reason: "auto" as const,
    ...(input.cost === undefined ? {} : { cost: Money.USD.make(input.cost) }),
    ...(input.tokens === undefined ? {} : { tokens: input.tokens }),
    ...(input.precomputed ? { metadata: { precomputedUsed: true } } : {}),
    time: { created: DateTime.makeUnsafe(1_000) },
  }
  if (input.status === "failed")
    return SessionMessage.CompactionFailed.make({
      ...usage,
      status: "failed",
      error: { type: "compaction.failed", message: "no" },
    })
  return SessionMessage.CompactionCompleted.make({ ...usage, status: "completed", summary: "summary", model: input.model })
}

function tool(input: { id: string; name?: string; text: string; input?: Record<string, unknown>; truncated?: boolean }) {
  return SessionMessage.AssistantTool.make({
    type: "tool",
    id: input.id,
    name: input.name ?? "read",
    state: SessionMessage.ToolStateCompleted.make({
      status: "completed",
      input: input.input ?? { path: "/project/file.ts" },
      content: [{ type: "text", text: input.text }],
      ...(input.truncated ? { metadata: { truncated: true } } : {}),
    }),
    time: {
      created: DateTime.makeUnsafe(1_000),
      completed: DateTime.makeUnsafe(1_100),
    },
  })
}

function exportFile(
  info: Session.Info,
  messages: ReadonlyArray<SessionMessage.Info>,
  provenance?: ReadonlyMap<string, SessionUsageReport.Provenance>,
): SessionUsageReport.Export {
  return { ...SessionTransfer.Data.make({ info, messages }), provenance }
}

function run(input: {
  task_id?: string
  policy?: string
  root_session_id: string
  provider_requests?: number
  attribution_share?: number
  billing_verified?: boolean
  auxiliary_scope?: { title: boolean; warming: boolean }
}): SessionUsageReport.Run {
  return SessionUsageReport.Run.make({
    task_id: input.task_id ?? "task",
    policy: input.policy ?? "efficiency",
    root_session_id: Session.ID.make(input.root_session_id),
    ...(input.provider_requests === undefined ? {} : { provider_requests: input.provider_requests }),
    ...(input.attribution_share === undefined ? {} : { attribution_share: input.attribution_share }),
    ...(input.billing_verified === undefined ? {} : { billing_verified: input.billing_verified }),
    ...(input.auxiliary_scope === undefined ? {} : { auxiliary_scope: input.auxiliary_scope }),
  })
}

function report(input: {
  runs: ReadonlyArray<SessionUsageReport.Run>
  exports: ReadonlyArray<SessionUsageReport.Export>
}) {
  return SessionUsageReport.build(input)
}

describe("SessionUsageReport", () => {
  test("joins descendants once, excludes forks, and dedupes repeated exports", () => {
    const root = session({ id: "ses_root", cost: 1, tokens: tokens(10, 5, 2, 4, 1) })
    const child = session({
      id: "ses_child",
      parentID: "ses_root",
      created: 2_000,
      cost: 2,
      tokens: tokens(20, 10, 4, 8, 2),
    })
    const second = session({
      id: "ses_second",
      parentID: "ses_root",
      created: 3_000,
      cost: 3,
      tokens: tokens(30, 15, 6, 12, 3),
    })
    const fork = session({
      id: "ses_fork",
      parentID: "ses_root",
      created: 4_000,
      fork: true,
      cost: 100,
      tokens: tokens(1_000, 1_000, 1_000, 1_000, 1_000),
    })
    const value = report({
      runs: [run({ root_session_id: "ses_root", provider_requests: 3 })],
      exports: [
        exportFile(root, [assistant({ id: "msg_root", cost: 1, tokens: tokens(10, 5, 2, 4, 1) })]),
        exportFile(child, [assistant({ id: "msg_child", cost: 2, tokens: tokens(20, 10, 4, 8, 2) })]),
        exportFile(child, [assistant({ id: "msg_child", cost: 2, tokens: tokens(20, 10, 4, 8, 2) })]),
        exportFile(second, [assistant({ id: "msg_second", cost: 3, tokens: tokens(30, 15, 6, 12, 3) })]),
        exportFile(fork, [assistant({ id: "msg_fork", cost: 100, tokens: tokens(2_000, 0, 0, 0, 0) })]),
      ],
    })
    const result = value.runs[0]!
    expect(result.sessions.included).toBe(3)
    expect(result.sessions.ids.map(String)).toEqual(["ses_root", "ses_child", "ses_second"])
    expect(result.sessions.forks_excluded).toBe(1)
    expect(result.messages.included).toBe(3)
    expect(result.messages.duplicates_ignored).toBe(1)
    expect(value.inputs.duplicate_sessions).toBe(1)
    expect(result.tokens).toMatchObject({ input: 60, output: 30, reasoning: 12, cache: { read: 24, write: 6 } })
    expect(result.tokens.gross).toBe(132)
    expect(result.cost.total).toBe(6)
    expect(result.cost.legacy_unknown).toBe(6)
    expect(result.cost.unattributed).toBe(0)
    expect(result.completeness).toMatchObject({
      usage_complete: true,
      cost_complete: true,
      cost_reconciled: true,
      billing_verified: false,
    })
    expect(value.summary).toMatchObject({ runs: 1, tokens: 132, cost: 6, cost_reconciled: 1 })
  })

  test("keeps token categories additive and reports the session delta", () => {
    const info = session({ id: "ses_tokens", cost: 1, tokens: tokens(15, 8, 3, 5, 2) })
    const value = report({
      runs: [run({ root_session_id: "ses_tokens", provider_requests: 1 })],
      exports: [exportFile(info, [assistant({ id: "msg_tokens", cost: 1, tokens: tokens(10, 5, 3, 4, 1) })])],
    })
    const result = value.runs[0]!
    expect(result.tokens.gross).toBe(15 + 8 + 3 + 5 + 2)
    expect(result.tokens.gross).toBe(
      result.tokens.input +
        result.tokens.cache.read +
        result.tokens.cache.write +
        result.tokens.output +
        result.tokens.reasoning,
    )
    expect(result.tokens.delta).toEqual(tokens(5, 3, 0, 1, 1))
    expect(result.completeness.usage_complete).toBe(true)
    expect(result.cost.unattributed).toBe(0)
  })

  test("separates provider, estimated, legacy, and unpriced cost", () => {
    const info = session({ id: "ses_cost", cost: 6, tokens: tokens(6, 0, 0, 0, 0) })
    const value = report({
      runs: [run({ root_session_id: "ses_cost", provider_requests: 5 })],
      exports: [
        exportFile(
          info,
          [
            assistant({ id: "msg_provider", cost: 1, tokens: tokens(1) }),
            assistant({ id: "msg_zero", cost: 0, tokens: tokens(1) }),
            assistant({ id: "msg_estimated", cost: 2, tokens: tokens(1) }),
            assistant({ id: "msg_unpriced", cost: 0, tokens: tokens(1) }),
            assistant({ id: "msg_legacy", cost: 3, tokens: tokens(1) }),
          ],
          new Map([
            ["msg_provider", { provider: Money.USD.make(1) }],
            ["msg_zero", { provider: Money.USD.make(0) }],
            ["msg_estimated", { estimated: Money.USD.make(2) }],
            ["msg_unpriced", { unpriced: 1 }],
          ]),
        ),
      ],
    })
    const result = value.runs[0]!
    expect(result.cost).toMatchObject({
      provider: 1,
      estimated: 2,
      legacy_unknown: 3,
      unpriced_records: 1,
      unattributed: 0,
      total: 6,
      mixed: true,
    })
    expect(result.completeness.cost_complete).toBe(false)
    expect(result.completeness.cost_reconciled).toBe(false)
    expect(value.summary.unpriced_records).toBe(1)
  })

  test("treats a provider zero as authoritative and a matched zero estimate as estimated", () => {
    const zero = session({ id: "ses_zero", cost: 0 })
    const value = report({
      runs: [run({ root_session_id: "ses_zero", provider_requests: 1 })],
      exports: [
        exportFile(
          zero,
          [assistant({ id: "msg_zero", cost: 0, tokens: tokens(1) })],
          new Map([["msg_zero", { provider: Money.USD.make(0) }]]),
        ),
      ],
    })
    const result = value.runs[0]!
    expect(result.cost.unpriced_records).toBe(0)
    expect(result.cost.provider).toBe(0)
    expect(result.cost.estimated).toBe(0)
    expect(result.cost.mixed).toBe(false)
    expect(result.completeness.cost_complete).toBe(true)
    expect(result.completeness.cost_reconciled).toBe(true)

    const estimated = report({
      runs: [run({ root_session_id: "ses_zero", provider_requests: 1 })],
      exports: [
        exportFile(
          zero,
          [assistant({ id: "msg_zero", cost: 0, tokens: tokens(1) })],
          new Map([["msg_zero", { estimated: Money.USD.make(0) }]]),
        ),
      ],
    }).runs[0]!
    expect(estimated.cost.unpriced_records).toBe(0)
    expect(estimated.cost.estimated).toBe(0)
  })

  test("flags provenance amounts that do not sum to the stored cost", () => {
    const info = session({ id: "ses_mismatch", cost: 2, tokens: tokens(1) })
    const value = report({
      runs: [run({ root_session_id: "ses_mismatch", provider_requests: 1 })],
      exports: [
        exportFile(
          info,
          [assistant({ id: "msg_mismatch", cost: 2, tokens: tokens(1) })],
          new Map([["msg_mismatch", { provider: Money.USD.make(1) }]]),
        ),
      ],
    })
    const result = value.runs[0]!
    expect(result.cost.provenance_mismatches).toBe(1)
    expect(result.completeness.cost_complete).toBe(false)
  })

  test("parses single and batched manifests and rejects malformed runs", () => {
    const single = SessionUsageReport.parseManifest(
      JSON.stringify({ task_id: "one", policy: "efficiency", root_session_id: "ses_one" }),
    )
    expect(single).toHaveLength(1)
    expect(single[0]!.task_id).toBe("one")

    const batched = SessionUsageReport.parseManifest(
      JSON.stringify({
        runs: [
          { task_id: "a", policy: "efficiency", root_session_id: "ses_a" },
          { task_id: "b", policy: "quality", root_session_id: "ses_b", provider_requests: 2 },
        ],
      }),
    )
    expect(batched.map((run) => run.task_id)).toEqual(["a", "b"])

    expect(() => SessionUsageReport.parseManifest(JSON.stringify({ policy: "efficiency" }))).toThrow()
    expect(() => SessionUsageReport.parseManifest(JSON.stringify({ runs: [{ task_id: "x" }] }))).toThrow()
    expect(() => SessionUsageReport.parseManifest("{")).toThrow()
    expect(() =>
      SessionUsageReport.parseManifest(
        JSON.stringify({ task_id: "x", policy: "efficiency", root_session_id: "ses_x", correctness: "maybe" }),
      ),
    ).toThrow()
  })

  test("retains cost provenance fields the current message schema strips", () => {
    const info = session({ id: "ses_parse", cost: 1.5, tokens: tokens(2) })
    const data = SessionTransfer.Data.make({
      info,
      messages: [
        assistant({ id: "msg_parse", cost: 1, tokens: tokens(1) }),
        compaction({ id: "msg_parse_compaction", status: "completed", cost: 0.5, tokens: tokens(1) }),
      ],
    })
    const raw = JSON.parse(JSON.stringify(Schema.encodeSync(SessionTransfer.Data)(data))) as {
      messages: Array<Record<string, unknown>>
    }
    for (const message of raw.messages) {
      if (message.id === "msg_parse") message.costProvenance = { provider: 1 }
      if (message.id === "msg_parse_compaction") message.costProvenance = { estimated: 0.5 }
    }

    const parsed = SessionUsageReport.parseExports(JSON.stringify(raw))
    expect(parsed[0]!.provenance?.get("msg_parse")).toEqual({ provider: 1 })
    expect(parsed[0]!.provenance?.get("msg_parse_compaction")).toEqual({ estimated: 0.5 })

    const value = report({
      runs: [run({ root_session_id: "ses_parse", provider_requests: 2 })],
      exports: parsed,
    })
    expect(value.runs[0]!.cost).toMatchObject({ provider: 1, estimated: 0.5, total: 1.5, mixed: true })
    expect(value.runs[0]!.completeness.cost_reconciled).toBe(true)

    const batched = SessionUsageReport.parseExports(JSON.stringify([raw, raw]))
    expect(batched).toHaveLength(2)
    expect(() => SessionUsageReport.parseExports("null")).toThrow()
  })

  test("counts unsettled attempts and retries instead of treating them as zero", () => {
    const info = session({ id: "ses_attempts", cost: 1, tokens: tokens(1) })
    const value = report({
      runs: [run({ root_session_id: "ses_attempts", provider_requests: 5 })],
      exports: [
        exportFile(info, [
          assistant({ id: "msg_retried", cost: 1, tokens: tokens(1), retry: 3 }),
          assistant({ id: "msg_unsettled" }),
        ]),
      ],
    })
    const result = value.runs[0]!
    expect(result.attempts).toMatchObject({
      steps: 2,
      settled_steps: 1,
      unsettled_steps: 1,
      retries_observed: 2,
      settled_requests: 1,
      provider_requests: 5,
      without_settlement: 4,
      complete: false,
      source: "export+manifest",
    })
    expect(result.completeness.cost_complete).toBe(false)
    expect(result.completeness.action_complete).toBe(false)

    const unknown = report({
      runs: [run({ root_session_id: "ses_attempts" })],
      exports: [exportFile(info, [assistant({ id: "msg_retried", cost: 1, tokens: tokens(1) })])],
    }).runs[0]!
    expect(unknown.attempts.without_settlement).toBeNull()
    expect(unknown.attempts.complete).toBe(false)
    expect(unknown.attempts.source).toBe("export")
  })

  test("counts completed, failed, and reused precomputed compactions once", () => {
    const info = session({ id: "ses_compact", cost: 0.7, tokens: tokens(3, 1, 0, 1, 0) })
    const value = report({
      runs: [run({ root_session_id: "ses_compact", provider_requests: 2 })],
      exports: [
        exportFile(info, [
          compaction({
            id: "msg_compact",
            status: "completed",
            cost: 0.5,
            tokens: tokens(2, 1, 0, 1, 0),
            model: deep,
            precomputed: true,
          }),
          compaction({
            id: "msg_compact_failed",
            status: "failed",
            cost: 0.2,
            tokens: tokens(1, 0, 0, 0, 0),
          }),
          SessionMessage.CompactionRunning.make({
            id: messageID("msg_compact_running"),
            type: "compaction",
            status: "running",
            reason: "auto",
            summary: "running",
            time: { created: DateTime.makeUnsafe(1_500) },
          }),
        ]),
      ],
    })
    const result = value.runs[0]!
    expect(result.compactions).toEqual({ completed: 1, failed: 1, precomputed_reused: 1, without_usage: 0 })
    expect(result.attempts.settled_compactions).toBe(2)
    expect(result.attempts.settled_requests).toBe(2)
    expect(result.attempts.complete).toBe(true)
    expect(result.cost.total).toBe(0.7)
    expect(result.cost.unattributed).toBe(0)
    expect(result.completeness.cost_reconciled).toBe(true)
    expect(result.effort.by_effort).toEqual({ deep: 1, unknown: 1 })
  })

  test("reconstructs effective effort per request from exported messages", () => {
    const info = session({ id: "ses_effort", cost: 0, tokens: tokens(2) })
    const value = report({
      runs: [run({ root_session_id: "ses_effort", provider_requests: 2 })],
      exports: [
        exportFile(info, [
          assistant({ id: "msg_low", tokens: tokens(1), model: { ...model, variant: Model.VariantID.make("low") } }),
          assistant({ id: "msg_default", tokens: tokens(1) }),
        ]),
      ],
    })
    const result = value.runs[0]!
    expect(result.effort.by_effort).toEqual({ low: 1, default: 1 })
    expect(result.effort.requests).toMatchObject([
      { message_id: "msg_low", kind: "step", variant: "low", effective_effort: "low", usage_settled: true },
      { message_id: "msg_default", kind: "step", variant: null, effective_effort: "default", usage_settled: true },
    ])
  })

  test("ranks action exposure, repetition, and failure association without transcript content", () => {
    const info = session({ id: "ses_actions", cost: 1, tokens: tokens(20, 7, 9, 3, 0) })
    const value = report({
      runs: [run({ root_session_id: "ses_actions", provider_requests: 3, attribution_share: 0.5 })],
      exports: [
        exportFile(info, [
          user("msg_prompt", "SECRET PROMPT TEXT"),
          assistant({
            id: "msg_action",
            tokens: tokens(10, 0, 4, 0, 0),
            content: [
              tool({
                id: "call_action",
                text: "SECRET TOOL RESULT",
                input: { path: "/secret/path", query: "SECRET QUERY" },
                truncated: true,
              }),
            ],
          }),
          assistant({
            id: "msg_later",
            tokens: tokens(10, 7, 5, 3, 0),
            error: true,
          }),
          compaction({ id: "msg_compaction", status: "completed", cost: 1, tokens: tokens(1), model: deep }),
          assistant({ id: "msg_after_compaction", tokens: tokens(100, 100, 100, 0, 0) }),
        ]),
      ],
    })
    const result = value.runs[0]!
    const record = result.actions.records[0]!
    expect(record).toMatchObject({
      session_id: "ses_actions",
      message_id: "msg_action",
      call_id: "call_action",
      tool: "read",
      status: "completed",
      result_bytes_visible: "SECRET TOOL RESULT".length,
      result_bytes_full: null,
      truncated: true,
      token_estimate: Math.ceil("SECRET TOOL RESULT".length / 4),
      later_requests: 1,
      later_requests_with_usage: 1,
      later_input_tokens: 10,
      later_cache_read_tokens: 3,
      context_exposure_estimate: Math.ceil("SECRET TOOL RESULT".length / 4),
      request_reasoning: 4,
      associated_reasoning: 12,
      inferred_downstream_reasoning: 6,
      later_failed_requests: 1,
      occurrences: 1,
    })
    expect(result.actions.unresolved_truncation).toBe(1)
    expect(result.actions.complete).toBe(false)
    expect(result.actions.labels).toMatchObject({
      bytes: "measured",
      token_estimate: "estimated",
      downstream_reasoning: "associated",
      attribution: "inferred",
    })
    expect(result.actions.failure_ranking[0]).toMatchObject({ later_failed_requests: 1 })
    expect(result.completeness.action_complete).toBe(false)

    const json = JSON.stringify(value)
    expect(json).not.toContain("SECRET PROMPT TEXT")
    expect(json).not.toContain("SECRET TOOL RESULT")
    expect(json).not.toContain("/secret/path")
    expect(json).not.toContain("SECRET QUERY")
    expect(record.target_hash).toMatch(/^[0-9a-f]{16}$/)
  })

  test("does not impute an inferred reasoning share when attribution is unavailable", () => {
    const info = session({ id: "ses_no_share", cost: 1, tokens: tokens(2) })
    const value = report({
      runs: [run({ root_session_id: "ses_no_share", provider_requests: 1 })],
      exports: [
        exportFile(info, [
          assistant({ id: "msg_action", tokens: tokens(1, 0, 1), content: [tool({ id: "call", text: "ok" })] }),
          assistant({ id: "msg_later", tokens: tokens(1, 2, 3) }),
        ]),
      ],
    })
    const result = value.runs[0]!
    expect(result.actions.records[0]!.associated_reasoning).toBe(5)
    expect(result.actions.records[0]!.inferred_downstream_reasoning).toBeNull()
    expect(result.actions.exposure_ranking[0]!.inferred_downstream_reasoning).toBeNull()
    expect(result.actions.labels.attribution).toBe("unavailable")
  })

  test("marks reverted or missing coverage instead of reconciling it", () => {
    const reverted = session({ id: "ses_reverted", cost: 2, tokens: tokens(2), revert: true })
    const value = report({
      runs: [run({ root_session_id: "ses_reverted", provider_requests: 1 })],
      exports: [exportFile(reverted, [assistant({ id: "msg_reverted", cost: 2, tokens: tokens(2) })])],
    })
    const result = value.runs[0]!
    expect(result.completeness.reverted_activity).toBe(true)
    expect(result.completeness.cost_complete).toBe(false)
    expect(result.completeness.cost_reconciled).toBe(false)
    expect(result.completeness.action_complete).toBe(false)

    const missing = report({
      runs: [run({ root_session_id: "ses_missing", provider_requests: 1 })],
      exports: [],
    }).runs[0]!
    expect(missing.sessions.missing).toEqual(["ses_missing"])
    expect(missing.completeness.usage_complete).toBe(false)
    expect(missing.completeness.cost_complete).toBe(false)
    expect(missing.cost.total).toBe(0)
  })

  test("keeps failed and blocked correctness in the denominators", () => {
    const info = session({ id: "ses_failed", cost: 1, tokens: tokens(1) })
    const value = report({
      runs: [
        SessionUsageReport.Run.make({
          task_id: "failed",
          policy: "efficiency",
          root_session_id: Session.ID.make("ses_failed"),
          correctness: "fail",
          provider_requests: 1,
        }),
        SessionUsageReport.Run.make({
          task_id: "blocked",
          policy: "efficiency",
          root_session_id: Session.ID.make("ses_failed"),
          correctness: "blocked",
          provider_requests: 1,
        }),
      ],
      exports: [exportFile(info, [assistant({ id: "msg_failed", cost: 1, tokens: tokens(1) })])],
    })
    expect(value.summary.correctness).toEqual({ fail: 1, blocked: 1 })
    expect(value.summary.by_policy[0]).toMatchObject({ runs: 2, tokens: 2, cost: 2 })
  })

  test("writes a numeric CSV with escaped task identifiers", () => {
    const info = session({ id: "ses_csv", cost: 1, tokens: tokens(1) })
    const value = report({
      runs: [run({ task_id: 'task, "quoted"', root_session_id: "ses_csv", provider_requests: 1 })],
      exports: [exportFile(info, [assistant({ id: "msg_csv", cost: 1, tokens: tokens(1) })])],
    })
    const rows = SessionUsageReport.csv(value).trimEnd().split("\n")
    expect(rows[0]).toContain("cost_unattributed")
    expect(rows[0]).toContain("action_complete")
    expect(rows[1]).toContain('"task, ""quoted"""')
    expect(rows[1]).toContain('"efficiency"')
    expect(rows[1]).toContain('"ses_csv",1,0,0,1,0,1,')
    expect(rows[1]).toContain(",true,true,true,false,false,true,")
  })
})

const it = testEffect(
  AppNodeBuilder.build(
    LayerNode.group([
      Database.node,
      Bus.node,
      SessionProjector.node,
      SessionStore.node,
      SessionService.node,
      SessionTransferService.node,
      InstructionEntry.node,
    ]),
    [
      Bus.node.replace(Bus.configured({ persist: true })),
      Project.node.replace(globalProjectNode),
      LocationServiceMap.node.replace(promptLocationNode),
      SessionExecution.node.replace(SessionExecution.noopLayer),
    ],
  ),
)

describe("SessionUsageReport integration", () => {
  it.effect("analyzes a real temporary session export without leaking content", () =>
    Effect.gen(function* () {
      yield* tmpdirScoped()
      const session = yield* SessionService.Service
      const transfer = yield* SessionTransferService.Service
      const bus = yield* Bus.Service
      const { db } = yield* Database.Service
      const location = { directory: AbsolutePath.make("/report-project") }
      const source = yield* session.create({ location })
      yield* session.prompt({ sessionID: source.id, text: "SECRET INTEGRATION PROMPT", resume: false })
      yield* SessionInbox.promote(db, bus, source.id, "steer")
      const assistantID = SessionMessage.ID.create()
      yield* bus.publish(SessionEvent.Step.Started, {
        sessionID: source.id,
        assistantMessageID: assistantID,
        agent: build,
        model,
        started: 0,
      })
      yield* bus.publish(SessionEvent.Step.Ended, {
        sessionID: source.id,
        assistantMessageID: assistantID,
        finish: "stop",
        cost: Money.USD.make(0.25),
        tokens: tokens(10, 4, 2, 3, 1),
      })

      const exported = yield* transfer.export({ sessionID: source.id })
      const value = report({
        runs: [
          run({
            task_id: "integration",
            root_session_id: source.id,
            provider_requests: 1,
            auxiliary_scope: { title: false, warming: false },
          }),
        ],
        exports: [exported],
      })
      const result = value.runs[0]!
      expect(result.messages.included).toBe(2)
      expect(result.tokens.gross).toBe(10 + 4 + 2 + 3 + 1)
      expect(result.cost.total).toBe(0.25)
      expect(result.cost.legacy_unknown).toBe(0.25)
      expect(result.cost.unattributed).toBe(0)
      expect(result.completeness).toMatchObject({
        usage_complete: true,
        cost_complete: true,
        cost_reconciled: true,
        action_complete: true,
      })
      expect(result.attempts.complete).toBe(true)
      expect(JSON.stringify(value)).not.toContain("SECRET INTEGRATION PROMPT")
    }),
  )
})
