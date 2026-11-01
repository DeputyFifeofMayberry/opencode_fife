---
name: plan-hardening
description: >-
  Audit an existing technical implementation plan as a CTO, senior engineer,
  and adversarial reviewer; verify claims against available evidence; correct
  supported gaps and errors; and deliver an implementation-ready final plan,
  an evidence-based review report, and a change log. Use after a draft plan
  exists and before implementation or human approval.
---

# Plan Hardening

## Purpose

Turn an **existing** implementation plan into the strongest defensible version of that plan before execution. Review the design and the work required to implement it, challenge failure-prone assumptions, verify findings against the actual project, and **revise the plan itself**. A list of comments is not a finished review.

This skill is a **pre-implementation planning gate**. It does not authorize code changes, deployments, destructive operations, scope expansion, or bypassing human approval.

**Definition of success:** A competent engineer can execute the final plan with its dependencies, constraints, verification steps, and acceptance criteria understood. Claims are supported by evidence or explicitly marked as assumptions. No known unaddressed blocking issue is presented as resolved.

## When to use

- A planning agent has produced a draft that needs technical sign-off.
- An engineer or architect wants a second opinion before implementing.
- A plan affects architecture, data, security, integrations, deployment, or other high-risk areas.
- The user requests a CTO/senior-engineer audit, pre-mortem, gap analysis, or a corrected final plan.

**Do not use** to invent a project plan from nothing. If no draft exists, request or identify the plan first. If a draft exists but evidence is missing, still complete a bounded review and clearly label unverified matters.

## Inputs and authority

Read available inputs in this order:

1. **Original plan:** The draft to review, including its intended outcome and acceptance criteria.
2. **Approved project context:** Requirements, explicit user decisions, constraints, milestones, and agreed scope.
3. **Source of truth:** Relevant repository files, tests, contracts, schemas, configurations, ADRs, runbooks, and existing behavior.
4. **External technical evidence:** Official documentation, specifications, or upstream references when current behavior/version compatibility matters and research tools are available.
5. **Unverified statements:** Assumptions, suggestions, or opinions, always labeled as such.

When sources conflict, preserve approved requirements and explicit human decisions; report the conflict instead of silently choosing a different goal. Do not treat a prior plan's assertions as proof of repository state.

If repository access exists, check that the intended checkout/workspace is correct before interpreting source code. Record the inspected revision/branch or an equivalent identifiable baseline. If access is unavailable, state that the review is document-only. Never invent paths, tests, commands, source references, or validation results.

## Operating contract

- **Preserve intent.** Keep approved scope, functional requirements, nonfunctional constraints, and explicit decisions unless the user authorizes a change.
- **Verify before criticizing.** Cite specific available evidence for factual findings; distinguish verified defects, credible risks, and unverified questions.
- **Prefer minimal sufficient change.** Recommend the simplest plan revision that actually fixes the issue. Avoid speculative rewrites, architectural churn, and scope creep.
- **Make disagreements explicit.** Distinguish correctness problems from design preferences and explain material tradeoffs.
- **Do the revision.** Resolve findings in the final plan, not just in a side report. Keep the original plan intact unless replacement is explicitly authorized.
- **Do not fake certainty.** A plan can be conditionally ready or blocked; never mark an unverified critical dependency as verified.
- **Respect gates.** Material changes to authorized scope, cost, schedule, architecture, public interfaces, privacy/security posture, or operational risk require appropriate human approval.
- **No implementation by default.** Review source in read-only fashion where possible. Do not modify production state, commit code, install dependencies, or run potentially destructive commands as part of plan hardening.

## Adaptive review depth

Select the lightest tier that can reasonably discover consequential defects; record the tier and why it was chosen.

