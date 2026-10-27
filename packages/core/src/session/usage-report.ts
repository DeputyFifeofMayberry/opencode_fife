export * as SessionUsageReport from "./usage-report.js"

import { createHash } from "node:crypto"
import { DateTime, Option, Schema } from "effect"
import { Money } from "@opencode/schema/money"
import { NonNegativeInt, optional } from "@opencode/schema/schema"
import { Session } from "@opencode/schema/session"
import { SessionTransfer } from "@opencode/schema/session-transfer"
import { SessionMessage } from "@opencode/schema/session-message"
import type { TokenUsage } from "@opencode/schema/token-usage"

/**
 * A session export plus the cost provenance stripped by the current message schema. Provenance is read from the
 * export JSON when present, so this ledger works before and after cost provenance is persisted.
 */
export interface Export {
  readonly info: SessionTransfer.Data["info"]
  readonly messages: SessionTransfer.Data["messages"]
  readonly provenance?: ReadonlyMap<string, Provenance>
}

export interface Provenance extends Schema.Schema.Type<typeof Provenance> {}
/** Forward-compatible shape of the optional provenance field carried by newer session exports. */
export const Provenance = Schema.Struct({
  provider: Money.USD.pipe(optional),
  estimated: Money.USD.pipe(optional),
  unpriced: NonNegativeInt.pipe(optional),
}).annotate({ identifier: "SessionUsageReport.CostProvenance" })

export interface Run extends Schema.Schema.Type<typeof Run> {}
export const Run = Schema.Struct({
  task_id: Schema.String,
  policy: Schema.String,
  root_session_id: Session.ID,
  correctness: Schema.Literals(["pass", "fail", "blocked", "timeout"]).pipe(optional),
  stratum: Schema.String.pipe(optional),
  provider: Schema.String.pipe(optional),
  model: Schema.String.pipe(optional),
  requested_variant: Schema.String.pipe(optional),
  cache_condition: Schema.String.pipe(optional),
  repetition: NonNegativeInt.pipe(optional),
  repository: Schema.String.pipe(optional),
  /**
   * Provider attempts the harness observed for the exported task requests, including failed attempts that produced
   * no settled usage. Count the same requests the export can settle: task steps and compactions, not title or
   * warming calls, which belong in `auxiliary_scope`.
   */
  provider_requests: NonNegativeInt.pipe(optional),
  /** Declared share of downstream reasoning attributed to an action; attribution stays inferred. */
  attribution_share: Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 1 })).pipe(optional),
  auxiliary_scope: Schema.Struct({ title: Schema.Boolean, warming: Schema.Boolean }).pipe(optional),
  billing_verified: Schema.Boolean.pipe(optional),
}).annotate({ identifier: "SessionUsageReport.Run" })

export const Manifest = Schema.Union([Run, Schema.Struct({ runs: Schema.Array(Run) })]).annotate({
  identifier: "SessionUsageReport.Manifest",
})

const ExportFile = Schema.Union([SessionTransfer.Data, Schema.Array(SessionTransfer.Data)])
const RawExport = Schema.Struct({
  messages: Schema.Array(
    Schema.Struct({
      id: SessionMessage.ID,
      costProvenance: Provenance.pipe(optional),
    }),
  ),
})

const bytesPerToken = 4
const epsilon = 1e-9
const decodeJson = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Unknown))

type Cost = {
  provider: number
  estimated: number
  legacy_unknown: number
  unpriced_records: number
  unattributed: number
  total: number
  provenance_mismatches: number
}

type Action = {
  session_id: string
  message_id: string
  call_id: string
  tool: string
  target_hash: string
  status: "completed" | "error"
  result_bytes_visible: number
  result_bytes_full: number | null
  truncated: boolean
  token_estimate: number
  later_requests: number
  later_requests_with_usage: number
  later_input_tokens: number
  later_cache_read_tokens: number
  context_exposure_estimate: number
  request_reasoning: number | null
  associated_reasoning: number | null
  later_failed_requests: number
}

type EffortRequest = {
  session_id: string
  message_id: string
  kind: "step" | "compaction"
  source: "assistant_message" | "compaction_message"
  provider_id: string | null
  model_id: string | null
  variant: string | null
  effective_effort: string
  usage_settled: boolean
}

