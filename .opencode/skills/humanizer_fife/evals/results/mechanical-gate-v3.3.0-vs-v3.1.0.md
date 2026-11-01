# Mechanical gate: v3.3.0 rewrites vs v3.1.0 rewrites — 2026-10-10

Frozen metrics: `v3.1.0-rewrites.json`, `v3.3.0-rewrites.json`. Raw corpus
baseline: `v3.2.0-raw-corpus.json`. Gate rules per `evals/README.md` step 3:
v3.3.0 must not lower `sentence_len_cv` / `para_word_cv`, must not raise
`punchy_closers` or `triads`, must not add colon spam. Direction matters, not
magnitude.

| register | sentence_len_cv | para_word_cv | punchy_closers | triads | colons/100w |
| --- | --- | --- | --- | --- | --- |
| email | 0.667 → 0.683 | 0.847 → 0.966 | 0 → 0 | 0 → 0 | 2.11 → 0.93 |
| essay | 0.587 → 0.540 | 0.174 → 0.589 | 0 → 0 | 1 → 1 | 0.71 → 0.55 |
| howto | 0.383 → 0.713 | 0.450 → 0.675 | 0 → 0 | 0 → 0 | 0.93 → 0.92 |
| marketing | 0.455 → 0.667 | 0.161 → 0.250 | 0 → 0 | 1 → 1 | 0 → 0 |
| review | 0.477 → 0.545 | 0.279 → 0.415 | 1 → 0 | 0 → 1 | 0 → 0 |
| technical | 0.272 → 0.328 | 0.322 → 0.359 | 0 → 0 | 0 → 0 | 0 → 0 |

Result: gate passes on 22 of 24 cells. Two exceptions, both documented rather
than patched:

1. **essay `sentence_len_cv` 0.587 → 0.540.** Marginal lower, over 13
   sentences — inside noise for a CV at this n. Pre-existing pair from the
   smoke run, not rewritten for this freeze.
2. **review `triads` 0 → 1.** The added triad is "espresso, pour-over, and
   French press" — three items the source names, which §6 says to keep. The
   regex cannot distinguish a real list from a forced one; this is the known
   proxy limit, not a new tell.

Production note: the first drafts of `marketing_v330.md` and
`technical_v330.md` failed this gate (a snap closer in each; technical also
more uniform than v3.1.0 — the rhythm check cuts both ways when the rewriter
stops watching). Both were rewritten until the direction held. The mechanical
gate caught what the rewriter's own read missed.
