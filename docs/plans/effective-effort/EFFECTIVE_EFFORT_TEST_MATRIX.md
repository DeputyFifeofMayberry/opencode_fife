# Effective Effort Resolution — Test Matrix

Scope: effort-resolution scenarios across execution and reporting, with existing coverage and
gaps. Paths relative to repo root. "apply" = `EffortTransition.apply`
(`packages/core/src/effort/transition.ts:46`); "describe" = `EffortStatus.describe`
(`packages/core/src/effort/status.ts:10`).

## 1. Scenario matrix

| # | Scenario | Inputs (policy / state row / agent / selection / model) | Expected behavior | Existing coverage | Gap → plan task |
| --- | --- | --- | --- | --- | --- |
| 1 | Manual exact pick, advertised | any / none / build / variant `high` / supported | `next: {rule:"exact-base", effort:"high"}`; apply returns `false` (pick wins verbatim, never escalated) | `adapter.test.ts:71`; `policy.test.ts:34`; `session-runner.test.ts:2485` | Cross-check vs describe → **Task 2** |
| 2 | Manual pick, NOT advertised | any / none / build / variant `off` / route without `off` | `{rule:"untouched"}`; request untouched | `policy.test.ts:39` | Cross-check → **Task 2** |
| 3 | Auto, standard base | static, `verification_commands` set / none / build / `default` / supported | decision `{rule:"base", level:"standard"}` with no `effort` (standard = clear variant); apply materializes seed row, returns `false` | `adapter.test.ts:37`; `policy.test.ts:21`; `recovery.test.ts:237` | Cross-check → **Task 2** |
| 4 | Auto, low base, no row | static / none / build / `default` / supported | apply writes `low`; `lastAppliedVariant:"low"`; next describe shows `control:"automatic"` (echo filtered) and an `exact-base`-shaped outlook | `adapter.test.ts:41`; `session-runner.test.ts:2435` | describe-before/apply-after cross-check; echo end-to-end → **Task 2** |
| 5 | Policy echo | static / row `lastAppliedVariant:"low"` / build / variant `low` / supported | echo is NOT a user pick; `exact: undefined`; no re-baselining | `transition.ts:53-54` comment; `session-runner.test.ts:2482` | explicit describe+apply same-snapshot case → **Task 2** |
| 6 | New user pick over policy write | static / row `lastAppliedVariant:"low"` / build / variant `high` / supported | `high` wins verbatim; baseline re-recorded once (`recordSelection`, `transition.ts:80-88`) | `session-runner.test.ts:2485`; `recovery.test.ts:139` (stopped pick wins) | none new |
| 7 | Static escalation | static / none or row / build / `default` / supported; `openFailure` set via evidence | `{rule:"escalated", level:"standard"}` from low base; `effort` absent at default; request carries `max` from `deep` when raised twice | `adapter.test.ts:45,53`; `policy.test.ts:49`; e2e `session-runner.test.ts:2527-2587` | supported-route mode split → **Task 1 (test 2)** |
| 8 | Static de-escalation / clear | same-verifier pass, newer sequence, revision ≥ failure's | failure cleared; level back to derived base | `policy.test.ts:64`; `evidence.test.ts:288`; e2e `session-runner.test.ts:2554+` | none |
| 9 | Stale pass rejected | older sequence or older revision or different verifier | state unchanged | `policy.test.ts:71,77,83,169`; `evidence.test.ts:334,351` | none |
| 10 | Adaptive seed from ladder | `mode:"adaptive"` / none / `explore` / `default` / supported | base seeds `low` (`sessionSeed`); `currentLevel` stays undefined until a row exists; `initialized:false` | `recovery.test.ts:187,212`; `status.test.ts:23` | `sessionSeed` has no direct named unit test — noted, covered indirectly; no task |
| 11 | Adaptive raise + step-down | adaptive / row with `level`, `cleanPasses` / build / `default` / supported | failure raises one step and resets counter; `clean_passes` qualifying passes step down, floored at base | `policy.test.ts:127-183`; e2e `session-runner.test.ts:2590-2637`; `verify.test.ts:178-232` | none |
| 12 | Plan pin | any / any / `plan` / `default` / supported | base floored at `deep`; `{rule:"mode-pin", level:"deep", effort:"max"}` | `adapter.test.ts:81`; `policy.test.ts:29` | cross-check → **Task 2 (d)** |
| 13 | Degenerate route | any / any / any / any / variants `["none","thinking"]` or single effort | `capability → {efforts:[]}`; `support:"unsupported"`; `{rule:"untouched"}` in every state | `adapter.test.ts:28`; `policy.test.ts:43` | cross-check → **Task 2 (e)** |
| 14 | Missing model | any / any / any / any / no `Model.Info` | apply: silent `false`; describe: `support:"unknown"`, `next: undefined` | `status.test.ts:20` (partial) | explicit pins → **Task 1 (test 3), Task 2** |
| 15 | `"default"` sentinel selection | any / any / any / variant `"default"` / supported | reads as Auto: `selectedVariant: undefined`, `control:"automatic"` | `session-runner.test.ts:2479,2581` (session level) | describe-level pin → **Task 1 (test 1)** |
| 16 | Config precedence | global + project entries | shallow merge, later entries win; arrays/maps replaced | `config.test.ts:7-13` | none |
| 17 | Config change after seeding | row exists; `base_level` edited | existing session unaffected (row is durable source) | `docs/spec/effort-policy.md:178-184`; `store.test.ts` reopen case | none |
| 18 | Restart recovery | open failure / raised level + process restart | no re-transition; state honored | `recovery.test.ts:87-155`; `store.test.ts:235` | none |
| 19 | Harness evidence path | adaptive, dirty session, idle boundary | one verifier run through `classify`/`observe`; verdict currency guards | `verify.test.ts` (full file) | none |
| 20 | Status snapshot vs applied | row + selection after a transition | `selectedVariant` = applied; `currentLevel` = durable adaptive level; `next` = next-step decision; never conflated | `status.test.ts:13-15` | consistency pin → **Task 2** |
| 21 | Delegation seeding | child session, no inherited variant vs inherited pick | `operationStart` seeds base; any inherited/explicit variant suppresses seeding | `delegation.test.ts:65-114` | none |