/** Parses a run manifest: either one run or an object with a `runs` array. */
export function parseManifest(text: string) {
  const decoded = Schema.decodeUnknownSync(Manifest)(decodeJson(text))
  return "runs" in decoded ? decoded.runs : [decoded]
}

/** Parses one session export or an array of them, retaining provenance fields the current message schema omits. */
export function parseExports(text: string) {
  const raw = decodeJson(text)
  const files = Schema.decodeUnknownSync(ExportFile)(raw)
  const decoded = Array.isArray(files) ? files : [files]
  const rawFiles: ReadonlyArray<unknown> = Array.isArray(raw) ? raw : [raw]
  return decoded.map((file, index) => ({ ...file, provenance: readProvenance(rawFiles[index]) }))
}

/**
 * Builds a numeric-only ledger from run manifests and pre-revert session exports. Descendants are joined through
 * `parentID` once, forks are excluded, and session aggregates stay authoritative for spend so title usage and
 * reverted messages remain visible as an unattributed amount instead of being imputed as zero.
 */
export function build(input: { readonly runs: readonly Run[]; readonly exports: readonly Export[] }) {
  const indexed = indexExports(input.exports)
  const runs = input.runs.map((run) => analyzeRun(run, indexed))
  return {
    version: 1 as const,
    inputs: {
      exports: input.exports.length,
      sessions: indexed.byID.size,
      duplicate_sessions: indexed.duplicate_sessions,
      duplicate_messages: indexed.duplicate_messages,
    },
    runs,
    summary: summarize(runs),
  }
}

export function csv(value: ReturnType<typeof build>) {
  const header = [
    "task_id",
    "policy",
    "correctness",
    "root_session_id",
    "sessions",
    "sessions_missing",
    "forks_excluded",
    "messages",
    "messages_duplicate",
    "tokens_input",
    "tokens_output",
    "tokens_reasoning",
    "tokens_cache_read",
    "tokens_cache_write",
    "tokens_gross",
    "tokens_unattributed",
    "cost_total",
    "cost_provider",
    "cost_estimated",
    "cost_legacy_unknown",
    "cost_unattributed",
    "unpriced_records",
    "provenance_mismatches",
    "usage_complete",
    "cost_complete",
    "cost_reconciled",
    "billing_verified",
    "reverted_activity",
    "action_complete",
    "attempts_without_settlement",
    "actions",
    "unresolved_truncation",
  ]
  const rows = value.runs.map((run) =>
    [
      run.task_id,
      run.policy,
      run.correctness,
      run.root_session_id,
      run.sessions.included,
      run.sessions.missing.length,
      run.sessions.forks_excluded,
      run.messages.included,
      run.messages.duplicates_ignored,
      run.tokens.input,
      run.tokens.output,
      run.tokens.reasoning,
      run.tokens.cache.read,
      run.tokens.cache.write,
      run.tokens.gross,
      gross(run.tokens.delta),
      run.cost.total,
      run.cost.provider,
      run.cost.estimated,
      run.cost.legacy_unknown,
      run.cost.unattributed,
      run.cost.unpriced_records,
      run.cost.provenance_mismatches,
      run.completeness.usage_complete,
      run.completeness.cost_complete,
      run.completeness.cost_reconciled,
      run.completeness.billing_verified,
      run.completeness.reverted_activity,
      run.completeness.action_complete,
      run.attempts.without_settlement ?? "",
      run.actions.records.length,
      run.actions.unresolved_truncation,
    ].map(cell),
  )
  return [header.join(","), ...rows.map((row) => row.join(","))].join("\n") + "\n"
}

