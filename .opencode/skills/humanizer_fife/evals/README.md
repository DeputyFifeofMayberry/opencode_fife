# Evals

Measurement for humanizer_fife changes. A change to `SKILL.md` ships only when it
beats the previous version here. Protocols adapted from
[itsryanlenk/humanist](https://github.com/itsryanlenk/humanist) `docs/evals/`
(MIT) — read `INVESTIGATION.md` first for the measured baseline.

## Two layers

**1. Mechanical metrics (`rhythm_metrics.py`).** Deterministic, free, runs on any
text. Measures proxies for the rhythmic tells that grow through a subtractive
rewrite (issue #229: uniform beat rate 60→101, aphoristic closers 38→61,
contraction uniformity 21→43). Report-only; never edits.

```
python evals/test_rhythm_metrics.py                # self-check
python evals/rhythm_metrics.py evals/corpus/*.md   # human-readable
python evals/rhythm_metrics.py --json evals/corpus/*.md > results.json
```

**2. Blind pairwise judging.** The real gate. Mechanical proxies can improve
while prose gets worse; only preference data decides.

**3. External detector cross-check (optional).** `avoid-ai-writing-detector`
(npm, MIT) scores lexical surface patterns — the complement to our structural
metrics. See `results/detector-crosscheck.md` for the run and the command.
Cross-check only: its own authors measured paragraph-level ROC-AUC at 0.501,
so it never gates a change.

**4. Watch-word ratios (experimental).** `word_ratios.py` counts §12
candidates in the AI corpus (`corpus/` + `corpus2/`) against the 11.87M-word
human baseline (`results/oanc-sweep.json`, `masc-sweep.json`). See
`results/word-ratios.md` — single-author AI side, so ratios are a screening
tool until the corpus spans multiple models.

## Corpus

`corpus/` holds AI-style drafts across six registers (essay, how-to, email,
marketing, review, technical release notes). Grow toward 100–200 samples before
trusting fine margins; 6 samples resolves only huge effects (cf. humanist's power
analysis: ~3.6 points at n=282). `corpus2/` adds 36 same-register drafts
(2026-10-11) from a single model/author — useful for coarse word-ratio
screening, not yet for family-level claims.

## Protocol per change

1. **Freeze.** Record the current version's metrics over the corpus:
   `python evals/rhythm_metrics.py --json evals/corpus/*.md > evals/results/vX-Y.json`
2. **Rewrite.** Run the skill (old and new version) over every corpus file, one
   output per version. The rewriting agent follows `SKILL.md` exactly.
3. **Mechanical gate.** New version must not: lower `sentence_len_cv` /
   `para_word_cv` (more metronomic), raise `punchy_closers` or `triads`, or add
   colons as dash-replacement spam. Direction matters, not magnitude. Absolute
   flags, revised from the 11.5M-word OANC sweep
   (`results/oanc-sweep.md`; supersedes the 24-file pilot floors): flag a
   rewrite below `sentence_len_cv` 0.44 or — for multi-paragraph texts —
   below `para_word_cv` 0.40, or above `balanced_clause_share` 0.5. At these
   lines roughly 5% of human documents flag, so a flag is a review trigger
   with a measured false-positive rate, not a verdict.
4. **Blind pairwise.** Judges (a different model family than the rewriter when
   possible) see pairs A/B on the same subject at similar length and answer only
   *"which is the better piece of writing"* — authorship never mentioned. Strip
   filenames; randomize order; forced choice. Optional second pass for agreement.
5. **Tell tally.** Ask judges to quote what drove each call; cluster citations
   into tell classes; compare counts before/after (the #229 method). Rhythmic
   classes must not grow.
6. **Claim preservation.** Every fact, number, name, date in the rewrite must
   trace to the source. Additions = automatic fail.
7. **Human-prose control.** Whenever a rule is added, sweep it over known-human
   prose (humanist's `fp-corpus/` works) and require ~zero false positives.
   Do not encode: performed hedging, self-answered questions, typography
   (measured discrimination ratios 0.89 / 0.00 / 0.61 — all misfire).
8. **Freeze the run.** After judging, freeze source, rewrites, pairs, key,
   judgments, and metrics into a content manifest and keep it green:
   `python evals/freeze_run.py --name <run> --of evals/blind evals/rewrite
   evals/corpus evals/results/<metrics>.json`, verified in CI (`--verify`).
   A legitimate correction to frozen evidence regenerates the manifest and
   says so in the changelog. Hashes are line-ending independent (LF-normalized).

## Known limits

- Model judges prefer polished prose — the #229 finding means "judge prefers" is
  necessary but not sufficient; the tell tally is the counterweight.
- Small n until the corpus grows. Report margins, don't celebrate single trials.
- Same-family judges overrate detection/quality agreement; cross-family when
  feasible.
