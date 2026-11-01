# Human-prose sweep: rhythm metrics vs 24 verified-human texts — 2026-10-10

Protocol step 7 (`evals/README.md`): run the mechanical metrics over known-human
prose and require ~zero false positives. Corpus: humanist's `fp-corpus/`
(MIT-licensed; 24 files at `Y:\_refs\humanist\tests\fp-corpus` — a Supreme Court
opinion, journalism and memoir chapters, classic essays, and 12 RFC/technical
documents; ~130k words). Raw per-file numbers in the session's
`fpsweep.json`; summary below.

## Results

| metric | human corpus (24 files) | our 12 rewrites (v3.1.0/v3.3.0) | sweep verdict |
| --- | --- | --- | --- |
| sentence_len_cv | 0.479 – 0.902, median 0.694 | 0.224 – 0.713 | **Passes as a floor — and indicts us.** Every human file sits at 0.48+; seven of our twelve rewrites fall below the human minimum. |
| para_word_cv | 0.572 – 1.513, median 0.831 | 0.161 – 0.966 | Same: eight rewrites below the human minimum. |
| balanced_clause_share | 0.0 – 0.5, median 0.238 | 0.0 – 1.0 | **Passes as a ceiling.** Human prose never exceeds 0.5; our technical rewrites hit 0.71–1.0. Ungated until now. |
| punchy_closers | 4/24 files, 0.10 per section | 0–1 per text | Direction-only. Human prose snaps into a short closer ~1 section in 10, so "zero closers" as a rule would misfire on humans. |
| triads | 20/24 files, 0.16 per 100 words | 0–1 per short text (up to ~0.8/100w) | Fails as an absolute rule — human prose is full of X, Y, and Z. Known proxy limit: real lists vs forced triads. Direction/relative use only. |
| anaphora_runs | 6/24 files | 0 everywhere | Weak discriminator both sides; direction-only. |
| contraction_rate | 0.0 – 0.143 (formal-heavy corpus) | 0.0 – 0.286 | Within human range at our rates; no verdict against. |
| colons /100w | 0.0 – 1.52, median 0.205 | 0.0 – 2.11 | The step-3 colon check already guards the top of this range; keep. |

## Verdict

The sweep passes for the metrics in their intended role (report-only,
direction-gates) and fails for any absolute use — confirming the README's
"never edits" rule. Two stronger findings:

1. **The CV metrics discriminate sharply, and our gate was too lenient.** The
   relative gate (v3.3.0 must not be more uniform than v3.1.0) let texts pass
   that are still more metronomic than every one of the 24 human files. The
   honest gate is absolute: a rewrite should land at or above roughly
   `sentence_len_cv` 0.48 and `para_word_cv` 0.57, or the difference from the
   source must be justified. Adopted into the gate protocol going forward.
2. **`balanced_clause_share` earns a place in the gate.** Human max 0.5 vs our
   outputs reaching 1.0 — this was measured here for the first time and passes
   the sweep as a ceiling flag. Added to the mechanical gate as report-and-flag
   (must not rise across versions).

Not adopted as rules: closers, triads, and anaphora stay relative-only; the
human corpus shows all three occur naturally.

Caveat carried with the numbers: the corpus skews formal and printed (RFCs,
opinions, classic essays) and predates casual web writing; contraction and
colon baselines are register-driven. Ratios are order-of-magnitude evidence,
not per-file thresholds.
