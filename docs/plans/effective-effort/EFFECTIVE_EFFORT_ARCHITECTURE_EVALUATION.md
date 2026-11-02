# Effective Effort Resolution — Architecture Evaluation

Status: Investigation complete; no production code changed.
Scope: effort-resolution consistency between execution and reporting.
Related: `docs/spec/effort-policy.md` (domain behavior), `docs/spec/effort-evidence-owner.md`
(evidence ownership), `docs/plans/effective-effort/` (spec, plan, test matrix in this directory).

## 1. Executive assessment

The November 1 review was **partly right, and partly stale**.

- **Stale part:** the effort *decision rules* are not duplicated. Both paths already call one
  vendored, pure decision core (`effort/policy`) through one adapter entry point
  (`EffortAdapter.decideFor`, `adapter.ts:77`). The evidence-ownership refactor `960d5ca0ca`
  further ensured the escalation state itself has a single writer.
- **Still true:** the *assembly of decision inputs* is implemented twice. `transition.ts:50-75`
  and `status.ts:17-35` each independently normalize the `"default"` variant sentinel, apply the
  policy-echo filter against `lastAppliedVariant`, derive the mode, seed the base level, and
  assemble the adaptive fields — before calling the same `decideFor`. These ~20 lines are the
  precedence rules of the whole subsystem, and nothing forces the two copies to agree. There is
  also **no test** that cross-checks what execution decides against what status reports for the
  same inputs (confirmed by test inventory: `f102f3a59e` built both files together but their
  assertions never reference each other).

Verdict: the problem is real but narrower than reported. It is an input-assembly duplication
plus a missing consistency guarantee — not a missing decision authority. The right response is a
small extraction (one pure `EffortAdapter.resolve` consumed by both callers), not a service, not
persisted decisions, and not a rewrite.

## 2. Original concern and current findings

Original concern: "execution and reporting logic independently assemble or interpret the same
decision inputs", citing `transition.ts:46-103`, `status.ts:10-52`, `adapter.ts:38-66`,
`session/info.ts:30`.

Current findings, point by point:

| Original claim | Current reality |
| --- | --- |
| Transition determines the applied effort | Confirmed — `EffortTransition.apply` (`transition.ts:46`) decides per prepared step and writes through `ModelSelected` (`transition.ts:111-119`) |
| Status independently determines the reported effort | Confirmed — `EffortStatus.describe` (`status.ts:10`) re-derives the decision for its `next` field (`status.ts:25-35`) |
| Both depend on overlapping inputs | Confirmed — policy (`Config.effortPolicy`), `EffortStore.Info` row, agent id, session selection, model info |
| Separate implementations can diverge | Confirmed for input assembly only; the decision core is shared (`decideFor` at `transition.ts:63`, `status.ts:25`) |
| `session/info.ts:30` is part of the problem | It is the *producer* of the `"default"` sentinel (`variant ?? "default"`), unwrapped at `transition.ts:52`, `status.ts:18`, `model-resolver.ts:162`, and filtered at `variant.ts:17`. Only the first two unwraps are decision rules. |
| Recent refactors may have already consolidated this | The evidence-owner refactor (`960d5ca0ca`, 2026-11-01) consolidated *settlement classification* (one `EffortEvidence.classify`) and made `EffortStore` the only evidence writer. It did not touch `transition.ts`, `status.ts`, `adapter.ts`, or `policy/*` — verified via `git show --stat 960d5ca0ca`. The protocol-lowering refactor (`34102546`, `25357cfa`, 2026-11-02) is confined to `packages/ai` and does not affect effort resolution. |

## 3. Current-state architecture

### 3.1 Lifecycle (verified call chains)

Execution, once per prepared step attempt (`llm.ts:329-338`, inside the retry loop):

1. `SessionRunner.runStep` → `EffortTransition.apply` (`llm.ts:334-337`).
2. `apply` reads session (`transition.ts:47`), effort row (`:49`), merged policy
   (`:50`, `Config.effortPolicy` at `config.ts:34-41`), model info (`:56`).
