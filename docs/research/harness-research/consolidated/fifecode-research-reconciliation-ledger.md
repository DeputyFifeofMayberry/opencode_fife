# FiFeCode research reconciliation ledger

**Date:** 2026-11-03  
**Target:** `deputyfifeofmayberry/opencode_fife`, `main`, `07bae7483b6a7983bae2008407683097235e06c5`  
**Companions:** [Consolidated research](fifecode-consolidated-research.md) · [Master findings register](fifecode-master-findings-register.md)

## 1. Source-document manifest and coverage

Package attribution follows the controlling assignment and upload grouping. All seven research documents were read in full; ranged reads recovered outputs that had been truncated in tool display. The controlling assignment was read separately. Evidence-ledger rows are provenance entries, not additional independent findings.

| Set | Original file | Purpose / date | Repository basis | Methods and primary-source families | Scope and missing evidence |
|---|---|---|---|---|---|
| A — ChatGPT | `harness-engineering-research-2026-11-02.md` | Harness landscape, engineering synthesis, workload and comparison design; 2026-11-02 | Fork `07bae748…`; upstream `1bf08ae…`; merge base `ed74ec82…` | Read-only GitHub source/compare; Claude Code, Codex, DeepSeek Harness/API, upstream, Aider, Pi, Gemini, mini-SWE-agent, OpenHands and research screening | Selected paths, not exhaustive peer/fork audit; no local checkout, runtime, raw usage ZIP, accepted-task data, or controlled comparison |
| A — ChatGPT | `opencode-fife-harness-gap-analysis-2026-11-02.md` | `GAP-001`–`GAP-011`, `STR-001`–`STR-007`, `H-01`–`H-07`; 2026-11-02 | Same pinned fork/upstream | Source-linked D1–D9 assessment, conditional call-path analysis, tests and disconfirmation designs | No tests run; runtime prevalence, background subscribers, local state, and task benefit unknown |
| A — ChatGPT | `harness-engineering-evidence-ledger-2026-11-02.md` | `E-001`–`E-030`, discovery log, D1–D9 and uncertainty coverage; 2026-11-02 | SHA-pinned links and dated external access | Evidence classes, source screening, independence and reproduction requirements | No `MEASURED` entries; several peers screened rather than deeply audited |
| B — DeepSeek | `deepseek_chat-research_doc.md`, part A | Embedded `harness-engineering-research-2026-11-02.md`; eight executive findings and landscape | Same fork/upstream baseline | Public GitHub and vendor/peer documentation; architecture and literature synthesis | Static only; some narrative claims later contradicted by direct source |
| B — DeepSeek | `deepseek_chat-research_doc.md`, part B | Embedded gap analysis: `GAP-001`–`GAP-010`, `OPP-001`–`OPP-005`, six hypotheses, seven strengths; 2026-11-02 | Same pinned fork/upstream | D1–D9, gap register, future validation and protected invariants | No task data, raw export, runtime or merge trial; “merge first” is an interpretation, not a measured result |
| B — DeepSeek | `deepseek_chat-research_doc.md`, part C | Embedded evidence ledger: `E-001`–`E-027`; 2026-11-02 | Fork/upstream and external references | Evidence classification and source links | PR pass counts author-reported; live smoke quota-blocked; no independent task evaluation |
| C — Kimi | `harness-engineering-research-2026-11-03.md` | Harness landscape, D1–D9, external empirical context, causal comparison design; 2026-11-03 | Same fork/upstream; reports in-fork merge `ed073f32…` | Local read-only pinned source checkout plus primary docs/papers, discovery/screening and negative evidence | No Bun, dependencies, Windows, local checkout, raw usage, live provider or benchmark execution |
| C — Kimi | `opencode-fife-harness-gap-analysis-2026-11-03.md` | `F-01`–`F-07`, `O-01`–`O-04`, `U-01`–`U-06`, strengths and ruled-out claims; 2026-11-03 | Same target SHA and pinned upstream | Focused bidirectional diffs, exact mechanisms, root alternatives and validation contracts | Negative containment search scoped; external CI/deployment unknown; no dynamic reproduction |
| C — Kimi | `harness-engineering-evidence-ledger-2026-11-03.md` | `E001`–`E093`, discovery/screening, D1–D9, negative evidence, `D-01`–`D-04`; 2026-11-03 | SHA-pinned source and dated external evidence | Claim-level evidence, source quality, deferred leads and review checkpoints | External results are not fork measurements; exhaustive market/security/upstream equivalence not claimed |
| Control | `user_pasted_clipboard_long_content_as_file_# FiFeCode — Multi-M.txt` | Consolidation assignment and restrictions; executed 2026-11-03 | Requires published read-only fallback if local unavailable | Evidence hierarchy, D1–D9, crosswalk, adversarial review and no-implementation gates | Controls this consolidation; not evidence about runtime |

## 2. Normalization and disposition accounting

### Included units

- **A:** 11 gaps + 7 strengths + 7 hypotheses + 7 analyst-split ruled-out claims = **32**.
- **B:** 8 executive findings + 10 gaps + 5 opportunities + 6 hypotheses + 7 strengths + 4 ruled-out claims + 1 material unnumbered DeepSeek-support assertion = **41**.
- **C:** 7 findings + 4 opportunities + 6 unknowns + 4 deferred leads + 12 protected strengths + 12 ruled-out/narrowed claims = **45**.
- **Total:** **118 original findings/claims**.