| Tier | Use when | Required review |
| --- | --- | --- |
| **Quick** | Small, localized, reversible change with known patterns and low impact | Feasibility, touched files/contracts, missing steps, acceptance checks, concise revision |
| **Standard (default)** | Most feature work, refactors, or moderate integration changes | Full CTO and senior engineer passes, targeted pre-mortem, evidence-based revision, final verification |
| **Deep** | Major redesign, production data migration, authentication/authorization, security, destructive/irreversible action, critical infrastructure, significant compatibility or regulatory exposure | Separate architectural and implementation risk inventories, systematic failure scenario analysis, migration/rollback readiness, independent verification where possible, explicit approval gates |

Escalate depth if discovery reveals higher risk. Do not increase depth solely because a plan is long. For trivial corrections, do not manufacture sections or reviewers.

## Workflow

### 1. Establish the baseline

Before changing anything:

- Capture the original plan identifier/path and version, if known.
- State the goal in one or two sentences.
- Extract hard requirements, out-of-scope boundaries, agreed decisions, and measurable acceptance conditions.
- Identify affected components, existing contracts, operational environments, dependencies, and stakeholders.
- Locate applicable evidence. Note unavailable or stale information.
- Build a short traceability map from **requirement → planned work → verification**, marking missing links.

Do not confuse lack of documentation with proof that implementation is absent.

### 2. CTO / architecture pass

Review the plan for:

- Alignment with the actual problem, approved scope, and strategic constraints.
- Coherent boundaries, ownership, interfaces, data/control flow, and system interactions.
- Compatibility with existing architecture and supported versions.
- Simpler viable alternatives and accidental complexity.
- Maintainability, operability, observability, extensibility, and avoidable technical debt.
- Security/privacy trust boundaries, permission assumptions, and sensitive data handling where relevant.
- Reliability, failure isolation, resilience, and sensible recovery/rollback choices.
- Cost, performance, capacity, deployment, and operational consequences when material.
- Decisions made without adequate evidence or alternatives.

**Challenge the design without reflexively redesigning it.** An alternative is worth proposing only when its expected benefits outweigh migration cost, risk, and lost consistency.

### 3. Senior engineer / execution pass

Walk through the proposed implementation as if assigning it to an experienced engineer:

- Are target modules, files, functions, interfaces, and contracts correctly identified?
- Do changes follow a feasible dependency order?
- Are prerequisites, environment assumptions, versions, feature flags, and configuration accounted for?
- Are data changes, compatibility, backward compatibility, and migration sequencing specified where applicable?
- Are error handling, input validation, concurrency, idempotency, retries, timeouts, and edge cases addressed where relevant?
- Could a step break callers, tests, CI, deployment, or existing workflows?
- Are integration seams, external dependencies, and ownership boundaries explicit?
- Are the tasks precise enough to implement without making major undocumented design decisions?
- Do tests prove the required behavior, guard important regressions, and exercise meaningful failure paths?
- Is the release, rollback, monitoring, and recovery approach proportional to risk?

Distinguish **must-fix omissions** from optional engineering improvements.

### 4. Adversarial pre-mortem

Assume the plan was implemented and failed. Identify the most plausible ways that could happen, such as:

- An implicit dependency was missing or sequenced incorrectly.
- An assumption contradicted actual behavior or a third-party contract.
- Happy-path tests passed but an edge case or failure mode was missed.
- Rollout succeeded technically but broke existing users or workflows.
- A migration could not be recovered or rolled back.
- Performance, security, or reliability regressed in production.
- Acceptance criteria were satisfied on paper but did not test the true objective.

For each meaningful scenario, identify its trigger, impact, detection method, and **specific change to the plan** that reduces the risk. Do not flood the report with generic hypotheticals without credible applicability.

### 5. Record and prioritize findings

Create a finding only when it can be stated concretely. Each finding must contain:

- **ID and title**
- **Severity:** Blocker / High / Medium / Low
- **Status of evidence:** Verified / Likely / Unverified
- **Where:** Affected plan section and repository/document reference, when available
- **Issue:** Exact gap, contradiction, error, or credible failure mode
- **Impact:** What could go wrong and why it matters
- **Required disposition:** Fix in plan / Decision needed / Accept documented risk / No change
- **Resolution:** The precise edit or explicit reason it remains open

