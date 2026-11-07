# Cold-session context: live model checks

Result: Mixed. The model followed several task-specific guide and skill routes, but did not follow the instruction to read the communication guide before preparing prose. These are five single-run observations, not a reliability estimate or complete acceptance test.

## Setup

- User explicitly requested live testing after the correction and self-tests. Tests ran on the uncommitted `dev` tree at `0d2111f091` plus the reported pending changes; the installed executable was not updated.
- Source CLI, `--standalone`, private in-memory session database, temporary home/data/state, and separate short-lived sessions. The actual configured Mistral credential was supplied to the child process through its environment and was not printed or copied to disk. The shared managed server was not restarted.
- Model: `mistral/deepseek-v4-1-flash-1017#max`. The project's root and `packages/core` were used as session locations. The global OpenCode configuration and plugin cache were made available; the router overrides were copied into the temporary profile. Logs for the local-status run show `opencode-model-router@2.9.1` loading and Context7 connecting with two tools. The final post-hook system payload was not captured, so the exact router contribution is unverified.
- All prompts requested read-only behavior; tool events were inspected for completed reads and skill activations. No source file was modified by the model, and no live TUI was started. Provider usage is reported by OpenCode; input totals below add noncached and cached input.

## Observations

| Scenario | Session directory | Observed tool use | First model-call input |
| --- | --- | --- | ---: |
| Explain a Session step and assistant turn | Repository root | Read `session-core.md`; later used read, grep, and glob. Did not read `technical-communication.md`. | 17,038 tokens (16,142 uncached, 896 cached) |
| Explain a Session step and assistant turn, briefly | `packages/core` | Read the root `session-core.md` by absolute path before answering. Did not read the communication guide. | 17,038 tokens (15,246 uncached, 1,792 cached) |
| Write a reusable prompt for construction meeting notes | Repository root | Loaded `construction-humanizer` and `craft-prompting` before writing the prompt. Did not read the communication guide. | 17,041 tokens (16,657 uncached, 384 cached) |
| Review repository TypeScript import conventions | `packages/core` | Read the root `coding-style.md` by absolute path; used grep and read for supporting checks. Did not read the communication guide. | 17,042 tokens (15,250 uncached, 1,792 cached) |
| Explain local-install status and reporting without running commands | `packages/core` | Read root `local-updates.md` by absolute path, then inspected local-development documentation. Did not read the communication guide. | 17,033 tokens (16,137 uncached, 896 cached) |

In the prompt-writing run, the next call after loading the two skills reported 26,466 input tokens, versus 17,041 on the first call. The difference includes the loaded skill content and intervening conversation or provider effects; it is not an isolated per-skill token measurement. In the short subdirectory Session run, the next call after the guide read reported 18,117 input tokens, versus 17,038 on the first call; that change also includes intervening model output and message framing.

## Findings and limits

- **Observed routing failure:** `AGENTS.md` tells the agent to read `technical-communication.md` before preparing prose or explaining a technical decision. None of the five runs read it before producing an answer. This confirms non-adherence in these runs; it does not establish the cause or performance on other models or prompts.
- **Observed positive routing:** the Session guide was read in both locations, the code-style and local-update guides were read from a subdirectory using absolute root paths, and two relevant skills were selected for the construction-prompt scenario. Other required scenarios and negative cases were not exercised.
- The roughly 17,000-token first-call results are real provider-reported input for this isolated setup. They cannot be directly subtracted from the earlier historical 20,864–23,895 range as measured savings: configuration, plugin state, prompts, model, cache, and revisions were not controlled across those observations.
- No before/after provider comparison, per-category provider token attribution, full router request capture, model reliability study, or independent QA was performed. Later context and total task cost can grow after on-demand reads.

The earlier QA failure remains open; a user-authorized correction and independent retest are required before claiming acceptance. No correction is made in this testing stage.
