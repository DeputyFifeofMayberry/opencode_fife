---
description: Plan a multi-agent workflow; does not execute it
agent: planner
subtask: true
---

# Orchestrate Command

Plan a multi-agent workflow for this task: $ARGUMENTS

## Your Task

1. **Analyze the task** and break it into phases.
2. **Map each phase** to an available specialist or slash command.
3. **State dependencies** and which phases can run in parallel.
4. **State verification gates** after each phase.
5. **Produce a copy-pasteable workflow** for the user.

This command only plans. It does not execute other agents. The planner is a read-only subagent with fresh context. Do not claim to coordinate, spawn, or synthesize results from other agents. Tell the user to run the commands, or ask Build to execute them one at a time.

## Available Specialists

| Specialist | Use for |
|------------|---------|
| planner | Implementation planning |
| architect | System design and trade-offs |
| code-reviewer | Read-only code review |
| security-reviewer | Security review; instruct it not to edit |
| tdd-guide | Test-first implementation |
| build-error-resolver | TypeScript/build error clusters |
| e2e-runner | Playwright E2E tests |
| doc-updater | Documentation and codemaps |
| refactor-cleaner | Dead code and duplication |
| database-reviewer | Query and schema review |
| docs-lookup | Current library/API documentation |
| explore | Read-only codebase exploration |
| general | Bounded multi-step work or parallel research |

## Preferred Commands

Use existing commands where they fit: `/plan`, `/tdd`, `/code-review`, `/security`, `/e2e`, `/refactor-clean`, `/update-docs`, `/verify`.

## Output Format

### Task Summary

Restate the goal, constraints, and acceptance criteria.

### Phases

#### Phase 1: [Name]

- Command or specialist: [exact command or agent id]
- Task: [specific task]
- Depends on: [none or previous phase]
- Verification: [check to run]

#### Phase 2: [Name] (parallel)

- Command or specialist: [exact command or agent id]
- Task: [specific task]
- Depends on: Phase 1
- Verification: [check to run]

### Verification Gates

- After each implementation phase, run the relevant package checks.
- Final gate: run `bun run check` and inspect the diff.

### Execution

- Run the commands in order.
- Do not ask the planner to run them.
- Stop and ask the user when a phase changes scope or fails verification.