3. Input assembly: sentinel unwrap (`:52`), echo filter (`:54`), mode (`:61`), base seeding
   (`:62`), adaptive fields (`:68-74`).
4. `EffortAdapter.decideFor` (`adapter.ts:77-83`) → `capability(model)` (`:23-32`) → vendored
   `decide(capability, state)` (`policy/policy.ts:130-155`).
5. No-op rules (`untouched`, `exact-base`) return `false` (`transition.ts:77-90`); a pick while a
   policy write is baselined re-records the baseline (`:80-88`).
6. A real change builds `Model.Ref` with the target variant (`:105-109`), publishes
   `SessionEvent.ModelSelected` with `metadata.source: "effort-policy"` (`:111-119`), records the
   row (`:120-128`), publishes `session.effort.transitioned` (`:129-136`), returns `true`.
7. The caller reloads context (`llm.ts:338`) so the request is built from the new session row;
   `model-resolver.withVariant` (`model-resolver.ts:161-164`) turns the variant into resolved
   provider settings (`:460-463`); durable history becomes cache-preserving effort markers
   (`to-llm-message.ts:224-239`) lowered per protocol (`packages/ai/src/effort-updates.ts`).

Reporting, per request:

1. `GET /api/session/:sessionID/effort` (`protocol/src/groups/session.ts:267-275`).
2. Handler gathers the same four inputs (`server/src/handlers/session.ts:201-213`).
3. `EffortStatus.describe` re-runs the identical assembly (`status.ts:17-35`) and returns the
   snapshot (`status.ts:36-51`); the protocol struct is pinned at `session.ts:42-61`.
4. CLI renders it (`cli/src/commands/handlers/session/effort.ts:10-40`). The TUI does **not**
   call the endpoint; it renders from durable `ModelSelected` metadata
   (`tui/src/util/model.ts:22-27`, `session-ui/.../session-timeline-row.tsx:1322-1329`).

### 3.2 Data-flow diagram

```
              config entries            session row              effort row            model catalog
              Config.effortPolicy       store.get                EffortStore.get       models.get
                        |                     |                        |                     |
   config.ts:34 --------+                     |                        |                     |
                        v                     v                        v                     v
              +-----------------------------------------------------------------------------+
              |  INPUT ASSEMBLY  (DUPLICATED today)                                          |
              |  transition.ts:52-75   |   status.ts:17-35                                   |
              |  - "default" sentinel unwrap       (52 | 18)                                 |
              |  - policy-echo filter vs lastAppliedVariant  (54 | 19)                       |
              |  - mode derivation                 (61 | 17)                                 |
              |  - base seeding chain              (62 | 20-22)                              |
              |  - adaptive field assembly         (68-74 | 30-34)                           |
              +-----------------------------------------------------------------------------+
                        |  EffortAdapter.Inputs                                 |
                        v                                                       v
        adapter.ts: stateFor (56) -> decideFor (77) -> policy/decide (130) [PURE, SINGLE]
                        |
            +-----------+----------------------------+
            v                                        v
   transition.ts:92-137                      status.ts:36-51
   apply / publish / record                  projection: support, control,
   (EFFECTFUL — one writer)                  baseLevel, currentLevel, next
            |                                        |
            v                                        v
   ModelSelected + EffortTransitioned        GET /session/:id/effort -> CLI JSON/text
   -> request variant -> provider            (TUI reads the events, not the endpoint)
```

Side channels that are already single-owner and stay out of scope:
`EffortEvidence.classify` + `applyEvidence` own escalation state (`evidence.ts:20-63`,
`policy.ts:76-111`); `EffortVerification.runIfDirty` only schedules through that same path
(`verify.ts:39-107`); `EffortDelegation.seed` seeds child bases (`delegation.ts:59-75`).

### 3.3 Effort vocabulary as the repository defines it

