# ECC native hooks: verification

The native adapter `ecc.fife` is enabled by one explicit entry in `.opencode/opencode.jsonc`. It uses this fork's Promise plugin API. The legacy plugin stays disabled.

## Verified behavior

- Shell environment values use the active project, ECC version, package manager, and profile. Explicit `CLAUDE_PLUGIN_ROOT` values survive. The server's process environment stays unchanged.
- Successful native write/edit/patch outputs track changes by session. Patch moves retain source and destination. Failed calls do not record successful edits. Repeated call IDs do not duplicate warnings.
- Advisory text preserves native structured content and output. Missing files report an unavailable check. Inspection reads at most 256 KiB per file and checks resolved paths before reading.
- Compaction adds one bounded context block and preserves the existing system content and result. Separate locations and sessions keep independent file sets.
- Native terminal events retain their actual outcome. Shutdown interruption preserves recoverable context. Deprecated idle events do not trigger a second audit. Filesystem events reconcile known paths without assigning external work to a session.
- Unload and partial setup failure dispose registrations. Unload joins the subscription and pending checks. Reload registers one active set of callbacks.
- Explicit strict-profile Bun checks preserve literal Windows arguments containing spaces, `&`, `%NAME%`, and `!NAME!`. Their working directories must resolve inside the project. Nonzero exits, timeout, cancellation, and unsupported shims are visible. Windows timeout and unload tests verify that both the owned child and its descendant have exited.

## Executed checks

Tested on Windows with Bun `1.4.4` and installed CLI `v0.0.0-dev-20261027183248265`. The source checkout was `dev` at `cf423e43d13b29b46267e9adae1bf5a218a443e8`, with the earlier ECC installation preserved.

| Check | Result |
| --- | --- |
| Initial loader test before hook registration was implemented | Behavioral RED: expected two tool registrations, received zero |
| `bun run test test/ecc-hooks --coverage` from `packages/core` | 18 passed, 0 failed; production adapter line coverage exceeds 80% in each module |
| `bun check --no-script -p .opencode/ecc/plugin/tsconfig.json` from root | Passed |
| `bun run typecheck` from `packages/core` | Passed |
| `bun run check` from root | Passed: lint and all 35 typecheck tasks; existing lint warnings remain |
| Private installed-CLI smoke with the final repository config | 311 ECC skills, 14 custom skills, 27 agents, 35 commands; reviewer edit denial retained; native shell hook dispatched |
| Private installed-CLI enabled/disabled smoke from a clean source copy | Enabled: `true\|bun\|2.2.3`; disabled: `\|\|`; no copied `node_modules` |
| Configuration/schema/catalog validation | Accepted without diagnostics; all 325 skills parsed; 61 file references resolved; unrelated config preserved |
| `git diff --check` | Passed |

The wider command `bun run test test/plugin test/config test/tool-edit.test.ts test/tool-write.test.ts test/tool-patch.test.ts` reported **766 passed, 1 skipped, 10 failed** while this adapter was still inactive. Four command-subagent tests expect Unix `printf`, which Windows PowerShell rejects. Two config discovery tests and four config reload tests discover the real user `.agents` directory in addition to the fixture directories. Those failures are outside this adapter's runtime path; no core production source or existing tests were changed to suppress them. The wider suite is not green.

Shell dispatch was exercised through the installed binary. Edit, compaction, lifecycle, and teardown behavior were exercised through the production Promise adapter using typed native hook/event fixtures. No paid model calls were made. A complete model-driven CLI editing conversation was not run.

## Reproduce and disable

From `packages/core`, run `bun run test test/ecc-hooks`. From the repository root, run the explicit adapter typecheck above. To repeat the isolated installed-binary smoke on Windows:

```powershell
node packages/core/test/ecc-hooks/runtime-smoke.cjs 'C:\Users\barne\.local\bin\opencode.exe'
```

Pass a different absolute CLI path when needed. The helper copies source without development dependencies and starts only owned `serve --stdio --port 0` processes, with private credentials and separate database/data/config/cache/state. It prints the temporary report directory. It leaves those reports available for inspection and closes its owned server processes. No shared service is restarted.

Set the plugin entry's `options.enabled` to `false`, or remove that entry, to disable it. The native host invokes awaited cleanup on unload. The private smoke verifies enabled and disabled startup; the native harness verifies unload/reload and process cancellation. No CLI rebuild or database rollback is needed.

The ignored local development junction at `plugin/node_modules/effect` remains because automatic approval review blocked its removal. It is not part of the Git changes. The clean-copy runtime smoke confirms the adapter does not require it. An optional `oxlint --no-ignore` probe also hit a linter panic; the normal required root check passed.

## Limits and defaults

The standard profile is enabled. Automatic checks, permission auto-approval, observers, telemetry, modal notifications, hook-based learning, and legacy custom tools are disabled. Console-log inspection is a bounded text scan, not a JavaScript parser. Native mutation tools retain formatting and permission ownership.

Source pin, adaptations, license, and options are documented in [provenance.md](provenance.md).

## 2026-10-28 integration corrections (branch `ecc-integration-fixes`)

Rerun after the six ECC integration corrections (instruction bridge, command suffixes, helper bodies, v1 metadata, docs fallback, provenance/contract):

- Installed-assets contract: `packages/core` `bun run script/test.ts test/ecc-hooks` — 31 pass, 0 fail (includes the new `catalog.test.ts`).
- Native skill/instruction suites (Q-02 lines 1-2): 24 pass (skill/instructions/config-skill/tool-skill/session-skill) and 39 pass (instruction/session/skill discovery and state), 0 fail.
- `bun check` for `packages/core` (`tsconfig.tests.json`): clean after fixing the new test's types. The adapter-scoped check reports one pre-existing error in `packages/ai/src/protocols/shared.ts:450` (`process.getBuiltinModule` typing), untouched by this branch.
- Q-04 harness path: `node .opencode/scripts/harness-audit.js repo --format json --root .` exits 0 with deterministic JSON (16 checks) after `npm ci --prefix .opencode`.
- Q-06 private smoke with the installed host `0.0.0-dev-20261028090130226`: enabled `true|bun|2.2.3`, disabled `||`, real shell dispatch both phases, `modelCalls: 0`, `sharedServiceRestarted: false`. Note: run it with `ECC_PLUGIN`, `PACKAGE_MANAGER`, and `ECC_VERSION` unset — an adapter-managed session exports them, and the smoke inherits `process.env`, so a managed-session run falsely shows enabled values in the disabled phase.
- Known unrelated failures at the base tip (`a53bbd5390`), reproduced in a clean base worktree: all four `test/config/command-subagent.test.ts` cases ("runs … in the background without switching the parent"). They spawn real child sessions, use isolated temp configs that never read this repo's `.opencode`, and fail identically with and without this branch.