Severity guidance:

| Severity | Meaning | Gate behavior |
| --- | --- | --- |
| **Blocker** | Plan is infeasible, unsafe, internally contradictory at a critical point, or lacks a required decision that prevents responsible execution | Do not approve until resolved or an authorized decision is recorded |
| **High** | Material risk of incorrect behavior, data loss, security exposure, or major rework | Resolve or obtain explicit risk acceptance before approval |
| **Medium** | Significant implementation ambiguity, omitted tests, preventable regression, or maintainability concern | Resolve when proportionate; otherwise record justified deferral |
| **Low** | Minor clarification or optional improvement | Improve if inexpensive; do not block |

A finding may be serious yet **unverified**. State what evidence or decision is needed rather than converting suspicion into fact. Do not present style preferences as defects.

### 6. Revise and consolidate the plan

Produce a complete **standalone** final plan that replaces the draft for implementation purposes. It must not force the implementer to cross-reference the review report to discover the required work.

Apply verified fixes directly. When resolving a likely risk, state the assumption and add a verification step if necessary. Preserve all unaffected valid content. Reorder tasks and add missing prerequisites when justified. Remove duplicated, contradictory, or obsolete instructions only with an explanation in the change log.

Include these elements when applicable; avoid empty boilerplate sections:

1. **Objective and boundaries** — desired outcome, explicit non-goals, constraints, decisions requiring approval.
2. **Evidence and assumptions** — inspected baseline, relevant contracts, known facts, unresolved assumptions.
3. **Technical approach** — architectural choice, key interfaces/data flows, reasons for significant tradeoffs.
4. **Implementation sequence** — numbered tasks, ownership/targets, prerequisites, dependencies, expected result per task.
5. **Verification** — unit/integration/end-to-end/regression/security/performance checks as relevant, with clear pass conditions.
6. **Release and recovery** — rollout, compatibility, migration, monitoring, rollback where risk warrants it.
7. **Acceptance criteria** — observable outcomes linked to original requirements.
8. **Remaining risks and decisions** — only genuine unresolved items, with owner and consequence.

Be specific about actions and outcomes, but avoid inventing exact commands or file paths that have not been validated.

### 7. Independently verify the revised plan

Prefer a **fresh-context reviewer** (a different agent or a separate review session with only the final plan, approved requirements, and relevant evidence). Independence matters more than simulated job titles. If an independent reviewer is unavailable, perform a distinct final verification pass and disclose that limitation.

Check:

- Every approved requirement has at least one implementation step and a measurable acceptance check.
- No accepted constraint or deliberate decision was silently removed.
- Interfaces, dependencies, sequencing, and references are internally consistent.
- Findings marked fixed are actually resolved in the final plan.
- Changes made during revision did not introduce new gaps or contradictions.
- Relevant tests, rollout, and recovery are proportionate and feasible.
- Remaining blockers, approvals, and unverified assumptions are visible.
- The plan is executable without relying on unpublished reviewer commentary.

**Bound the loop:** Allow up to **two substantive revision-and-verification cycles**. If material unresolved issues remain, mark the outcome **BLOCKED** or **CONDITIONAL** and escalate; do not spin indefinitely or force a clean approval.

### 8. Make the gate decision

Return exactly one outcome:

- **READY:** No known unresolved blockers/high risks; required evidence and acceptance checks are sufficient for the selected review tier.
- **CONDITIONAL:** The plan is substantially complete but has explicit assumptions, approvals, or accepted risks that must be addressed before affected work proceeds.
- **BLOCKED:** A required decision, critical inconsistency, unverifiable safety-sensitive premise, or unresolved blocking/high-severity issue prevents responsible execution.

Never equate an AI review with human authorization. Human approval is still required wherever established by the project or the operating contract.

## Deliverables