| Term | Owner | Meaning |
| --- | --- | --- |
| Configured effort | `Config.effortPolicy` (`config.ts:34`) | merged `effort_policy` block; seeds only sessions with no row (`docs/spec/effort-policy.md:178-184`) |
| Selected / exact | session `model.variant` (`info.ts:30`), unwrapped at `transition.ts:54`, `status.ts:19` | a user pick, written verbatim, never escalated (`policy.ts:131-135`); `"default"` means "no pick" |
| Base level | `session_effort.base_level` (`store.ts:21`), seeded via `sessionSeed`/`base_level` | durable floor for decay; `standard` resolves to "clear the variant" (`policy.ts:153`) |
| Durable level | `session_effort.level` (`store.ts:27`), adaptive only | the hysteresis controller state |
| Decision (`Decision`) | `policy/policy.ts:130` | `{ rule, level?, effort? }`; `effort` absent = leave the request untouched |
| Applied effort | the variant written through `ModelSelected` (`transition.ts:105-128`) | the only durable "applied" fact |
| Reported `next` | `status.ts:50` | explicitly "a decision for the next step, not a claim about a past request" (`status.ts:9`) |

No category in the brief is missing from this list, and no extra category is needed.

## 4. Verified duplication and inconsistency

**Duplicated decision rules** (identical modulo receiver names — verified line by line):

| Concern | transition.ts | status.ts |
| --- | --- | --- |
| `"default"` sentinel unwrap | 52 | 18 |
| policy-echo filter | 54 | 19 |
| mode derivation | 61 | 17 |
| base seeding chain | 62 | 20-22 |
| adaptive inputs | 68-74 | 30-34 |
| `decideFor` call | 63-75 | 25-35 |

**Legitimate differences** (must survive any refactor):

- Model absent: `apply` silently skips (`transition.ts:56-57`); `describe` reports
  `support: "unknown"`, `next: undefined` (`status.ts:23-25`). Silent-skip vs honest-unknown is
  correct on both sides.
- Effects: `apply` writes; `describe` is pure (`status.ts` has no IO).
- Status-only outputs (`control`, `initialized`, verifier fields) are projections of the same
  inputs, not decision rules.

**Adjacent inconsistencies found during the sweep** (documented, low severity):

1. `evidence.ts:39-50` hand-assembles `EffortState` (by design it ignores exact picks and the
   plan pin), but spreads `lastAppliedVariant` (`:42`) — a field `EffortState` does not declare
   (`policy/types.ts:50-77`). Inert dead data; worth removing.
2. `status.ts:23-24` calls `EffortAdapter.capability` and `decideFor` then computes capability
   again internally (`adapter.ts:82`). Pure and cheap; consolidation should not add a third call.
3. The `"default"` sentinel is unwrapped at four sites (`info.ts:30` producer;
   `transition.ts:52`; `status.ts:18`; `model-resolver.ts:162`; plus a filter at
   `variant.ts:17`). Only the two decision-path unwraps are in scope; `model-resolver` and
   `variant.ts` are model-resolution concerns with their own tests.
4. The `DecisionRule` label vocabulary is re-listed in `tui/src/util/model.ts:22-27`,
   `session-ui/.../session-timeline-row.tsx:1322-1329`, and `script/effort-report.ts:149`. These
   consume the pinned protocol union (`session.ts:57`) and the event contract
   (`schema/session-event.ts:83-96`); presentation mapping, not decision logic. No action.
5. No consistency test exists between execution and reporting (see §8).

## 5. Existing decision ownership (what is already authoritative)

- **Decision rules:** `effort/policy/` — pure, zero non-sibling imports, boundary-enforced by
  `test/effort/import-boundary.test.ts:10-19`; version-gated (`adapter.ts:9,78-81`).
- **Input translation:** `EffortAdapter` (`capability`, `stateFor`, `decideFor`).
- **Escalation state:** `EffortStore` is the only writer; `recordSelection` cannot clobber
  evidence (`store.ts:124-142`); evidence writes are transactional with a claimed observation
  order (`evidence.ts:32-62`).
- **Application:** the transition path is the only writer of policy variants
  (`docs/superpowers/plans/2026-11-01-model-router-integration.md:7`).
- **Persistence:** one durable row per session (`session_effort`, `session/sql.ts:131-152`);
  config only seeds sessions without a row.

What has no single owner: the **precedence/seeding input assembly** (§4).

## 6. Competing architectural designs

