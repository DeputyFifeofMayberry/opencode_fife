# Prior art: voice/style profiles for AI writing

Research pass 2026-10-10, seeking examples built for this exact task (capture a
writer's voice once, reuse it for personalized rewrites). 17 found. What we
adopted afterwards is marked → ADOPTED.

## In the humanizer/skill ecosystem (direct precedents)

1. **hannsxpeter/humanizer** (MIT, 11★) — the closest existing design. Keeps a
   `VOICE.md` (schema in `references/voice-matching.md`) or `STYLE-GUIDE.md` in
   the project, discovered automatically; a sample or named author in the
   request wins over the profile file. Ships `evals/files/VOICE.md` as an eval
   fixture and an eval case for voice behavior. Also: density pre-check
   ("restraint by design"), do-not-flag reference, variance-not-synonyms as the
   explicit goal — same conclusion we reached from the #229 data.
   → ADOPTED: precedence rule (fresh sample > saved profile) and the idea that
   the profile ships with the eval fixtures.

2. **hannsxpeter/Scriveno** (the system the above was lifted from) — "Voice
   DNA" profile loaded into every drafting step of a longform pipeline, plus a
   Polish pass with a dedicated voice check per unit. Lesson: voice check as a
   separate pass, not inline effort.

3. **itsryanlenk/humanist** — `humanist.py --calibrate my-writing/ --register
   general` measures voice bands (sentence-length statistics, anaphora) from
   your published writing into config. The most measured approach; bands are
   per-register because one author's chat register ≠ their docs register.
   → ADOPTED: measured bands as part of the profile format.

4. **Matt-Payne/content-humanizer** — `references/examples.md`: a bank of
   before/after exemplars "used as concrete models of the target voice," with
   an explicit header warning the skill to borrow style, not facts.
   → ADOPTED: exemplars + the style-not-content caveat.

5. **jooray/humanizer** — voice calibration section; changelog 2.13.1 documents
   the failure mode: a writing sample used as a source of FACTS, fixed by
   separating manner from content and subordinating the sample to
   no-fabrication.
   → ADOPTED: "style carries over, facts do not."

6. **GrantAgent** (Claude skill for grant writing) — setup step builds a style
   profile from the user's published writing ("only needs your style, not
   unpublished ideas"). Lesson: public/published text is the right corpus —
   it is already authorized and low-risk.

7. **lovstudio-style-clone** (SkillsMP) — analyzes sample articles into a style
   profile (文风画像) and rewrites a target article in that style. One-shot
   profile-then-apply flow, same two-stage shape as ours.

7b. **conorbronsdon/avoid-ai-writing** (MIT, 4.9k★, surveyed 2026-10-10) — the
   largest skill in the niche and the closest in engineering discipline:
   pattern catalog + deterministic detector (npm, GitHub Action, pre-commit,
   MCP), register voice profiles, edit-in-place mode, and a `PROOF.md`
   self-scan that publishes raw and exempt scores "because publishing only the
   flattering one is the behavior this project exists to criticize." Its own
   corpus study (875 human / 779 machine paragraphs) measured paragraph-level
   ROC-AUC 0.501 — a coin flip — and it says so rather than quoting the
   detector as a quality oracle. Rhythm/uniformity stays a judgment pattern,
   never a mechanical pass, and a wall-of-text detector was reverted after it
   misfired (documented in the v3.15 notes).
   → ADOPTED: confirmation, not code. Their AUC measurement is independent
   evidence for our report-only stance on `rhythm_metrics.py`; their
   wall-of-text revert is the same move as our 3.5.0 rhythm-check removal
   (measure, misfire, retreat, document). Candidate adoptables, unswept: their
   AI-tool fingerprints (unfilled placeholders, chatbot citation markup, UTM
   params — near-zero-false-positive artifact cleanup for §E) and the two
   writer-side tests (paragraph-reshuffle immunity, treadmill effect) already
   named in `INVESTIGATION.md`. Their claim gate for quoting any rate (n ≥
   100, confidence interval, modern registers) is the bar our eval numbers do
   not yet meet. Counterpoint worth keeping: their catalog prescribes "mix
   short/long, fragments, questions" to fix uniformity — exactly the
   performed looseness our human gate rejected (corrected tally: 7–2 for the
   pre-rhythm-check version across runs 1–2; see the correction note atop
   `evals/blind/JUDGMENTS-human-3.md`), so our data is evidence
   against that specific fix.

## Commercial products (the pattern at scale)

8. **Writer.com "Voice"** — voice profiles built from a company's content, with
   a dedicated style-matching model per profile; profiles are first-class
   objects shared across a team, not per-prompt pastes. The product
   architecture confirms: profile as persistent, retrievable object is the
   winning shape.

9. **Jasper Brand Voice** — style extracted from existing content plus explicit
   rules ("don't say X"), applied across templates. Lesson: a profile can carry
   prohibitions, not just tendencies.

10. **Copy.ai Brand Voice** and 11. **Writesonic Brand Voice** — same pattern:
    ingest writing samples once, apply everywhere. Commodity at this point.

12. **Junia AI Brand Voice** — tone/vocabulary/voice from supplied content.

13. **VoiceMoat / Noren** (2026 entrants) — compete specifically on
    "voice fidelity," i.e. the market says single-sample mimicry is not enough;
    training-style fidelity is the differentiator. Supports keeping exemplars
    verbatim in the profile, not just a summary.

## Measurement / research (how to know a profile works)

14. **writing-eval** (Majestic Labs, Elastic License 2.0) — style profiles as
    statistical baselines with profile-relative allowances ("a generic rule
    must not overrule patterns the corpus repeatedly demonstrates"). Their
    calibration study of 101 articles: 25 samples ≈ 70% coverage of stable
    scores, 40 ≈ 87%; article count matters more than word count; differences
    under ~3 points are noise; rebuild the profile from the full corpus rather
    than appending; get authorization before profiling someone's prose.
    → ADOPTED into `references/profiles/README.md`.

15. **LaMP / LongLaMP benchmarks** (UMass, 654+ citations) — personalization
    benchmarks with user-provided examples as the personalization input,
    including style-transfer tasks. The academic framing of exactly our
    feature: profile = user's own examples at inference time.

16. **"Evaluating Style-Personalized Text Generation"** (arXiv:2508.06374,
    EMNLP 2026 main) — LLMs don't capture author-specific style well, and
    single metrics (BLEU, embeddings, LLM-as-judge) correlate poorly with
    humans for style personalization. Recommendation: ensembles of diverse
    metrics. → ADOPTED: our voice gate is pairwise preference + tell tally +
    mechanical bands, never one judge.

Also cited in the original plan, still unverified: Trial-Error-Explain ICL
(contrastive feedback with <10 examples). If real, it supports our 5-10 sample
floor for the style summary; writing-eval's numbers bound the statistical use
at 25-40. The two numbers answer different questions — exemplar adequacy vs
baseline stability — and the README now says so.
