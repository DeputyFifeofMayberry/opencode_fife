---
name: lessons-learned
description: Use when the user asks to collect, record, or review repository-wide lessons learned from AI coding agents, or says "lessons learned", "what did we learn", or "record agent lessons". Manually consolidates reusable lessons from the current session into docs/agent-lessons.md. Documentation only; no automatic collection and no new investigation.
---

# Lessons Learned

Manually collect durable, repository-wide lessons that should improve future work, then consolidate them into the current repository's `docs/agent-lessons.md`.

## When To Use

- The user asks to collect, record, or review lessons learned.
- The user asks what the agents learned that should change future work.
- Do not run automatically. Do not use for ordinary task summaries, postmortems that need root-cause analysis, or workflow changes.

## Scope

Record lessons that apply beyond the session that produced them: recurring mistakes, process gaps, tooling pitfalls, unresolved difficulties, and noteworthy observations that should change how future work is done.

Do not record project decisions, feature outcomes, status updates, or one-off task results. A decision belongs in the spec, report, or commit that made it. An entry should describe a reusable problem, not what was decided in a particular session.

## Workflow

1. Read `docs/agent-lessons.md` if it exists. Preserve every existing entry.
2. Gather only substantiated observations from the current context:
   - The current session transcript.
   - Reports from participating agents that are already present.
   - The repository's existing lessons file.
   Do not spawn new agents, run new tests, or start new investigations.
3. Select only repository-wide lessons that improve future work: recurring mistakes, process gaps, tooling pitfalls, unresolved difficulties, and noteworthy observations. Skip project decisions, feature outcomes, status updates, one-off task results, routine work, preferences, and unverified guesses.
4. For each candidate, check the existing file for the same problem and location. Update the existing entry instead of adding a duplicate. Append new evidence to `Observations`, or change `Status` only when the context contains evidence of resolution.
5. Add new entries with the next sequential number, zero-padded to three digits.
6. If nothing qualifies, leave the file unchanged.
7. Report how many entries were added or updated. Do not count entries that were only reviewed.

## Entry Structure

Use exactly these five fields. Do not add fields.

```md
## LL-001 — Brief Problem Title
- **Status:** Open
- **Reported By:** Agent name
- **Location:** Repository path or subsystem
- **Problem:** Brief description
- **Observations:** Concise factual findings
```

- `Status`: `Open` or `Closed`. Close only when the context contains evidence that the problem is resolved.
- `Reported By`: the agent that observed the problem. Use the agent's role name, not a model name.
- `Location`: the repository path, subsystem, or workflow stage where the problem occurred.
- `Problem`: one or two sentences. State the reusable problem, not the task outcome or decision.
- `Observations`: factual evidence. Include dates, counts, commands, or file references when they are already in context. Do not record the project decision or final outcome unless it is evidence for the lesson. A recommendation is allowed as the final sentence, prefixed `Recommendation:`. Do not add a separate field.

## Rules

- Manual invocation only. No automatic collection.
- Documentation only. Do not perform root-cause analysis, apply corrective actions, or modify workflows. A recommendation may be recorded, but it must not be applied by this skill.
- Keep entries high-level and concise. One entry per distinct problem.
- Do not invent findings. If the context does not support a claim, omit it.
- Do not assume access to another agent's private context. Use only reports that are already available.
- Do not interrupt or expand the original task. Finish the lesson collection and return to the user.
- No scripts, dependencies, or additional infrastructure.

## Reporting

End with one short line: `Lessons: N added, M updated.` If nothing qualified, say `Lessons: no changes.`
