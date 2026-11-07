# Cold-session context reduction: testing

Result: Failed; required behavioral verification is also incomplete.  
Specification: `.opencode/specs/2026-11-06-cold-context-reduction.md`, approved R1, SHA-256 `ABD570FEC039B2F4CE4743D34D23EBB1C526F0EE50E1960846AA5DFE84F737EE`.  
Authorization: the user authorized this Tester stage in chat.  
Tested state: `dev` at `0d2111f09181c59b17c777d603dd8d684ee1f25b` plus the uncommitted implementation and reference files listed in the implementation report. No implementation files were modified during this testing pass.

Independence: the same assistant implemented and tested this change. This is a separate testing pass, not independent Tester-agent evidence. QA has not been authorized or performed.

## Finding T-01: Communication trigger does not cover all prose

- Criteria: R-02, AC-03 and AC-04.
- Evidence: the approved spec's AC-04 calls for a route to applicable communication guidance when explaining a technical decision **or preparing prose**. Root `AGENTS.md:123` directs the agent to the complete communication guide only for substantial technical explanations or decisions. A prose task such as drafting a routine nontechnical email does not meet that stated trigger. Some general communication guidance and the advertised Humanizer skill remain, but the root instruction does not route all applicable prose work to the moved guide.
- Expected: the approved prose-work trigger has a clear route to the complete applicable guidance, or the spec is changed through the appropriate approval process.
- Actual: the explicit route is narrower than the approved prose condition. No live-model execution was used, so this is a confirmed instruction-coverage mismatch, not proof of a particular model's response.
- Impact: an agent may miss guidance that was previously always in the initial project instructions. This matters because the user's condition for moving material was that it remain accessible when needed.
- Reproduce: compare `AGENTS.md:121-123` with the communication row under AC-04 in the specification.

## Coverage and results

| Requirement / criterion | Result | Evidence and boundary |
| --- | --- | --- |
| R-01, AC-01/02 | Incomplete | The fixture ran and reported 50,130 to 30,797 serialized characters. It measures the real request-preparation function with a synthetic hook and one synthetic tool; actual configured router, MCP, provider formatting and provider token counts were not measured. |
| R-02, AC-03 | Incomplete / failed in part | All eight original sections were found verbatim in their destinations, and each destination is referenced from root instructions. T-01 identifies an incomplete communication trigger. No live resolution of all destinations was performed. |
| R-02, AC-04/05 | Failed / incomplete | T-01 fails the written prose-route condition. The actual agent has not been observed loading the correct destination before all required actions, from both root and subdirectory contexts or on a path bypassing native read discovery. Relative `.opencode/references/...` paths do not exist under `packages/core`; whether the agent resolves them from the workspace root is unverified. |
| R-03, AC-06/07 | Incomplete | Skill catalog and skill-tool tests passed, including missing and denied skills in isolated fixtures. No live-model selection test was run for the shortened descriptions, and later loaded skill-body sizes were not measured. |
| R-03, AC-08 | Partial | Agent manifest check passed. The implementation reports 43 agent-system tests passed, but they were not independently rerun in this testing stage. Installed/project precedence after the changes was not exercised here. |
| R-04, AC-09 | Incomplete | The Code Mode package tests passed for real interpreter/tool behavior and error paths. They do not establish how a model responds to the revised execute description, nor compare the actual configured catalog before and after. |
| R-04, AC-10 | Partial | The implementation report identifies the external router and proposes a separately scoped review. No change to the installed package or actual router request was tested. |
| R-05, AC-11/12 | Incomplete | Required live routing scenarios, actual provider tokenization, and real-plugin request capture were not run. The implementation report marks these gaps. |
| R-05, AC-13 | Incomplete | The fixture shows a smaller synthetic request, but the impact on task performance and guidance adherence is unverified. |

## Checks executed

All tests were run on the uncommitted working tree described above; no provider call, live TUI, installed-app update, or shared-server restart was performed.

- `packages/core`: `bun test test/instruction-discovery.test.ts test/tool-skill.test.ts test/skill/instructions.test.ts test/codemode/catalog.test.ts` — **Passed**, 41 tests. Instruction discovery uses isolated temporary fixtures and a test watcher. The skill tests exercise permitted, missing, and denied paths with fixtures.
- `packages/codemode`: `bun test test/codemode.test.ts` — **Passed**, 55 tests. The `fetch` used in these tests is an injected fixture function. Tests cover tool calls, host failures, search, and interpreter behavior; they do not validate model interpretation of instructions.
- `packages/core`: `bun run script/measure-cold-context.ts 0d2111f091` — **Passed as an offline synthetic measurement**, reproducing 50,130 and 30,797 serialized characters. It uses an in-memory database and test plugin fixture, not the actual router or live provider.
- Repository root: `bun run agent:manifest -- --check` — **Passed**, 4 agents and 42 managed skills.
- A read-only script compared each original section at `HEAD` to the five new reference files: all eight sections were found verbatim, and each reference path appears in root `AGENTS.md`. This establishes text preservation only.

## Handoff

Return T-01 and the incomplete criteria to the Spec Writer. A correction stage and subsequent retesting require the user's separate authorization. Do not mark the implementation verified or begin QA from this report.