Write these three Markdown files in the task's agreed output location, preserving the original draft:

### `implementation-plan.final.md`

The complete corrected plan. Suggested header:

```markdown
# Final Implementation Plan — <project/task>

- Status: READY | CONDITIONAL | BLOCKED
- Review depth: Quick | Standard | Deep
- Based on: <draft path/version>
- Evidence baseline: <repository revision and documents inspected, or "document-only">
- Required approvals: <none / specific decisions>
```

Then provide the applicable plan sections from step 6. Do not describe the work as implementation-complete merely because planning is complete.

### `plan-review-report.md`

Include:

```markdown
# Plan Review Report — <project/task>

## Verdict
<READY | CONDITIONAL | BLOCKED and a short reason>

## Review scope and evidence
<review tier; inspected repositories/revisions/docs; unavailable evidence>

## Findings
| ID | Severity | Evidence status | Finding | Evidence/reference | Resolution | State |
| --- | --- | --- | --- | --- | --- | --- |

## Traceability and verification
<requirements coverage; tests/acceptance checks; independent review result>

## Open decisions and residual risks
<item, owner/decision-maker, impact, required next action>

## Review limitations
<tools/repository/docs not accessible; unperformed verification>
```

Finding states: **Resolved**, **Risk accepted**, **Deferred**, or **Open**. Never mark **Resolved** merely because the issue was mentioned in the report.

### `plan-change-log.md`

Include:

```markdown
# Plan Change Log — <project/task>

| Change ID | Original section | Change in final plan | Reason / finding ID | Requirement impact | Approval needed? |
| --- | --- | --- | --- | --- | --- |

## Preserved decisions and scope
<material requirements/decisions intentionally retained>

## Changes not made
<significant suggestions declined, with rationale>
```

Ensure the log lets an owner distinguish corrections from new proposals. If nothing needs revision, explicitly say so; still produce the final plan and review report.

## Handoff to agent workflows

Recommended sequence:

```text
DRAFT_PLAN
    ↓
PLAN_HARDENING
    ├─ CTO / architecture pass
    ├─ Senior engineer / execution pass
    ├─ Adversarial pre-mortem
    └─ Plan revision
    ↓
FINAL_PLAN_VERIFICATION
    ↓
READY / CONDITIONAL / BLOCKED
    ↓
HUMAN_APPROVAL (where required)
    ↓
IMPLEMENTATION
```

- **OpenCode:** Invoke this skill after the Plan agent completes its draft and before the Build agent begins. A fresh verification session is preferred for significant work.
- **Paperclip or another orchestrator:** Treat plan hardening as a distinct task/gate with durable artifacts, dependencies, and an explicit verdict. Use its native review/approval states rather than assuming the gate has approved itself.
- **Single-agent use:** Run the CTO, engineer, and pre-mortem lenses sequentially, then perform a separate final verification pass. Do not pretend these are independent model reviews.

The integration must be adapted to the orchestrator's real configuration and capabilities. This skill alone does not automatically wire itself into either system.

## Response format

Start the response with the **verdict** and the location of `implementation-plan.final.md`. Then briefly state material changes, open blockers/approvals, evidence limitations, and paths to the other two artifacts. Keep the detailed analysis in the artifacts rather than duplicating it in chat.

## Final self-check

Before returning, confirm:

- [ ] The original goal, constraints, and approved scope are preserved.
- [ ] Factual findings point to evidence or are labeled unverified.
- [ ] The final plan incorporates the supported corrections.
- [ ] Dependencies, tests, acceptance criteria, and relevant recovery steps are actionable.
- [ ] Every Blocker/High finding is resolved, explicitly accepted by an authorized party, or remains visible as an approval blocker.
- [ ] The change log explains material edits and rejected alternatives.
- [ ] The final verification and any independence limitation are recorded.
- [ ] The verdict matches the actual state of unresolved issues.
- [ ] All three deliverables exist and can be read independently for their respective purposes.