function analyzeRun(run: Run, indexed: Index) {
  const graph = joinGraph(run.root_session_id, indexed)
  const messages = graph.sessions.flatMap((session) =>
    session.messages.map((message) => ({ sessionID: session.info.id, message })),
  )
  const totals = aggregateUsage(messages, indexed)
  const tokens = sessionTokens(graph.sessions)
  const cost = analyzeCost(graph.sessions, totals.cost)
  const attempts = analyzeAttempts(messages, run.provider_requests)
  const reverted = graph.sessions.some((session) => session.info.revert !== undefined)
  const tokenDelta = subtract(tokens, totals.tokens)
  const actions = analyzeActions(graph.sessions, run.attribution_share)
  const usageComplete =
    graph.missing_sessions.length === 0 &&
    totals.missing_tokens === 0 &&
    tokenDelta.input >= 0 &&
    tokenDelta.output >= 0 &&
    tokenDelta.reasoning >= 0 &&
    tokenDelta.cache.read >= 0 &&
    tokenDelta.cache.write >= 0
  const costComplete =
    attempts.complete &&
    cost.unpriced_records === 0 &&
    cost.provenance_mismatches === 0 &&
    cost.unattributed >= 0 &&
    !reverted &&
    graph.missing_sessions.length === 0
  const costReconciled = costComplete && cost.unattributed === 0
  const completeness = {
    usage_complete: usageComplete,
    cost_complete: costComplete,
    cost_reconciled: costReconciled,
    billing_verified: run.billing_verified === true,
    reverted_activity: reverted,
    action_complete:
      actions.complete &&
      !reverted &&
      attempts.unsettled_steps === 0 &&
      graph.missing_sessions.length === 0 &&
      totals.missing_tokens === 0,
  }

  return {
    task_id: run.task_id,
    policy: run.policy,
    correctness: run.correctness ?? "unknown",
    stratum: run.stratum ?? null,
    repository: run.repository ?? null,
    repetition: run.repetition ?? null,
    cache_condition: run.cache_condition ?? null,
    provider: run.provider ?? null,
    model: run.model ?? null,
    requested_variant: run.requested_variant ?? null,
    root_session_id: run.root_session_id,
    outcome: outcome(graph.sessions, run.root_session_id),
    auxiliary_scope: run.auxiliary_scope ?? { title: true, warming: false },
    sessions: {
      included: graph.sessions.length,
      ids: graph.sessions.map((session) => session.info.id),
      missing: graph.missing_sessions,
      forks_excluded: graph.forks_excluded,
    },
    messages: {
      included: messages.length,
      duplicates_ignored: graph.sessions.reduce((total, session) => total + session.duplicates, 0),
    },
    tokens: {
      ...tokens,
      gross: gross(tokens),
      delta: tokenDelta,
    },
    cost: {
      ...cost,
      mixed: cost.provider > 0 && cost.estimated > 0,
    },
    completeness,
    attempts,
    compactions: analyzeCompactions(messages),
    effort: analyzeEffort(messages),
    actions,
  }
}

type IndexedSession = {
  info: SessionTransfer.Data["info"]
  messages: ReadonlyArray<SessionMessage.Info>
  provenance: ReadonlyMap<string, Provenance> | undefined
  duplicates: number
}

type Index = {
  byID: Map<string, IndexedSession>
  duplicate_sessions: number
  duplicate_messages: number
}

function indexExports(exports: ReadonlyArray<Export>): Index {
  const byID = new Map<string, IndexedSession>()
  let duplicate_sessions = 0
  let duplicate_messages = 0
  for (const file of exports) {
    const existing = byID.get(file.info.id)
    if (existing) {
      duplicate_sessions++
      const added = dedupeMessages([...existing.messages, ...file.messages])
      const duplicates = existing.messages.length + file.messages.length - added.length
      duplicate_messages += duplicates
      byID.set(file.info.id, {
        info: existing.info,
        messages: added,
        provenance: mergeProvenance(existing.provenance, file.provenance),
        duplicates: existing.duplicates + duplicates,
      })
      continue
    }
    const messages = dedupeMessages(file.messages)
    const duplicates = file.messages.length - messages.length
    duplicate_messages += duplicates
    byID.set(file.info.id, { info: file.info, messages, provenance: file.provenance, duplicates })
  }
  return { byID, duplicate_sessions, duplicate_messages }
}

function mergeProvenance(
  a: ReadonlyMap<string, Provenance> | undefined,
  b: ReadonlyMap<string, Provenance> | undefined,
) {
  if (a === undefined) return b
  if (b === undefined) return a
  return new Map([...a, ...b])
}

function dedupeMessages(messages: ReadonlyArray<SessionMessage.Info>) {
  const seen = new Set<string>()
  return messages.filter((message) => {
    if (seen.has(message.id)) return false
    seen.add(message.id)
    return true
  })
}