## 2. Invariants (asserted by the plan's tests)

| Invariant | Where enforced |
| --- | --- |
| Deterministic resolution — identical inputs, identical `Resolution` | Task 3 table test (pure) |
| Shared semantics — `describe(...).next` matches what `apply` acts on for the same snapshot | Task 2 (cross-check, fixtures 1–5, 12, 13, 14) |
| Accurate application — durable variant after `apply` equals `next.effort ?? "default"` | Task 2 assertions (2) |
| Honest reporting — `selectedVariant`/`currentLevel`/`next` remain distinct fields; future effort never reported as applied | Task 1 tests 1–3; Task 2 |
| No hidden mutation — `resolve` mutates nothing (pure); `describe` writes nothing | Task 3 (pure table), existing `status.test.ts` |
| Backward compatibility — suites pass with zero assertion edits during Tasks 4–5 | Plan Tasks 4–5 verification steps |

## 3. Verification methods

```bash
# focused (from package dirs, never repo root)
cd packages/core && bun test test/effort/status.test.ts
cd packages/core && bun test test/effort/consistency.test.ts
cd packages/core && bun test test/effort/adapter.test.ts
cd packages/core && bun test test/effort            # full subsystem (~140+ tests)
cd packages/core && bun test test/session-runner.test.ts
cd packages/cli && bun test test/session-effort.test.ts
cd packages/server && bun test test/session-effort.test.ts

# full check
bun run check   # repo root
```

Out-of-scope but adjacent (must keep passing, no new coverage required): `packages/ai/test/effort-updates.test.ts` (transport lowering), `packages/core/test/model-resolver.test.ts` (route/variant resolution, `docs/effort-provider-mapping.md`).

## 4. Known coverage gaps NOT addressed by the plan (accepted)

1. `sessionSeed` lacks a direct named unit test (exercised via `recovery.test.ts:187,212`, `status.test.ts:23`). The `explore` divergence between `sessionSeed` (sessions → `low`, `delegation.ts:42-43`) and `operationStart` (children → `standard`, `policy.ts:40-42`) is documented at `delegation.ts:28-35` but only indirectly tested.
2. `DecisionRule` presentation mapping is hand-maintained in three consumers (TUI, session-ui, `script/effort-report.ts`). Pinned by the protocol union (`session.ts:57`); drift would surface as a wrong label, not a wrong effort.
3. Live provider behavior of lowered effort fields (benchmark concern, `docs/spec/effort-policy.md:218-226`).