Analyst-assigned identifiers are `X` for DeepSeek executive findings, `S` for unnumbered strengths, `R` for ruled-out claims, `H` for DeepSeek’s unnumbered hypotheses, and `N-01` for its material narrative DeepSeek-support assertion. These IDs make unnumbered material auditable; they are not presented as original document IDs. ChatGPT/Kimi hypotheses and unknowns retain their native IDs. Evidence entries (`E-*`) and narrative peer descriptions are excluded from the denominator to avoid counting citations or repetition as findings. Five consolidated entries (FIFE-023, FIFE-035, FIFE-037–FIFE-039) synthesize material narrative research without a separate registered source unit.

### Exclusive dispositions

| Disposition | A | B | C | Total | Rule |
|---|---:|---:|---:|---:|---|
| Confirmed | 5 | 2 | 6 | **13** | A one-to-one or unique source/document observation survives with its scoped mechanism established |
| Merged | 23 | 36 | 31 | **90** | Duplicate, hypothesis, strength, negative result, or subclaim absorbed into a root-level consolidated entry |
| Unresolved | 4 | 1 | 8 | **13** | Principal value remains an open question, opportunity, or access limitation |
| Contradicted | 0 | 2 | 0 | **2** | Direct source materially disproves the original claim |
| Superseded | 0 | 0 | 0 | **0** | No unit needed this exclusive category; the target SHA did not change |
| **Total** | **32** | **41** | **45** | **118** | Categories sum exactly to reviewed units |

The **40 consolidated findings** include defects, risks, opportunities, measurement gaps, negative results, and protected strengths. “Merged” does not mean discarded; the destination FIFE ID retains the content and qualifications.

## 3. Cross-model agreement and disagreement matrix

| Topic | ChatGPT | DeepSeek | Kimi | Consolidated disposition |
|---|---|---|---|---|
| Absent-row effort state | `GAP-001`: probable source-verified conditional path | Not the central numbered finding | `F-01`: static confirmed deficiency | **Agreement on mechanism, terminology difference on runtime certainty.** FIFE-001 Verified statically; prevalence unknown |
| Background verifier result | `GAP-002`: probable bypass, other consumers not excluded | Not separately identified | Runtime unknown in `U-02` | **Unique discovery retained.** FIFE-002 Supported, not universally proven |
| Empty-verifier inertness | Not separately identified | Not separately identified | `F-02`: contract mismatch | **Unique discovery retained.** FIFE-003 Verified mismatch; intent unresolved |
| Revision and verifier identity | `GAP-005`: shell mutation risk | `GAP-008`: cwd omission | Policy/source corroboration | **Distinct root causes retained separately.** FIFE-004 and FIFE-005 |
| Escalation value/stopping | General accepted-task caution | `GAP-002`: open-ended cost and no task benefit | Effort outcome undetermined | **Partial agreement.** Pure policy mechanism Verified; external bounds and task benefit unresolved in FIFE-006 |
| Effort transition route | Direct event publication identified | Claims `Session.switchModel` | Direct publication; says not inherently defective | **DeepSeek contradicted.** FIFE-032 corrects mechanism without inventing a defect |
| DeepSeek-specific support | General provider integration caution | Narrative says no specific handling found | Native/hosted mappings verified | **DeepSeek contradicted.** FIFE-027 Verified by `variant.ts` |
| Compaction | Existing substantial system | Existing but older; some “text only” framing | Multi-mode/native/background and upstream differences | **Narrowed agreement.** FIFE-015/FIFE-029; no quality regression established |
| Upstream priority | High exposure, not blind merge | Dominant prerequisite / merge first | Medium semantic compatibility exposure | **Priority disagreement preserved and resolved conditionally.** FIFE-014 does not impose universal order |
| Accepted-task baseline | High measurement gap | High measurement gap | High measurement gap plus outcome join | **Agreement, shared absence of data.** FIFE-018 |
| Context growth/cache | Underdetermined; no compaction diagnosis | Prior figures insufficient; cache unmeasured | Same, with explicit negative-results section | **Agreement.** FIFE-017/FIFE-020/FIFE-021 |
| Containment | Security not exhaustively audited | No OS sandbox verified; hook risk | No in-tree integration discovered; deployment unknown | **Partial agreement with negative-search caution.** FIFE-009/FIFE-010 |
| Routing/repository maps | Opportunities without demonstrated deficiency | General routing/context opportunities | No comparative outcome evidence | **Unresolved opportunities.** FIFE-024/FIFE-025 |
| Release assurance | Focused tests exist, absent-row hole | Author-reported counts only | `main` workflow and seeded-test gap | **Complementary.** FIFE-012/FIFE-033 |
| External benchmark evidence | Vendor/peer scores not transferable | Harness-specific benchmark caution | Specific Claw/DeepSeek figures with causal limits | **Source-scoped only.** FIFE-019/FIFE-037 |

## 4. Independent targeted verification record

All repository links below are read-only and pinned. Line numbers are taken from the original packages where available; symbol-level anchors are used where this consolidation directly read the file without generating a new line-numbered archive. “Direct” means independently read during this consolidation; “package-corroborated” remains bounded by the supplied research.