function joinGraph(rootID: string, indexed: Index) {
  const sessions: IndexedSession[] = []
  const missing_sessions: string[] = []
  const visited = new Set<string>()
  let forks_excluded = 0
  const queue = [rootID]
  while (queue.length > 0) {
    const id = queue.shift()
    if (id === undefined || visited.has(id)) continue
    visited.add(id)
    const session = indexed.byID.get(id)
    if (!session) {
      missing_sessions.push(id)
      continue
    }
    if (id !== rootID && session.info.fork !== undefined) {
      forks_excluded++
      continue
    }
    sessions.push(session)
    for (const [childID, child] of indexed.byID) {
      if (child.info.parentID !== id) continue
      if (child.info.fork !== undefined) {
        forks_excluded++
        continue
      }
      queue.push(childID)
    }
  }
  sessions.sort(
    (a, b) =>
      DateTime.toEpochMillis(a.info.time.created) - DateTime.toEpochMillis(b.info.time.created) ||
      a.info.id.localeCompare(b.info.id),
  )
  return { sessions, missing_sessions, forks_excluded }
}

function sessionTokens(sessions: ReadonlyArray<IndexedSession>): TokenUsage.Info {
  return sessions.reduce(
    (total, session) => ({
      input: total.input + session.info.tokens.input,
      output: total.output + session.info.tokens.output,
      reasoning: total.reasoning + session.info.tokens.reasoning,
      cache: {
        read: total.cache.read + session.info.tokens.cache.read,
        write: total.cache.write + session.info.tokens.cache.write,
      },
    }),
    { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
  )
}

function aggregateUsage(
  messages: ReadonlyArray<{ sessionID: string; message: SessionMessage.Info }>,
  indexed: Index,
) {
  const tokens = { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }
  const cost: Cost = {
    provider: 0,
    estimated: 0,
    legacy_unknown: 0,
    unpriced_records: 0,
    unattributed: 0,
    total: 0,
    provenance_mismatches: 0,
  }
  let missing_tokens = 0
  for (const { sessionID, message } of messages) {
    const settled = settledUsage(message, indexed.byID.get(sessionID)?.provenance)
    if (!settled) continue
    if (settled.tokens === undefined) missing_tokens++
    if (settled.tokens) {
      tokens.input += settled.tokens.input
      tokens.output += settled.tokens.output
      tokens.reasoning += settled.tokens.reasoning
      tokens.cache.read += settled.tokens.cache.read
      tokens.cache.write += settled.tokens.cache.write
    }
    if (settled.cost === undefined) {
      cost.unpriced_records++
      continue
    }
    cost.total += settled.cost
    if (!settled.provenance) {
      cost.legacy_unknown += settled.cost
      continue
    }
    const provider = settled.provenance.provider ?? 0
    const estimated = settled.provenance.estimated ?? 0
    if (settled.provenance.provider !== undefined) cost.provider += provider
    if (settled.provenance.estimated !== undefined) cost.estimated += estimated
    if (settled.provenance.unpriced !== undefined) cost.unpriced_records += settled.provenance.unpriced
    if (settled.provenance.provider === undefined && settled.provenance.estimated === undefined) {
      if (settled.provenance.unpriced === undefined) cost.legacy_unknown += settled.cost
    }
    if (Math.abs(provider + estimated - settled.cost) > epsilon) {
      cost.provenance_mismatches++
    }
  }
  return { tokens, cost, missing_tokens }
}

function settledUsage(message: SessionMessage.Info, provenance: ReadonlyMap<string, Provenance> | undefined) {
  if (message.type === "assistant") {
    if (message.tokens === undefined && message.cost === undefined) return undefined
    return { tokens: message.tokens, cost: message.cost, provenance: provenance?.get(message.id) }
  }
  if (message.type === "compaction") {
    if (message.status === "running") return undefined
    if (message.tokens === undefined && message.cost === undefined) return undefined
    return { tokens: message.tokens, cost: message.cost, provenance: provenance?.get(message.id) }
  }
  return undefined
}

function analyzeCost(sessions: ReadonlyArray<IndexedSession>, messageCost: Cost): Cost {
  const total = usd(sessions.reduce((sum, session) => sum + session.info.cost, 0))
  return {
    ...messageCost,
    provider: usd(messageCost.provider),
    estimated: usd(messageCost.estimated),
    legacy_unknown: usd(messageCost.legacy_unknown),
    unattributed: usd(total - messageCost.total),
    total,
  }
}

function analyzeAttempts(
  messages: ReadonlyArray<{ sessionID: string; message: SessionMessage.Info }>,
  providerRequests: number | undefined,
) {
  let steps = 0
  let settledSteps = 0
  let unsettledSteps = 0
  let settledCompactions = 0
  let retriesObserved = 0
  for (const { message } of messages) {
    if (message.type === "compaction" && settledUsage(message, undefined)) {
      settledCompactions++
      continue
    }
    if (message.type !== "assistant") continue
    steps++
    retriesObserved += (message.retry?.attempt ?? 1) - 1
    if (message.tokens !== undefined || message.cost !== undefined) {
      settledSteps++
      continue
    }
    unsettledSteps++
  }
  const settledRequests = settledSteps + settledCompactions
  const withoutSettlement = providerRequests === undefined ? null : providerRequests - settledRequests
  return {
    steps,
    settled_steps: settledSteps,
    unsettled_steps: unsettledSteps,
    settled_compactions: settledCompactions,
    retries_observed: retriesObserved,
    settled_requests: settledRequests,
    provider_requests: providerRequests ?? null,
    without_settlement: withoutSettlement,
    complete: withoutSettlement === 0,
    source: providerRequests === undefined ? "export" : "export+manifest",
  }
}

function analyzeCompactions(messages: ReadonlyArray<{ sessionID: string; message: SessionMessage.Info }>) {
  let completed = 0
  let failed = 0
  let precomputed_reused = 0
  let without_usage = 0
  for (const { message } of messages) {
    if (message.type !== "compaction" || message.status === "running") continue
    if (message.status === "completed") completed++
    if (message.status === "failed") failed++
    if (message.metadata?.precomputedUsed === true) precomputed_reused++
    if (message.tokens === undefined && message.cost === undefined) without_usage++
  }
  return { completed, failed, precomputed_reused, without_usage }
}

function analyzeEffort(messages: ReadonlyArray<{ sessionID: string; message: SessionMessage.Info }>) {
  const requests: EffortRequest[] = []
  for (const { sessionID, message } of messages) {
    if (message.type === "assistant") {
      requests.push({
        session_id: sessionID,
        message_id: message.id,
        kind: "step",
        source: "assistant_message",
        provider_id: message.model.providerID,
        model_id: message.model.id,
        variant: message.model.variant ?? null,
        effective_effort: message.model.variant ?? "default",
        usage_settled: message.tokens !== undefined || message.cost !== undefined,
      })
      continue
    }
    if (message.type !== "compaction" || message.status === "running") continue
    const model = message.status === "completed" ? message.model : undefined
    requests.push({
      session_id: sessionID,
      message_id: message.id,
      kind: "compaction",
      source: "compaction_message",
      provider_id: model?.providerID ?? null,
      model_id: model?.id ?? null,
      variant: model?.variant ?? null,
      effective_effort: model === undefined ? "unknown" : (model.variant ?? "default"),
      usage_settled: message.tokens !== undefined || message.cost !== undefined,
    })
  }
  const by_effort: Record<string, number> = {}
  for (const request of requests) {
    by_effort[request.effective_effort] = (by_effort[request.effective_effort] ?? 0) + 1
  }
  return { requests, by_effort }
}

function analyzeActions(sessions: ReadonlyArray<IndexedSession>, attributionShare: number | undefined) {
  const actions: Action[] = []
  for (const session of sessions) {
    const messages = session.messages
    for (const [index, message] of messages.entries()) {
      if (message.type !== "assistant") continue
      for (const item of message.content) {
        if (item.type !== "tool") continue
        if (item.state.status !== "completed" && item.state.status !== "error") continue
        const text = (item.state.content ?? [])
          .flatMap((content) => (content.type === "text" ? [content.text] : []))
          .join("\n")
        const visible = byteLength(text)
        const truncated = item.state.metadata?.truncated === true
        const later = messages.slice(index + 1, compactedAt(messages, index))
        actions.push({
          session_id: session.info.id,
          message_id: message.id,
          call_id: item.id,
          tool: item.name,
          target_hash: actionKey(item.name, item.state.input),
          status: item.state.status,
          result_bytes_visible: visible,
          result_bytes_full: truncated ? null : visible,
          truncated,
          token_estimate: Math.ceil(visible / bytesPerToken),
          later_requests: later.filter((message) => message.type === "assistant").length,
          later_requests_with_usage: later.filter(
            (message) =>
              message.type === "assistant" && (message.tokens !== undefined || message.cost !== undefined),
          ).length,
          later_input_tokens: sumUsage(later, "input"),
          later_cache_read_tokens: sumUsage(later, "cache"),
          context_exposure_estimate:
            Math.ceil(visible / bytesPerToken) * later.filter((message) => message.type === "assistant").length,
          request_reasoning: message.tokens?.reasoning ?? null,
          associated_reasoning: associatedReasoning(later),
          later_failed_requests: later.filter(
            (message) => message.type === "assistant" && message.error !== undefined,
          ).length,
        })
      }
    }
  }
  const occurrences = new Map<string, number>()
  for (const action of actions) {
    occurrences.set(action.target_hash, (occurrences.get(action.target_hash) ?? 0) + 1)
  }
  const unresolved_truncation = actions.filter((action) => action.result_bytes_full === null).length
  return {
    labels: {
      bytes: "measured",
      token_estimate: "estimated",
      context_exposure: "estimated",
      request_reasoning: "observed",
      downstream_reasoning: "associated",
      cache_split: "inferred",
      failure_association: "associated",
      attribution: attributionShare === undefined ? "unavailable" : "inferred",
    },
    complete: unresolved_truncation === 0,
    unresolved_truncation,
    records: actions.map((action) => ({
      ...action,
      occurrences: occurrences.get(action.target_hash) ?? 1,
      inferred_downstream_reasoning:
        attributionShare === undefined || action.associated_reasoning === null
          ? null
          : Math.round(attributionShare * action.associated_reasoning),
    })),
    ...rank(actions, attributionShare),
  }
}

function rank(actions: ReadonlyArray<Action>, share: number | undefined) {
  const groups = new Map<string, ReturnType<typeof emptyRank>>()
  for (const action of actions) {
    const group = groups.get(action.target_hash) ?? emptyRank(action.tool, action.target_hash)
    group.occurrences += 1
    group.context_exposure_estimate += action.context_exposure_estimate
    group.result_bytes_visible += action.result_bytes_visible
    group.later_requests += action.later_requests
    group.later_input_tokens += action.later_input_tokens
    group.later_cache_read_tokens += action.later_cache_read_tokens
    group.associated_reasoning += action.associated_reasoning ?? 0
    if (action.associated_reasoning === null) group.associated_reasoning_missing += 1
    group.later_failed_requests += action.later_failed_requests
    group.error_actions += action.status === "error" ? 1 : 0
    groups.set(action.target_hash, group)
  }
  const entries = [...groups.values()].map((group) => ({
    ...group,
    inferred_downstream_reasoning:
      share === undefined || group.associated_reasoning_missing > 0
        ? null
        : Math.round(share * group.associated_reasoning),
  }))
  return {
    exposure_ranking: entries.toSorted(
      (a, b) => b.context_exposure_estimate - a.context_exposure_estimate || a.key.localeCompare(b.key),
    ),
    repetition_ranking: entries.toSorted((a, b) => b.occurrences - a.occurrences || a.key.localeCompare(b.key)),
    failure_ranking: entries.toSorted(
      (a, b) =>
        b.later_failed_requests + b.error_actions - (a.later_failed_requests + a.error_actions) ||
        a.key.localeCompare(b.key),
    ),
  }
}

function emptyRank(tool: string, targetHash: string) {
  return {
    key: `${tool}:${targetHash}`,
    tool,
    target_hash: targetHash,
    occurrences: 0,
    context_exposure_estimate: 0,
    result_bytes_visible: 0,
    later_requests: 0,
    later_input_tokens: 0,
    later_cache_read_tokens: 0,
    associated_reasoning: 0,
    associated_reasoning_missing: 0,
    later_failed_requests: 0,
    error_actions: 0,
  }
}

function compactedAt(messages: ReadonlyArray<SessionMessage.Info>, index: number) {
  const next = messages.findIndex(
    (message, candidate) => candidate > index && message.type === "compaction" && message.status === "completed",
  )
  return next === -1 ? messages.length : next
}

function sumUsage(messages: ReadonlyArray<SessionMessage.Info>, field: "input" | "cache") {
  return messages.reduce((total, message) => {
    if (message.type !== "assistant" || message.tokens === undefined) return total
    return total + (field === "input" ? message.tokens.input : message.tokens.cache.read)
  }, 0)
}

function associatedReasoning(messages: ReadonlyArray<SessionMessage.Info>) {
  const available = messages.filter(
    (message): message is Extract<SessionMessage.Info, { type: "assistant" }> & { tokens: TokenUsage.Info } =>
      message.type === "assistant" && message.tokens !== undefined,
  )
  if (available.length === 0) return null
  return available.reduce((total, message) => total + message.tokens.reasoning + message.tokens.output, 0)
}

function actionKey(tool: string, input: Readonly<Record<string, unknown>>) {
  return createHash("sha256").update(`${tool}\n${stable(input)}`).digest("hex").slice(0, 16)
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`
  if (value !== null && typeof value === "object")
    return `{${Object.keys(value)
      .toSorted()
      .map((key) => `${JSON.stringify(key)}:${stable((value as Record<string, unknown>)[key])}`)
      .join(",")}}`
  return JSON.stringify(value) ?? "null"
}

function byteLength(value: string) {
  return new TextEncoder().encode(value).length
}

function outcome(sessions: ReadonlyArray<IndexedSession>, rootID: string) {
  const root = sessions.find((session) => session.info.id === rootID)
  if (!root) return null
  return root.messages.findLast((message) => message.type === "idle")?.outcome ?? null
}

function gross(tokens: TokenUsage.Info) {
  return tokens.input + tokens.output + tokens.reasoning + tokens.cache.read + tokens.cache.write
}

function usd(value: number) {
  return Math.round(value * 1e8) / 1e8
}

function subtract(a: TokenUsage.Info, b: TokenUsage.Info): TokenUsage.Info {
  return {
    input: a.input - b.input,
    output: a.output - b.output,
    reasoning: a.reasoning - b.reasoning,
    cache: { read: a.cache.read - b.cache.read, write: a.cache.write - b.cache.write },
  }
}

function summarize(runs: ReturnType<typeof analyzeRun>[]) {
  const byPolicy = new Map<string, ReturnType<typeof emptySummary>>()
  for (const run of runs) {
    const entry = byPolicy.get(run.policy) ?? emptySummary(run.policy)
    entry.runs++
    entry.tokens += run.tokens.gross
    entry.cost += run.cost.total
    entry.unattributed += run.cost.unattributed
    entry.actions += run.actions.records.length
    entry.correctness[run.correctness] = (entry.correctness[run.correctness] ?? 0) + 1
    entry.usage_complete += run.completeness.usage_complete ? 1 : 0
    entry.cost_complete += run.completeness.cost_complete ? 1 : 0
    entry.cost_reconciled += run.completeness.cost_reconciled ? 1 : 0
    entry.billing_verified += run.completeness.billing_verified ? 1 : 0
    byPolicy.set(run.policy, entry)
  }
  return {
    runs: runs.length,
    usage_complete: runs.filter((run) => run.completeness.usage_complete).length,
    cost_complete: runs.filter((run) => run.completeness.cost_complete).length,
    cost_reconciled: runs.filter((run) => run.completeness.cost_reconciled).length,
    billing_verified: runs.filter((run) => run.completeness.billing_verified).length,
    tokens: runs.reduce((total, run) => total + run.tokens.gross, 0),
    cost: usd(runs.reduce((total, run) => total + run.cost.total, 0)),
    unattributed: usd(runs.reduce((total, run) => total + run.cost.unattributed, 0)),
    unpriced_records: runs.reduce((total, run) => total + run.cost.unpriced_records, 0),
    correctness: runs.reduce<Record<string, number>>((total, run) => {
      total[run.correctness] = (total[run.correctness] ?? 0) + 1
      return total
    }, {}),
    by_policy: [...byPolicy.values()].map((entry) => ({
      ...entry,
      cost: usd(entry.cost),
      unattributed: usd(entry.unattributed),
    })),
  }
}

function emptySummary(policy: string) {
  return {
    policy,
    runs: 0,
    tokens: 0,
    cost: 0,
    unattributed: 0,
    actions: 0,
    usage_complete: 0,
    cost_complete: 0,
    cost_reconciled: 0,
    billing_verified: 0,
    correctness: {} as Record<string, number>,
  }
}

function readProvenance(file: unknown) {
  const decoded = Option.getOrUndefined(Schema.decodeUnknownOption(RawExport)(file))
  if (!decoded) return undefined
  const provenance = new Map<string, Provenance>()
  for (const message of decoded.messages) {
    if (message.costProvenance) provenance.set(message.id, message.costProvenance)
  }
  return provenance
}

function cell(value: string | number | boolean) {
  if (typeof value !== "string") return String(value)
  return `"${value.replaceAll('"', '""')}"`
}
