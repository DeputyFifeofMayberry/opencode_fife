# Agent Instructions

This file is migrated from the standalone `Y:\CodingProjects\my-custom-stuff\agents` archive. The canonical role sources are now `.opencode/agents/` in this repository. The standalone tree is read-only migration history; do not edit it as source.

Prompt/agent-definition library: Markdown role contracts plus the research backing them. The managed install copies the roles to the global config root; the repository copies remain the project-scoped source of truth.

## Layout

| Path | Role |
|------|------|
| `../../.opencode/agents/spec-writer.md` | Primary orchestrator: clarification, spec authoring, approval gates, handoff to Implementer → Tester → QA |
| `../../.opencode/agents/implementer.md` | Implementation role |
| `../../.opencode/agents/tester.md` | Subagent role: independent verification and test authoring |
| `../../.opencode/agents/qa.md` | Subagent role: acceptance-readiness review |
| `research/` | Evidence base justifying the role definitions |

## Role File Contract

- Every role file opens with YAML frontmatter: `description`, `mode`, `permissions`.
- `mode` values in use: `primary`, `all`, `subagent`.
- Body structure: one `# Title`, then numbered `## N. Section` headings; subsections use `###`.
- Preserve gates, authority boundaries, escalation rules, evidence standards, and handoff formats when editing — they are the operative content.

## Conventions

- New files: lowercase kebab-case with `.md` (e.g. `spec-writer.md`).
- Long-form reference material goes under `docs/<topic>/`.
- `CHANGELOG.MD` keeps its uppercase extension; do not rename it.
- Cite `research/` rather than restating its findings inside role files.
- Each rule has one authoritative home. Other files reference it rather than restating it; check for conflicting cross-file instructions when editing.
- Add a rule only when it prevents a concrete, observed failure. Prefer short role-specific policy over comprehensive prompt text.
- Validate frontmatter and permission semantics against the OpenCode version in use. A rule the harness does not enforce is documentation, not a control.
- When evaluating a role file, record per-phase token/cost/latency, correction cycles, and human interventions. Treat unmeasured claims as hypotheses.

## External References

| Need | File |
|------|------|
| Agent design evidence | `research/ai_coding_agent_research_2026.md` |
| Evidence-to-design matrix | `research/ai_agent_evidence_design_matrix_2026.md` |
| LLM reasoning and spec research | `research/llm-research.md` |