| Finding | Evidence and exact anchors | Result and boundary |
|---|---|---|
| Target identity | [Fork tree](https://github.com/deputyfifeofmayberry/opencode_fife/tree/07bae7483b6a7983bae2008407683097235e06c5) | Direct published `main` check remained `07bae7483b6a7983bae2008407683097235e06c5`; local tree unknown |
| FIFE-001 | [`transition.ts`](https://github.com/deputyfifeofmayberry/opencode_fife/blob/07bae7483b6a7983bae2008407683097235e06c5/packages/core/src/effort/transition.ts#L45-L108), [`store.ts`](https://github.com/deputyfifeofmayberry/opencode_fife/blob/07bae7483b6a7983bae2008407683097235e06c5/packages/core/src/effort/store.ts#L47-L114), [`evidence.ts`](https://github.com/deputyfifeofmayberry/opencode_fife/blob/07bae7483b6a7983bae2008407683097235e06c5/packages/core/src/effort/evidence.ts#L24-L86), [`evidence.test.ts`](https://github.com/deputyfifeofmayberry/opencode_fife/blob/07bae7483b6a7983bae2008407683097235e06c5/packages/core/test/effort/evidence.test.ts#L36-L70) | Direct: optional row, early no-change return, update-only failure/revision methods, pre-seeded tests. Static path Verified; runtime frequency unknown |
| FIFE-002 | [`shell.ts`](https://github.com/deputyfifeofmayberry/opencode_fife/blob/07bae7483b6a7983bae2008407683097235e06c5/packages/core/src/tool/plugin/shell.ts#L159-L285), [`step.ts`](https://github.com/deputyfifeofmayberry/opencode_fife/blob/07bae7483b6a7983bae2008407683097235e06c5/packages/core/src/session/runner/step.ts#L128-L153), [`shell/result.ts`](https://github.com/deputyfifeofmayberry/opencode_fife/blob/07bae7483b6a7983bae2008407683097235e06c5/packages/core/src/shell/result.ts#L1-L75) | Direct: initial running result and later synthetic notification differ from settled-tool observer. Other consumers not exhaustively excluded |
| FIFE-003 | [`config/effort.ts`](https://github.com/deputyfifeofmayberry/opencode_fife/blob/07bae7483b6a7983bae2008407683097235e06c5/packages/schema/src/config/effort.ts), [`transition.ts`](https://github.com/deputyfifeofmayberry/opencode_fife/blob/07bae7483b6a7983bae2008407683097235e06c5/packages/core/src/effort/transition.ts), [`delegation.ts`](https://github.com/deputyfifeofmayberry/opencode_fife/blob/07bae7483b6a7983bae2008407683097235e06c5/packages/core/src/effort/delegation.ts), [`subagent.ts`](https://github.com/deputyfifeofmayberry/opencode_fife/blob/07bae7483b6a7983bae2008407683097235e06c5/packages/core/src/tool/plugin/subagent.ts) | Direct: unqualified inert wording; no obvious empty-list guard in inspected transition/delegation. Product intent unresolved |
| FIFE-004–006 | [`policy.ts`](https://github.com/deputyfifeofmayberry/opencode_fife/blob/07bae7483b6a7983bae2008407683097235e06c5/packages/core/src/effort/policy/policy.ts), [`evidence.ts`](https://github.com/deputyfifeofmayberry/opencode_fife/blob/07bae7483b6a7983bae2008407683097235e06c5/packages/core/src/effort/evidence.ts), [`adapter.ts`](https://github.com/deputyfifeofmayberry/opencode_fife/blob/07bae7483b6a7983bae2008407683097235e06c5/packages/core/src/effort/adapter.ts) | Direct: default mutation list, same-verifier/later-sequence/not-older-revision clearing, cwd omission acknowledged, no pure-policy cap/decay, exact selection and plan/variant behavior |
| FIFE-007 | [`file-stamp.ts`](https://github.com/deputyfifeofmayberry/opencode_fife/blob/07bae7483b6a7983bae2008407683097235e06c5/packages/core/src/file-stamp.ts) | Direct: process-local map, absent stamp permits, separate check/write. Restart/race frequency unknown |
| FIFE-008 | [`session/transcript.ts`](https://github.com/deputyfifeofmayberry/opencode_fife/blob/07bae7483b6a7983bae2008407683097235e06c5/packages/core/src/session/transcript.ts), [`tool/plugin/session.ts`](https://github.com/deputyfifeofmayberry/opencode_fife/blob/07bae7483b6a7983bae2008407683097235e06c5/packages/core/src/tool/plugin/session.ts) | Direct: 20,000-character message/read bound, 4,000-character tool rendering, “complete message” search wording |
| FIFE-009–011 | [`permission.ts`](https://github.com/deputyfifeofmayberry/opencode_fife/blob/07bae7483b6a7983bae2008407683097235e06c5/packages/core/src/permission.ts), [`config-hooks.ts`](https://github.com/deputyfifeofmayberry/opencode_fife/blob/07bae7483b6a7983bae2008407683097235e06c5/packages/core/src/config-hooks.ts), [`shell.ts`](https://github.com/deputyfifeofmayberry/opencode_fife/blob/07bae7483b6a7983bae2008407683097235e06c5/packages/core/src/tool/plugin/shell.ts) | Direct: approvals/rules and trusted `PreToolUse` shell semantics. Incomplete code searches are not evidence of containment absence; deployment unknown |
| FIFE-012 | [`check.yml`](https://github.com/deputyfifeofmayberry/opencode_fife/blob/07bae7483b6a7983bae2008407683097235e06c5/.github/workflows/check.yml), [`check-test.yml`](https://github.com/deputyfifeofmayberry/opencode_fife/blob/07bae7483b6a7983bae2008407683097235e06c5/.github/workflows/check-test.yml), [`evidence.test.ts`](https://github.com/deputyfifeofmayberry/opencode_fife/blob/07bae7483b6a7983bae2008407683097235e06c5/packages/core/test/effort/evidence.test.ts) | Direct: `dev` check triggers, `dev`/`beta` test push triggers, Linux/Windows assets, seeded evidence tests. External/main check results unknown |
| FIFE-013 | [`AGENTS.md`](https://github.com/deputyfifeofmayberry/opencode_fife/blob/07bae7483b6a7983bae2008407683097235e06c5/AGENTS.md#L1-L5), [`intent`](https://github.com/deputyfifeofmayberry/opencode_fife/blob/07bae7483b6a7983bae2008407683097235e06c5/docs/intent/effort-policy.md#L1-L8), [`spec`](https://github.com/deputyfifeofmayberry/opencode_fife/blob/07bae7483b6a7983bae2008407683097235e06c5/docs/spec/effort-policy.md#L1-L9) | Direct AGENTS/intent and package-corroborated spec. A later direct spec read returned authorization-required transport error; no content invented |
| FIFE-014–015 | [Recorded cross-fork compare](https://github.com/anomalyco/opencode/compare/dev...DeputyFifeofMayberry:opencode_fife:main), [pinned upstream tree](https://github.com/anomalyco/opencode/tree/1bf08ae46a91f7793c756e4ee521e37b6b554064), [upstream `model-request.ts`](https://github.com/anomalyco/opencode/blob/1bf08ae46a91f7793c756e4ee521e37b6b554064/packages/core/src/session/model-request.ts) | Recorded counts accepted as baseline evidence; direct upstream request headroom/TODO comparison. Current upstream refresh failed twice with 503, so no live-tip claim |
| FIFE-016 | [Fork `model-request.ts`](https://github.com/deputyfifeofmayberry/opencode_fife/blob/07bae7483b6a7983bae2008407683097235e06c5/packages/core/src/session/model-request.ts), [`affinity.ts`](https://github.com/deputyfifeofmayberry/opencode_fife/blob/07bae7483b6a7983bae2008407683097235e06c5/packages/core/src/session/affinity.ts) | Direct: nested-fork TODO and parent/fork affinity. Same TODO in pinned upstream; impact unmeasured |
| FIFE-018/FIFE-030 | [`usage.ts`](https://github.com/deputyfifeofmayberry/opencode_fife/blob/07bae7483b6a7983bae2008407683097235e06c5/packages/core/src/session/usage.ts), runner/event/OTLP paths in package ledgers | Direct usage categories and endpoint-cost precedence; supplied accepted-task/raw usage corpus remains absent |
| FIFE-025 | [`runner/model.ts`](https://github.com/deputyfifeofmayberry/opencode_fife/blob/07bae7483b6a7983bae2008407683097235e06c5/packages/core/src/session/runner/model.ts#L80-L120) | Direct: explicit session/configured agent/default resolution in inspected path. External/local routing not excluded |
| FIFE-027/FIFE-032 | [`variant.ts`](https://github.com/deputyfifeofmayberry/opencode_fife/blob/07bae7483b6a7983bae2008407683097235e06c5/packages/core/src/variant.ts), [`transition.ts`](https://github.com/deputyfifeofmayberry/opencode_fife/blob/07bae7483b6a7983bae2008407683097235e06c5/packages/core/src/effort/transition.ts) | Direct: native DeepSeek thinking/effort mapping; direct `SessionEvent.ModelSelected` publication. Two DeepSeek claims contradicted |
| FIFE-029 | [`compaction.ts`](https://github.com/deputyfifeofmayberry/opencode_fife/blob/07bae7483b6a7983bae2008407683097235e06c5/packages/core/src/session/compaction.ts#L42-L169) | Direct: automatic/manual/overflow/native/background paths, reserves/keep/precompute/shrink and summary validation. No live quality test |

## 5. Source independence, shared lineage, and corrections

- All three packages inspected the same fork and upstream SHAs. Their agreement on repository facts is **not three independent observations**; this consolidation reused the pinned source as the authority.
- Vendor documentation, a vendor benchmark, a partner integration guide, and a third-party summary repeating them form one evidentiary lineage for the underlying claim. They were not multiplied into independent confirmations.
- AI-package hypotheses remain hypotheses even when two packages repeat them. Direct source can prove a mechanism but cannot manufacture runtime prevalence or accepted-task benefit.
- Claude Code internals are partly proprietary. Public docs establish documented behavior, not private loop/classifier implementation.
- External papers and benchmarks are implementation/task specific. Claw-SWE-Bench supports evaluation/output-contract importance in its configuration, not a FiFeCode effect estimate.
- DeepSeek Harness’s feature breadth and test-like filename count do not supersede its own developer-preview and unaudited-security warnings.
- Prior usage figures remain unverified because the raw export was unavailable. They are excluded from causal and numerical-benefit conclusions.
- Incomplete GitHub code searches for effort observers, sandbox terms, and file stamps returned `incomplete_results: true`; zero-item results were not treated as negative proof.
- Archive downloads timed out and were abandoned in favor of targeted read-only file retrieval. Partial archives were not used as evidence, and the target repository was not touched.

### Materially inaccurate, incomplete, duplicated, or unsupported claims

| Original claim | Disposition |
|---|---|
| B narrative: no DeepSeek-specific thinking/effort handling found | **Contradicted** by direct `variant.ts`; corrected in FIFE-027 |
| B `S-03` and `GAP-007` mechanism: effort transitions use `Session.switchModel` | **Contradicted** for `S-03`; `GAP-007` merged with its valid cache-measurement concern while correcting the subclaim |
| Direct model-event publication is inherently defective | **Unsupported**; FIFE-032 preserves the actual design and requires a concrete failure |
| Compaction is absent or only a simple text-summary system | **Inaccurate/incomplete**; FIFE-029 records multi-mode/native/background behavior |
| High cache ratio proves efficiency or stable-prefix causation | **Unsupported inference**; FIFE-021 requires task-level outcomes and provider traces |
| Growing context proves compaction failure or duplicate context | **Unresolved hypothesis**, not a finding of defect; FIFE-020 |
| Upstream is strictly better or merging must precede every other decision | **Unsupported generalization**; FIFE-014/FIFE-015 preserve semantic tradeoffs |
| Test-file counts or author-reported passes establish maturity/current target pass rate | **Unsupported**; FIFE-012/FIFE-033/FIFE-036 bound the evidence |
| Peer sandbox, memory, repository map, routing, hooks, or multi-agent presence proves local benefit | **Unsupported transfer**; retained only as conditional opportunities/comparators |
| Repeated gaps, hypotheses, strengths, and ruled-out claims | **Merged without erasing distinct causes**; see complete crosswalk below |

## 6. Original-to-consolidated crosswalk

Disposition is exclusive at the original-unit level. Multi-destination mappings indicate a unit with genuinely separable mechanism and measurement content. “Analyst ID” means the source did not number that unit.

### Research Set A — ChatGPT

| Original ID | Consolidated finding | Disposition | Reconciliation note |
|---|---|---|---|
| GAP-001 | FIFE-001 | Confirmed | Direct/scoped observation retained |
| GAP-002 | FIFE-002 | Confirmed | Verified event-path difference; final-completion consumer not exhaustively excluded |
| GAP-003 | FIFE-014 | Merged | Content retained in consolidated root finding |
| GAP-004 | FIFE-018 | Merged | Content retained in consolidated root finding |
| GAP-005 | FIFE-004 | Confirmed | Direct/scoped observation retained |
| GAP-006 | FIFE-024 | Unresolved | Open question or unvalidated opportunity retained |
| GAP-007 | FIFE-025 | Unresolved | Open question or unvalidated opportunity retained |
| GAP-008 | FIFE-013 | Confirmed | Direct/scoped observation retained |
| GAP-009 | FIFE-016 | Confirmed | TODO confirmed; impact unresolved |
| GAP-010 | FIFE-026 | Unresolved | Open question or unvalidated opportunity retained |
| GAP-011 | FIFE-020 | Unresolved | Open question or unvalidated opportunity retained |
| H-01 | FIFE-001 | Merged | Content retained in consolidated root finding |
| H-02 | FIFE-002 | Merged | Content retained in consolidated root finding |
| H-03 | FIFE-004 | Merged | Content retained in consolidated root finding |
| H-04 | FIFE-020 | Merged | Content retained in consolidated root finding |
| H-05 | FIFE-025 | Merged | Content retained in consolidated root finding |
| H-06 | FIFE-026 | Merged | Content retained in consolidated root finding |
| H-07 | FIFE-014 | Merged | Content retained in consolidated root finding |
| STR-001 | FIFE-028 | Merged | Content retained in consolidated root finding |
| STR-002 | FIFE-029 | Merged | Content retained in consolidated root finding |
| STR-003 | FIFE-030 | Merged | Content retained in consolidated root finding |
| STR-004 | FIFE-031 | Merged | Content retained in consolidated root finding |
| STR-005 | FIFE-032 | Merged | Content retained in consolidated root finding |
| STR-006 | FIFE-031 | Merged | Content retained in consolidated root finding |
| STR-007 | FIFE-033 | Merged | Content retained in consolidated root finding |
| R-01 | FIFE-029 | Merged | Analyst-assigned ID for unnumbered ruled-out claim |
| R-02 | FIFE-030 | Merged | Analyst-assigned ID for unnumbered ruled-out claim |
| R-03 | FIFE-031 | Merged | Analyst-assigned ID for unnumbered ruled-out claim |
| R-04 | FIFE-031 | Merged | Analyst-assigned ID for unnumbered ruled-out claim |
| R-05 | FIFE-032 | Merged | Analyst-assigned ID for unnumbered ruled-out claim |
| R-06 | FIFE-028 | Merged | Analyst-assigned ID for unnumbered ruled-out claim |
| R-07 | FIFE-033 | Merged | Analyst-assigned ID for unnumbered ruled-out claim |

### Research Set B — DeepSeek

| Original ID | Consolidated finding | Disposition | Reconciliation note |
|---|---|---|---|
| X-01 | FIFE-014 | Merged | Analyst-assigned executive-finding ID |
| X-02 | FIFE-014 | Merged | Analyst-assigned executive-finding ID |
| X-03 | FIFE-006 | Merged | Analyst-assigned executive-finding ID |
| X-04 | FIFE-011 | Merged | Analyst-assigned executive-finding ID |
| X-05 | FIFE-007 | Merged | Analyst-assigned executive-finding ID |
| X-06 | FIFE-015 | Merged | Analyst-assigned executive-finding ID |
| X-07 | FIFE-020 | Merged | Analyst-assigned executive-finding ID |
| X-08 | FIFE-017 | Merged | Analyst-assigned executive-finding ID |
| GAP-001 | FIFE-014 | Merged | Content retained in consolidated root finding |
| GAP-002 | FIFE-006 | Merged | Content retained in consolidated root finding |
| GAP-003 | FIFE-007 | Merged | Content retained in consolidated root finding |
| GAP-004 | FIFE-011 | Merged | Content retained in consolidated root finding |
| GAP-005 | FIFE-018 | Merged | Content retained in consolidated root finding |
| GAP-006 | FIFE-015 | Merged | Content retained in consolidated root finding |
| GAP-007 | FIFE-017 | Merged | Contains a contradicted `Session.switchModel` subclaim; valid cache-measurement concern retained |
| GAP-008 | FIFE-005 | Confirmed | Direct/scoped observation retained |
| GAP-009 | FIFE-010 | Confirmed | Direct/scoped observation retained |
| GAP-010 | FIFE-022 | Unresolved | Open question or unvalidated opportunity retained |
| OPP-001 | FIFE-018 | Merged | Content retained in consolidated root finding |
| OPP-002 | FIFE-010 / FIFE-011 | Merged | Trust boundary and lifecycle opportunity retained separately |
| OPP-003 | FIFE-026 | Merged | Content retained in consolidated root finding |
| OPP-004 | FIFE-007 | Merged | Content retained in consolidated root finding |
| OPP-005 | FIFE-015 | Merged | Content retained in consolidated root finding |
| H-01 | FIFE-014 | Merged | Analyst-assigned hypothesis ID |
| H-02 | FIFE-006 | Merged | Analyst-assigned hypothesis ID |
| H-03 | FIFE-020 | Merged | Analyst-assigned hypothesis ID |
| H-04 | FIFE-021 | Merged | Analyst-assigned hypothesis ID |
| H-05 | FIFE-010 | Merged | Analyst-assigned hypothesis ID; safety assumption not accepted as fact |
| H-06 | FIFE-022 | Merged | Analyst-assigned hypothesis ID |
| S-01 | FIFE-032 | Merged | Analyst-assigned strength ID |
| S-02 | FIFE-032 | Merged | Analyst-assigned strength ID; durability qualified by absent-row boundary |
| S-03 | FIFE-030 | Contradicted | Analyst-assigned strength ID; `Session.switchModel` route disproved, cache aim retained |
| S-04 | FIFE-007 | Merged | Analyst-assigned strength ID |
| S-05 | FIFE-031 | Merged | Analyst-assigned strength ID |
| S-06 | FIFE-028 / FIFE-029 | Merged | Analyst-assigned strength ID |
| S-07 | FIFE-034 | Merged | Analyst-assigned strength ID |
| R-01 | FIFE-029 | Merged | Analyst-assigned ruled-out claim ID |
| R-02 | FIFE-031 | Merged | Analyst-assigned ruled-out claim ID |
| R-03 | FIFE-031 | Merged | Analyst-assigned ruled-out claim ID |
| R-04 | FIFE-014 | Merged | Analyst-assigned ruled-out claim ID |
| N-01 | FIFE-027 | Contradicted | Analyst-assigned ID for narrative claim that no DeepSeek-specific handling was found |

### Research Set C — Kimi

| Original ID | Consolidated finding | Disposition | Reconciliation note |
|---|---|---|---|
| F-01 | FIFE-001 | Merged | Content retained in consolidated root finding |
| F-02 | FIFE-003 | Confirmed | Direct/scoped observation retained |
| F-03 | FIFE-008 | Confirmed | Direct/scoped observation retained |
| F-04 | FIFE-009 | Confirmed | Scoped architectural risk retained; deployment mitigation unresolved |
| F-05 | FIFE-018 | Merged | Content retained in consolidated root finding |
| F-06 | FIFE-012 | Confirmed | Direct/scoped observation retained |
| F-07 | FIFE-014 | Merged | Content retained in consolidated root finding |
| O-01 | FIFE-016 | Merged | Content retained in consolidated root finding |
| O-02 | FIFE-015 | Merged | Content retained in consolidated root finding |
| O-03 | FIFE-019 | Confirmed | External evaluation mechanism retained; fork effect undetermined |
| O-04 | FIFE-018 | Merged | Content retained in consolidated root finding |
| U-01 | FIFE-020 | Unresolved | Raw usage export unavailable |
| U-02 | FIFE-001 / FIFE-002 / FIFE-003 / FIFE-008 | Unresolved | Dynamic reproduction absent across distinct paths |
| U-03 | FIFE-009 | Unresolved | External containment unknown |
| U-04 | FIFE-026 | Unresolved | Fixed-model/provider comparison absent |
| U-05 | FIFE-034 | Unresolved | Windows/Bun/runtime behavior unexercised |
| U-06 | FIFE-014 / FIFE-015 | Unresolved | Full upstream equivalence unestablished |
| D-01 | FIFE-040 | Unresolved | Goose deep audit deferred |
| D-02 | FIFE-040 | Unresolved | Exhaustive harness inventory deferred |
| D-03 | FIFE-040 | Merged | Internally inconsistent prompt-injection aggregates excluded |
| D-04 | FIFE-040 | Merged | Live pricing cannot substitute for accepted-task economics |
| S-01 | FIFE-028 | Merged | Analyst-assigned protected-strength ID |
| S-02 | FIFE-028 | Merged | Analyst-assigned protected-strength ID |
| S-03 | FIFE-028 | Merged | Analyst-assigned protected-strength ID |
| S-04 | FIFE-030 | Merged | Analyst-assigned protected-strength ID |
| S-05 | FIFE-030 | Merged | Analyst-assigned protected-strength ID |
| S-06 | FIFE-029 | Merged | Analyst-assigned protected-strength ID |
| S-07 | FIFE-031 | Merged | Analyst-assigned protected-strength ID |
| S-08 | FIFE-031 | Merged | Analyst-assigned protected-strength ID |
| S-09 | FIFE-031 | Merged | Analyst-assigned protected-strength ID |
| S-10 | FIFE-027 | Merged | Analyst-assigned protected-strength ID |
| S-11 | FIFE-033 | Merged | Analyst-assigned protected-strength ID |
| S-12 | FIFE-033 | Merged | Analyst-assigned protected-strength ID |
| R-01 | FIFE-029 | Merged | Analyst-assigned ruled-out/narrowed claim ID |
| R-02 | FIFE-008 | Merged | Analyst-assigned ruled-out/narrowed claim ID |
| R-03 | FIFE-031 | Merged | Analyst-assigned ruled-out/narrowed claim ID |
| R-04 | FIFE-028 | Merged | Analyst-assigned ruled-out/narrowed claim ID |
| R-05 | FIFE-027 | Merged | Analyst-assigned ruled-out/narrowed claim ID |
| R-06 | FIFE-033 | Merged | Analyst-assigned ruled-out/narrowed claim ID |
| R-07 | FIFE-030 | Merged | Analyst-assigned ruled-out/narrowed claim ID |
| R-08 | FIFE-032 | Merged | Analyst-assigned ruled-out/narrowed claim ID |
| R-09 | FIFE-021 | Confirmed | Analyst-assigned ruled-out/narrowed claim ID; high cache ratio rejected as efficiency proof |
| R-10 | FIFE-020 | Merged | Analyst-assigned ruled-out/narrowed claim ID |
| R-11 | FIFE-014 | Merged | Analyst-assigned ruled-out/narrowed claim ID |
| R-12 | FIFE-036 | Merged | Analyst-assigned ruled-out/narrowed claim ID |

## 7. Unique and minority findings retained

| Origin | Unique contribution | Final destination and reason |
|---|---|---|
| ChatGPT | Background verifier final-completion path | FIFE-002: distinct event-ownership root cause, not folded into absent-row persistence |
| ChatGPT | Logical revision excludes shell-driven changes | FIFE-004: separate from sequence and verifier identity |
| ChatGPT | Budgeted repository maps without proven search failure | FIFE-024: opportunity preserved without inflated priority |
| ChatGPT | Task-tier model routing and explicit resolver boundary | FIFE-025: selected path verified, local/plugin absence and benefit qualified |
| DeepSeek | FileStamp restart/TOCTOU limitations | FIFE-007: concrete minority finding retained with the guard’s strength |
| DeepSeek | Verifier cwd omission | FIFE-005: independent identity semantics retained |
| DeepSeek | Open-ended escalation and unproven effort benefit | FIFE-006: policy mechanism separated from absent-row and cache questions |
| DeepSeek | Hook trust/sensitive-input boundary | FIFE-010: not softened merely because hooks are user configured |
| DeepSeek | Config-hook lifecycle and skills/reference overhead | FIFE-011/FIFE-022: optional opportunities, not defects |
| Kimi | Empty-verifier inert-contract mismatch | FIFE-003: independent product-contract issue |
| Kimi | Transcript completeness wording | FIFE-008: low-severity fidelity issue retained |
| Kimi | Deployment-dependent containment boundary | FIFE-009: scoped and qualified rather than presented as an incident |
| Kimi | Release/main assurance and absent-row coverage | FIFE-012: external CI possibility retained |
| Kimi | Git-state outcome extraction and operational-to-accepted join | FIFE-019/FIFE-018: evaluation opportunities, not production defects |
| Kimi | Negative results on direct publication, DeepSeek support, cache/context proxies | FIFE-021/FIFE-027/FIFE-032: false-gap prevention retained |

No minority finding was discarded merely because another model omitted it. Overlapping items were merged only where they describe the same mechanism or measurement contract; background completion, absent rows, revision, cwd, and escalation stopping remain separate.

## 8. Outstanding evidence gaps and limitations

1. **Local state:** `Y:\CodingProjects\opencode_fife`, uncommitted work, installed version, actual configuration, and provider/model mix were unavailable. Public `main` is not assumed to be the user’s runtime.
2. **Runtime reproduction:** No fork test, application run, provider call, benchmark, fault injection, or security probe was executed. FIFE-001/FIFE-002/FIFE-003/FIFE-008 impacts remain unobserved even where mechanisms are verified.
3. **Background subscribers:** Bounded inspection did not exhaustively prove that no synthetic-completion consumer reaches effort evidence. FIFE-002 remains Supported rather than unconditional.
4. **Deployment containment:** External VM/container/process/network controls, credentials, and threat model are unknown. Incomplete negative searches do not establish exhaustive in-tree absence.
5. **Raw usage and acceptance:** The ZIP and accepted-task/review corpus were not supplied. Historical request/token/cache/cost figures cannot be recomputed or tied to tasks.
6. **Current upstream:** Two `anomalyco/opencode` `dev` commit-list attempts failed with authentication-service 503. All comparisons use `1bf08ae…`; no current-tip or complete-equivalence claim is made.
7. **Upstream semantics:** Not all 528 upstream commits or all fork changes were semantically audited; raw file/line counts include documentation, vendored content, and tests.
8. **Windows:** No live Windows/PowerShell/Bun/SSH/TUI behavior, symlink, quota, or provider test was performed.
9. **External systems:** Peer audits are selective and partly package-corroborated. Claude internals are proprietary; DeepSeek Harness is a preview; external benchmark numbers were not rerun.
10. **Release assurance:** External CI, branch protection, release checks, and actual pinned-SHA check outcomes were not available. Workflow presence is not a pass result.
11. **Product intent:** “Inert,” revision/staleness semantics, acceptable maintenance burden, and compatibility contracts require maintainer decisions where source cannot determine intent.
12. **Unmeasured opportunities:** Routing, effort benefit/cache effect, repository maps, memory/re-injection, skills overhead, nested-fork lineage, expanded hooks, and multi-agent value have no accepted-task effect estimate.

Each high-impact register entry states the future observation that would discriminate its competing explanations. Those are validation designs for separate authorization, not work performed or an implementation plan.

## 9. Final adversarial quality review

### Senior harness engineer

- **Challenge:** Did the synthesis confuse the runner, tool settlement, background notification, effort transition, and provider request paths?
- **Result:** These paths are separated in FIFE-001/FIFE-002/FIFE-017/FIFE-028. Tool settlement precedes the inspected effort observation; background final completion is treated as a distinct event path. Direct model-event publication is not mislabeled as a failure. Provider/model/cache interactions remain explicit confounds.

### Software architect

- **Challenge:** Did peer features become unjustified requirements or duplicate existing systems?
- **Result:** No. Codex app-server, DeepSeek plugins, Aider maps, Gemini checkpoints, long-term memory, routing, and extra hooks are comparators/opportunities. Existing compaction, session, permission, tool, and telemetry systems are protected. FIFE-014 avoids both blind merging and rewrite advocacy.

### Research methodologist

- **Challenge:** Were repeated AI claims, vendor figures, and proxies treated as independent causal evidence?
- **Result:** No. Shared SHAs and source lineage are disclosed; evidence entries are excluded from finding counts; external numbers are package-reported and configuration-scoped; accepted-task denominators include failures/rework; no effect sizes or improvement percentages are invented.

### Repository maintainer

- **Challenge:** Are claims tied to actual code and current conditions, with existing features and stale plans distinguished?
- **Result:** High-impact claims use the unchanged target SHA and exact files/symbols. DeepSeek support and transition-route errors are corrected. Documentation/status mismatch is retained without inferring intent. Current upstream and local state remain explicitly unrefreshed/unknown.

### Cross-document consistency checks

- Counts: **118 reviewed, 40 consolidated; 13 confirmed, 90 merged, 13 unresolved, 2 contradicted, 0 superseded** in all three documents.
- Revision: fork `07bae7483b6a7983bae2008407683097235e06c5`; upstream baseline `1bf08ae46a91f7793c756e4ee521e37b6b554064`.
- High-impact status: static mechanism verification is consistently separated from runtime prevalence and accepted-task outcomes.
- Cross-links: report ↔ register ↔ ledger use relative Markdown links; original IDs map to stable FIFE IDs.
- Scope: candidate directions and validation questions are not an implementation sequence.

## 10. Completion and verification audit

| Completion gate | Result |
|---|---|
| All supplied documents inventoried | **Met:** seven research documents plus controlling assignment; manifest and coverage above |
| Every material original finding disposition | **Met for the defined 118-unit census:** full crosswalk; five additional narrative peer syntheses included |
| Duplicates reconciled without erasing root causes | **Met:** 90 merged units; distinct absent-row/background/revision/cwd/escalation causes preserved |
| Important contradictions resolved or preserved | **Met:** two direct-source contradictions; unresolved intent/runtime/deployment questions retained |
| High-priority traceable evidence and confidence | **Met within static limits:** FIFE-001/FIFE-002/FIFE-018 anchors and qualifications supplied |
| Correct fork revision | **Met:** all fork claims scoped to published `main` target, not local state |
| Hypotheses and opportunities distinguished | **Met:** evidence labels, dispositions, and deferred groups in register |
| Practical personal-CLI shortlist | **Met:** accepted completion, conditional correctness/security, Windows and maintenance priorities; no arbitrary score |
| Three complete, consistent, cross-linked documents | **Met:** this ledger, consolidated report, and master register |
| No modification or implementation planning | **Met:** read-only research; no repository edits, tests, installs, destructive commands, or step-by-step plan |

No secrets, private operational traces, or unrelated private code were included. Deliverables were saved outside the repository under `/mnt/agents/output/`. The dossier is complete as a bounded evidence reconciliation, not as a claim of runtime, security, market, or upstream-exhaustive completeness.
