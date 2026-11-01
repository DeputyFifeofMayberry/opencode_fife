# Investigation: baseline evidence for humanizer_fife improvements

Compiled 2026-10-10. Sources: upstream repo + issue #229, itsryanlenk/humanist (eval
studies, full docs in `Y:\_refs\humanist`), jooray/humanizer fork (54 patterns),
Matt-Payne/content-humanizer fork (progressive disclosure architecture).

## Fork starting point

- `DeputyFifeofMayberry/humanizer` = upstream `blader/humanizer` v3.1.0 + 2 local
  commits (merged as PR #1), released as **v3.2.0**. Package validates.
- Local commits already implement part of improvement #4 (selective editing):
  "Rewrite the sentences that carry a tell. Leave the rest as the writer wrote
  them", the colon-swap check, and "vary sentence length where the content calls
  for it, not by formula."

## The measured baseline (issue #229 / humanist studies, ~750 blind judgments)

| contrast | result |
| --- | --- |
| raw AI vs upstream rewrite pass, quality-only blind pairwise | 16/16 preferred rewrite (p≈3.1e-5) |
| raw AI vs rewrite + checker | 22/22 |
| rewrite vs rewrite + checker | 12/21 = chance (checker added nothing) |
| processed machine prose vs genuine human prose, quality | 18/18 machine wins |
| same human prose, authorship detection | 143/143 called human |

Tell-citation counts before → after the rewrite pass (judges, blind):

| tell class | raw | rewritten | encoded by skill? |
| --- | --- | --- | --- |
| AI vocabulary | 70 | 0 (1 mid-pass) | yes |
| typography | 114 | 68 | yes |
| negative parallelism | 80 | 58 | yes |
| **uniform beat rate** | 60 | 95 | **no — grows** |
| **aphoristic closer** | 38 | 59 | **no — grows** |
| **contraction uniformity** | 21 | 36 | **no — grows** |

Core finding: *"The pipeline crushes every tell it encodes and grows the ones it
does not."* Ten named tells have no rule at all; all rhythmic/structural.

Vetted safe-to-encode (discrimination ratio ≥ 3): announced thesis (64.6),
tricolon/triads (35.8), uniform beat rate (13.9), aphoristic closer (10.3),
too-complete-no-friction (11.2). **Do not encode:** performed hedging (0.89),
self-answered question (0.00), typography-as-tell (0.61).

Caveats that travel with every number: single model family as judges; quality
study ran 77/144 planned trials; human control matched on register/length, not
subject; detection arm at ceiling.

## Feature baselines (adopt / adapt / reject)

| Planned feature | Existing baseline | Evidence | Disposition |
| --- | --- | --- | --- |
| 1. Voice profiles | humanist `--calibrate` (measured voice bands from published writing, per register); Matt-Payne `references/examples.md` (static exemplar bank); upstream voice-sample section (per-request only) | prototype-level, no eval | **adapt**: persistent per-context profiles, lazy-loaded |
| 2. Rhythm pass | humanist "rhythm tells" read-aloud inventory (10 tells, ratios); jooray #41 structural uniformity + paragraph reshuffle test; user's v3.2.0 formula-variation guard | strongest data (60→101, 38→61, 21→43) | **build first** |
| 3. Audience awareness | upstream §26 wrong-reader (reply-scoped); Matt-Payne marketing/reference routing | plausible, unproven | **adapt** routing shape, add reader/purpose/expected-action |
| 4. Selective editing | user's v3.2.0 commits; humanist registers/`--lenient` + rule demotion against false-positive corpus (24 human docs, 0.07 FAIL/1k words) | proven direction | **finish**: preserve-list + intensities |
| 5. Eval system | humanist `docs/evals/` (4 study designs, corpora, tally scripts, `fp_guard.py` CI gate) | proven, reproducible | **adapt, don't rebuild** |

## Corrections to the original improvement plan

1. **Eval harness is not priority #5 — it is #0.** "Measured improvements" is
   unknowable without it. Humanist's protocols are the starting point.
2. **Licensing:** the pattern catalog is CC BY-SA 4.0 (27.5% verbatim Wikipedia
   text per humanist's attribution audit), not just MIT. Keep attribution; new
   original content is MIT. Do not absorb humanist code into the skill — reference
   or eval-harness use only.
3. **Prompt budget is a hard constraint.** Upstream reads SKILL.md on every use;
   jooray hit the 800-line wall. New material goes in `references/` loaded on
   demand (Matt-Payne architecture), not into SKILL.md.
4. Do not encode performed hedging, self-answered questions, or typography rules
   as rhythm tells — measured to misfire on human prose (ratios < 1).

## What ships when (evidence order)

| # | Deliverable | Gate |
| --- | --- | --- |
| 0 | eval harness (this directory) | reproducible metric + judging protocol |
| 1 | rhythm pass in SKILL.md/references | blind preference ≥ upstream; beat-rate/aphoristic citations fall, not rise |
| 2 | voice profiles (`references/profiles/`) | voice-similarity preference vs no-profile baseline |
| 3 | audience pass | preference on reply/email corpus slice |
| 4 | selective-editing intensities | false-positive rate on human prose stays ~0; preference holds |
