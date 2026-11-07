# Cold-session context reduction: correction 1

Status: T-01 corrected and structurally retested; overall verification remains incomplete.  
Specification: approved R1, `.opencode/specs/2026-11-06-cold-context-reduction.md`.  
Authorization: the user authorized correction of the communication trigger and retesting in chat.  
Baseline: `dev` at `0d2111f091`, with the previously reported uncommitted implementation. The same assistant implemented and retested the correction; this is not independent Tester-agent evidence.

## Correction

`AGENTS.md` now says to read `.opencode/references/technical-communication.md` from the repository root before preparing prose or explaining a technical decision. This supplies the explicit prose trigger missing in T-01 and gives the resolution base for this specific reference. The earlier [testing report](2026-11-06-cold-context-reduction.md) remains the historical record.

This instruction can cause the detailed communication guide to enter context for prose tasks. Its later context cost was not measured; it should not be confused with the first-request saving.

## Retest

- From `packages/core`, a read-only Python check confirmed the prose trigger and repository-root wording appear in `AGENTS.md`, and the destination exists and contains the communication section. This is a structural check; no live model was observed following it.
- From `packages/core`, `bun run script/measure-cold-context.ts 0d2111f091` passed: baseline fixture JSON 50,130 characters, candidate 30,828 characters. It uses a synthetic plugin and tool and does not measure actual router, provider tokenization, or subsequent reference loading.
- From the repository root, `git diff --check` passed with Git's line-ending warning; `bun run agent:manifest -- --check` passed.

## Remaining work

T-01's text-level mismatch is resolved. AC-04 and AC-05 remain behaviorally unverified, as do the live-model, real-plugin, and provider measurements listed in the original testing report. This correction was not independently tested; QA has not been performed. No app install or shared-server restart occurred.