| Candidate | Approach |
| --- | --- |
| **A. Preserve** | Keep both assemblies; add documentation/tests only |
| **B. Shared pure resolver** | One pure function derives the decision from explicit inputs; both callers use it |
| **C. Resolved-effort object** | A typed resolution result with decision metadata consumed everywhere |
| **D. Persist the decision** | Compute once at a lifecycle boundary; persist for consumers |
| **E. Resolution service** | An Effect service gathers inputs and exposes decisions |
| **F. Hybrid** | Pure decision function + thin orchestration (execution) / projection (reporting) layers |

## 7. Initial elimination

- **D — Eliminated.** The decision is a cheap pure function of four inputs, two of which are
  already persisted (`session_effort` row) or derived from them. Persisting the *output* creates
  a second source of truth that goes stale when config, model catalog, or the row change. It
  also conflicts with the seed-once semantics ("editing `base_level` later does not move
  existing sessions", `docs/spec/effort-policy.md:181-182`) and with per-step freshness
  (`llm.ts:329-338` re-applies per attempt deliberately).
- **E — Eliminated.** `apply`'s inputs require Effect services; `describe`'s arrive as plain
  data from the HTTP handler. A service would either duplicate the handler's gathering or drag
  `Bus`/`SessionStore`/`Config` into a pure calculation. It adds a layer without adding an
  owner — the owner is the function, not a wrapper.
- **C — Eliminated as a new artifact.** `Decision` (`policy/types.ts:80-87`) already is the
  typed resolution result with explainability (`rule`), and the protocol's
  `Session.EffortStatus.next` mirrors it (`session.ts:56-60`). A richer host-side object would
  duplicate `Decision` and the status projection. The useful residue of C — an explicit
  `Resolution` return carrying what *both* callers need — is folded into B/F.
- **A — Conditionally eliminated.** Tests alone cannot keep two assembly sites in sync; they
  detect drift after it ships, on every future edit to seeding or echo semantics. Retained only
  as the fallback if extraction proves behavior-changing (it does not — see §9).

## 8. Deep comparison of finalists (B and F)

B and F converge on the same code; F names the boundary B implies. Evaluated against the
required scenarios (full matrix in `EFFECTIVE_EFFORT_TEST_MATRIX.md`):

- **A. Manual override** — exact pick wins verbatim (`policy.ts:131-135`). Both finalists
  preserve it: the echo filter moves verbatim into the resolver; `session-runner.test.ts:2485`
  ("a user pick replaces the policy baseline and is never escalated") guards it unchanged.
- **B. Automatic escalation** — `escalated` derived in static mode (`policy.ts:142-143`),
  durable raise + step-down in adaptive (`policy.ts:87-88,105-111`). Unaffected: resolver only
  assembles inputs; `session-runner.test.ts:2527-2587` end-to-end coverage must pass unchanged.
- **C. State changes between reads** — each consumer evaluates its own snapshot
  (`transition.ts:47-56` per step; handler per request, `session.ts:205-212`). After
  consolidation a difference between "what ran" and "what is reported" is attributable to the
  snapshot alone, because the rules are one function. This is the core maintenance win.
- **D. Unsupported model effort** — `capability` returns `{efforts: []}` for degenerate routes
  (`adapter.ts:24-31`); `decide` returns `untouched` (`policy.ts:151-152`); missing model keeps
  the split behavior (skip vs unknown). Preserved verbatim; covered by
  `adapter.test.ts:28-31` and `status.test.ts:19`.
- **E. Configuration changes** — policy is re-read per step (`transition.ts:50`) and per request
  (`session.ts:212`); shallow-merged lowest-to-highest (`config.ts:34-41`,
  `config.test.ts:7-13`). No new caching is introduced, so no new staleness.
- **F. Sentinels** — `"default"` unwrap, echo filter, `row?.baseLevel ??` seeding, and
  `clean_passes ?? 2` move as literal expressions into one function; the "policy echo is not a
  user pick" subtlety (`transition.ts:16-26`) gets one authoritative comment instead of two.
- **G. User-facing status** — `describe`'s output shape is the frozen protocol struct
  (`session.ts:42-61`); projection-only changes. CLI/TUI unaffected.
- **H. Future policy extension** — a new decision rule still lands in `policy/` (+ version bump,
  per `docs/spec/effort-evidence-owner.md:222`); a new *input* lands in `adapter.ts`
  (`Inputs`, `stateFor`, `resolve`) instead of in `transition.ts` and `status.ts`
  simultaneously. Coordinated-edit surface shrinks from 2 files to 1.
- **I. Debugging** — one function to read; `Decision.rule` plus `metadata.source`/`rule` on the
  event already explain *why* (`transition.ts:110-119`).
- **J. Upstream synchronization** — all changes are inside fork-local files
  (`packages/core/src/effort/*`); no exported signature changes (`apply`, `describe` keep their
  contracts), no protocol/schema/SDK changes (`packages/sdk/src` has no effort surface at all).
  Merge conflict surface is minimal.

**Selected: Candidate F** — one pure resolver in `EffortAdapter.resolve` (B's mechanism), with
`apply` remaining the effectful orchestrator and `describe` remaining a projection. B and F are
the same architecture; F's framing is retained because the spec deliverables must state the
lifecycle boundary explicitly.

## 9. Reassessment

1. *What demonstrated problem does this solve?* Two independent copies of precedence/seeding
   rules with zero cross-checks (§4, §8-H); every future seeding change must be made twice and
   can silently diverge.
2. *What complexity does it add?* One function (~25 lines) and one interface. Both callers
   shrink. Net negative complexity.
3. *Does it preserve semantics?* The extraction is expression-for-expression; stage 1 pins the
   current behavior with tests that must pass *before* the extraction, and the existing 142
   effort tests plus session-runner scenarios act as the behavioral regression net.
4. *New source-of-truth conflict?* No — it removes one.
5. *Can it go stale?* It is computed per call from caller-supplied snapshots; nothing cached.
6. *Hidden state?* None; inputs are explicit parameters, matching `stateFor`'s existing style.
7. *Simpler solution?* A is simpler but does not fix the defect (§7). Nothing simpler than one
   shared function can make two derivations consistent by construction.
8. *Future policy changes easier?* Yes (§8-H).
9. *Debugging simpler?* Yes (§8-I).
10. *Long-term infrastructure?* Yes: pure, deterministic, version-gated, boundary-tested.

**Decision gate B:** the smaller-than-a-service, smaller-than-a-persistence-change extraction
wins. If stage 1's consistency pinning test had failed, that would have indicated live drift and
the same architecture would apply as the fix; it is expected to pass because the two assemblies
are currently expression-identical.

## 10. Why the alternatives were rejected (summary)

- **Persisted decision (D):** second source of truth; staleness against config/catalog/row
  changes; contradicts seed-once semantics; no demonstrated need (§7).
- **Service (E):** adds coupling and a layer, not an owner; splits input-gathering from the one
  module that defines the rules (§7).
- **New result object (C):** `Decision` + protocol struct already provide the typed result and
  explainability; a third shape invites drift (§7).
- **Status quo (A):** leaves the only genuinely duplicated rules in the subsystem unprotected;
  tests alone detect drift after the fact (§7).

## 11. Remaining uncertainties

1. Whether any consumer outside core relies on `status.ts`'s exact object identity/shape beyond
   the protocol struct — judged unlikely: the handler serializes it, the CLI prints fields, the
   TUI does not call the endpoint. The plan freezes the output shape anyway.
2. `evidence.ts`'s intentional divergence from `stateFor` (no exact/pin) is documented only in
   prose; the refactor does not unify it (it must not — evidence application legitimately
   ignores picks and pins), and the plan removes only its dead `lastAppliedVariant` field.
3. Whether the `"default"` sentinel should eventually become an absent variant end-to-end
   (removing the producer's `?? "default"` at `info.ts:30`). Rejected for now: it is a public
   session-info shape (`PublicSessionInfo`, `session.ts:67-70`) with downstream UI consumers
   (`session-timeline-row.tsx:631`), i.e. an upstream-facing change out of proportion to the
   benefit.
