# QA: cold-session context reduction

Disposition: **Fail**. The new instruction routes contain confirmed coverage and subdirectory path defects; required behavioral evidence is also missing.

## Basis

- The user explicitly authorized QA after correction cycle 1. Scope is the approved R1 specification, implementation, and both testing reports.
- Specification: `.opencode/specs/2026-11-06-cold-context-reduction.md`; approval was provided in chat. The file still says awaiting approval, but its reported SHA-256 `ABD570FEC039B2F4CE4743D34D23EBB1C526F0EE50E1960846AA5DFE84F737EE` matches the observed file.
- Reviewed state: `dev`, HEAD `0d2111f09181c59b17c777d603dd8d684ee1f25b`, plus the uncommitted files shown by `git status`. The prior tests exercised an uncommitted tree at that HEAD; correction 1 subsequently changed the prose trigger. Its reported fixture and structural retest cover that correction, not every original test at the final tree.
- Independence: this QA review is a separate agent. The earlier testing reports disclose that implementation and testing were performed by the same assistant; they are reported evidence, not independent testing. This QA review did not run tests or connect to a provider.
- Applicable project guidance and Definition of Done were inspected. No application, test, specification, configuration, or installed file was modified during QA.

## Findings

### QA-01 — Guide paths resolve incorrectly when followed literally from a subdirectory

- Classification: verified code-level issue; severity: **Major**. Criteria: R-02, AC-03 and AC-05.
- Root `AGENTS.md` directs a session to read paths such as `.opencode/references/coding-style.md`, `.opencode/references/session-core.md`, `.opencode/references/local-updates.md`, and `.opencode/references/live-tui-and-desktop.md`, without stating that those paths are relative to the repository root. The corrected communication route does specify the repository root.
- `packages/core/src/file-access.ts` `resolvePath` and `FileAccess.resolve` resolve a relative input against `location.directory`. For a session started in `Y:/CodingProjects/opencode_fife/packages/core`, a literal read of `.opencode/references/coding-style.md` therefore targets `packages/core/.opencode/references/coding-style.md`, rather than the new file at the root. The native read tool's alternate-path logic only searches the same parent directory for a normalized filename; it does not walk to the repository root (`packages/core/src/tool/plugin/read.ts`, `alternatePath`).
- The agent may infer or find the correct root from other context, but that recovery was not demonstrated. The written route itself does not reliably identify the destination for a subdirectory session. This can delay or prevent loading the required style, session, update, TUI, or desktop rules before the action.
- Corrective direction: make all moved-guide routes unambiguously repository-root-relative or provide another verified mechanism, and exercise the actual root and subdirectory read paths before the relevant actions. Do not rely solely on a string check or nested `AGENTS.md` discovery.

### QA-02 — Some moved unconditional rules have narrower explicit triggers

- Classification: verified instruction-coverage mismatch; severity: **Major**. Criteria: R-02 and AC-03.
- `.opencode/references/session-core.md` retains the unconditional vocabulary rule forbidding “provider turn” and bare “turn” for one model call. The only root trigger for that guide is “Before changing Session execution, history, inbox, compaction, or related APIs” (`AGENTS.md`, Session Core). A read-only investigation or explanation of those concepts does not satisfy that trigger, although the original rule governed the wording of such explanations too.
- Similarly, `.opencode/references/local-updates.md` retains the instruction to tell the user when `bun run local:status` shows `dev` ahead of the installed build. Root `AGENTS.md` routes to it before updating, packaging, or installing; a status-only check is not explicitly covered.
- A model could still choose to read the guides, so no claim is made that it actually violated either rule in a live session. The required explicit route is nevertheless narrower than the preserved rule's applicability. Compare root triggers with the cited preserved rules.
- Corrective direction: audit the moved rules individually for non-edit and status-only triggers, retain concise always-relevant rules when needed, and add task-specific routes for the rest. Preserve the user's goal of reducing always-loaded context.

### QA-03 — Real behavior and effective request remain unverified

- Classification: evidence gap, not a confirmed runtime defect. Criteria: AC-04 through AC-07, AC-09, AC-11 and AC-12; material to acceptance.
- Tester reports confirm isolated instruction-discovery, skill, and Code Mode tests; they do not observe a live model selecting a skill or loading the right guide before an action. The measurement fixture uses one synthetic plugin and tool; the configured router, actual MCP catalog and provider tokenization were excluded. The current communication trigger additionally directs every prose task to read a 3,170-character guide, whose later context cost has not been measured.
- Required direction: run the approved representative scenarios and an isolated measurement that identifies what is actually captured and what remains unavailable. Preserve active services and do not equate fixture characters with provider tokens or total task cost. A live provider comparison is optional under AC-01; do not treat unavailable provider tokenization alone as a confirmed defect.

## Requirement and criterion review

| Requirement / criterion | QA status | Basis |
| --- | --- | --- |
| R-01, AC-01 | Unverified | Synthetic post-hook comparison exists and explicitly labels missing inputs, but it does not exercise actual configured tools/router or establish full request attribution. |
| R-01, AC-02 | Satisfied for the explicitly labeled synthetic scenario | Correction report records 50,130 versus 30,828 serialized characters and discloses absent provider tokenization. No claim about actual provider savings is established. |
| R-02, AC-03 | Violated | QA-01 and QA-02. Sections are preserved in reference files but their routes are not fully reliable or broad enough. |
| R-02, AC-04 | Unverified | T-01's prose trigger was corrected structurally; actual pre-action loading for the specified scenarios was not observed. QA-02 identifies additional rule-specific routing gaps. |
| R-02, AC-05 | Unverified | Root/subdirectory and bypass-native-read workflows were not exercised end to end; QA-01 identifies the literal path-resolution problem. |
| R-03, AC-06 | Unverified | Skill permission and missing-skill tests were reported; actual selection and later loaded body sizes were not established. |
| R-03, AC-07 | Unverified | Six required descriptions were reviewed/shortened, but representative model selection and applicability are unverified. |
| R-03, AC-08 | Unverified | Manifest and agent-system checks were reported; updated runtime precedence was not exercised independently. No install was reported. |
| R-04, AC-09 | Unverified | Tool interpreter tests were reported, but the real before/after direct catalog and model use of the revised execute listing were not measured. |
| R-04, AC-10 | Unverified | External ownership and a broad follow-up recommendation are documented; no actual router request or independently evaluated compacted router text is available. |
| R-05, AC-11 | Unverified | Required representative task scenarios have not been exercised with a live model. |
| R-05, AC-12 | Satisfied for honest disclosure | Reports identify the fixture, scope, reported checks and material gaps; no unsupported provider-token claim was found. |
| R-05, AC-13 | Unverified | Synthetic input shrank; required route behavior remains unverified and QA-01/02 show coverage defects. |

## Work performed and handoff

Inspected the specification, both testing reports, implementation report, root instructions, moved references, changed Code Mode guidance, request measurement script, and path-resolution/read implementation. Inspected Git status, worktree listing, HEAD, and spec hash. No targeted test or live-model call was run by QA. Previously reported test runs remain historical evidence rather than QA-reproduced results.

T-01 from the prior Tester report is **resolved at the text level** by correction 1; actual behavior is still unverified. QA-01 and QA-02 are new findings, not claims that a user has already experienced a failure. Recommend returning the findings to the Spec Writer and requesting separately authorized correction and retesting. The previous user-authorized correction was cycle 1; the Spec Writer owns any further cycle and approval. QA does not approve implementation corrections, user acceptance, installation, or release.
