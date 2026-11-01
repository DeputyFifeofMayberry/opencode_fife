# Restraint calibration: JFLEG human edits vs our rewrites — 2026-10-11

Question: when humans edit prose for fluency, how much do they change — and how
does that compare to what our skill changes? JFLEG (CC BY-NC-SA, kept external
at `Y:\_refs\jfleg`) gives 1,501 learner-English sentences, each with 4
independent human fluency rewrites — 6,004 human edits. Measure: token-level
edit fraction, `1 − SequenceMatcher ratio` on word tokens. Reproduce:

```
python evals/jfleg_restraint.py
```

Raw numbers: `jfleg-restraint.json`.

## Results

Medians corrected 2026-10-11 (even-sample medians; the first pass took the
upper middle value — audit finding 9).

| editor | n | median change | p90 | max |
| --- | --- | --- | --- | --- |
| human fluency edits (all) | 6,004 | **14.3%** | 36.2% | 95.4% |
| our v3.1.0 rewrites (6 files) | 6 | 47.7% | 65.2% | 66.1% |
| our v3.3.0 rewrites (6 files) | 6 | 73.1% | 79.9% | 85.5% |

Per-file: `review_v310` is the most restrained (21.9%); every v3.3.0 rewrite
changed more than its v3.1.0 counterpart; `essay_v330` rewrote 85% of tokens.

## Reading

1. **Minimal human editors change ~1/7 of tokens.** Even at p90 they stay under
   37%. Our skill changes roughly 3× the human median at v3.1.0 and 5× at
   v3.3.0.
2. **The rhythm check made the skill touch nearly everything.** v3.3.0's median
   edit fraction is 73% vs v3.1.0's 48% — consistent with its removal (v3.5.0)
   after the human gate, and a quantification of "the rewrite loses the
   writer's text."
3. **"Leave the rest as the writer wrote them" (step 4) is real but partial.**
   Sentence-selective editing cut the touched fraction vs a full rewrite, yet
   the skill still rewrites whole sentences that carry tells, which no
   sentence-level human edit rate will match. This is a reference line, not a
   target to hit exactly.

## Caveats that travel with the numbers

- **Task mismatch.** Fluency-fixing learner sentences is not removing AI tells
  from clean drafts. AI-tell sentences are often rewritten wholesale because
  the tell *is* the sentence. Treat 14% as how much a careful minimal editor
  changes — the floor of honest intervention — not as a ceiling for ours.
- **Cross-corpus tokenization.** JFLEG ships pre-tokenized text ("do n't"),
  our corpus does not; both sides of each comparison are internally
  consistent, but absolute fractions are not comparable across the two tables.
- n=6 per version on our side. Order-of-magnitude reading only.
