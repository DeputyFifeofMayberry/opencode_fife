# OANC false-positive sweep — 11.5M words of human prose — 2026-10-11

The pilot sweep (`human-prose-sweep.md`, 24 files) validated the method; this
run scales it. Corpus: OANC written genres (`Y:\_refs\oanc`, free for any use,
pre-LLM 1990s American English) — 6,424 files, 11.49M words, six registers
(journalism 4,563, technical 1,391, letters 245, travel guides 179,
non-fiction 45, fiction 1). Document-level metrics use only files ≥ 200 words
(6,375 qualify); `para_word_cv` additionally excludes single-paragraph
documents (561 excluded — CV of one paragraph is meaningless).

```
python evals/oanc_sweep.py
```

Raw distributions: `oanc-sweep.json`. Detector cross-check:
`oanc-detector-crosscheck.json`.

## Metric distributions over human prose

| metric | min | p5 | median | p95 | max |
| --- | --- | --- | --- | --- | --- |
| sentence_len_cv | 0.126 | 0.443 | 0.643 | 0.982 | 3.668 |
| para_word_cv (multi-para, n=5814) | 0.103 | 0.404 | 0.762 | 1.632 | 5.782 |
| balanced_clause_share | 0.0 | 0.0 | 0.223 | 0.413 | 1.0 |
| contraction_rate | 0.0 | 0.0 | 0.059 | 0.241 | 0.533 |
| colons /100w | 0.0 | 0.0 | 0.31 | 1.29 | 11.3 |
| punchy_closers /section | — | 0 | 0 | 1 | 3 |
| triads /100w | — | 0 | — | — | 0.19 avg |

Rates: punchy closers occur in **21% of human sections**; triads average
**0.19 per 100 words**; anaphora runs (3+) appear in the p95 tail.

## Gate revisions (supersedes the pilot floors)

The pilot's floors came from 24 formal documents and were too strict:

| floor/ceiling | pilot value | revised | human false-positive rate |
| --- | --- | --- | --- |
| sentence_len_cv below | 0.48 | **0.44** (p5) | 10.6% below 0.48 → ~5% below 0.44 |
| para_word_cv below (multi-para) | 0.57 | **0.40** (p5) | 31% below 0.57 → ~5% below 0.40 |
| balanced_clause_share over | 0.5 | **0.5 (unchanged)** | 1.1% (69/6375) |

Against the revised floors, our twelve rewrites: flagged are `howto_v310`
(0.383 sent CV), `technical_v310`/`technical_v330` (0.272/0.328), and on para
CV `essay_v310`, `marketing_v310/v330`, `review_v310`, `technical_v310/v330` —
the same texts the pilot flagged, now with false-positive rates measured
instead of asserted. `balanced_clause_share > 0.5` flags exactly one file
(`technical_v330`, 0.714), still the only metric that catches it.

## Watch words: human rates (per 100k words)

Measured with the shared boundary matcher in `evals/watch_words.py` — the
same list and rule the AI-side ratios use (unified after audit finding 8;
earlier rates undercounted punctuation-adjacent hits).

Strong markers — near-absent in 11.5M words of human prose, safe to weigh
heavily in §12: `unlocking` 0.03, `tapestry` 0.15, `showcases` 0.10, `delve`
0.15, `garner` 0.19, `seamless` 0.16, `seamlessly` 0.20, `leveraging` 0.16.

Weak markers — common in ordinary human writing, confirming §12's "weight the
rest lower": `enhance` 3.5, `crucial` 3.6, `landscape` 3.3, `foster` 2.9,
`robust` 2.6, `highlight` 1.7, `quietly` 1.3, `enduring` 0.9, `align` 0.9,
`testament` 1.0.

In between — real but register-dependent: `comprehensive` 5.2 (see
`word-ratios.md` — the AI-side ratio is 12×), `optimize` 0.6 (all technical
registers; see `detector-crosscheck.md`), `pivotal` 0.6, `leverage` 0.7,
`meticulous` 0.3, `vibrant` 0.7, `intricate` 0.7.

To turn these into discrimination ratios we need the AI-side rate over a large
generated corpus (our AI corpus is 6 drafts) — the remaining half of the
humanist-style study.

## External detector over the same corpus

`avoid-ai-writing-detector` scored all 6,424 files
(`oanc-detector-crosscheck.json`): median score 1/100, p95 3, max 10. At the
detector's own published threshold (score ≥ 5), **88 files flag — a 1.37%
false-positive rate** against our corpus, better than the 4.2% (95% CI 3.1–5.8)
its authors measured on modern datasets. Plausible reasons: 1990s prose sits
far from modern LLM-adjacent style, and document-level scoring dilutes local
flags. The leading human-triggered issue types match their tier design:
`tier1-clarity` (2,284) and `transition` (1,881) dominate — exactly the
categories their contract weights as wordiness fixes, not authorship evidence,
while true markers (`tier1` proper, 1,753) fire far less often per document.

## Caveats

- **Era.** 1990s text: pre-LLM by construction (good for FP work), but not
  modern casual web prose. Register coverage for chat/social remains open.
- **Clustering.** Slate chunks derive from shared articles; treat file-level
  rates as clustered — effective n is below 6,424, distributions still
  dominate any pilot-based claim.
- **Formal skew.** Technical + journalism + government dominate; the
  contraction-rate distribution (median 5.9%) reflects that, not a claim about
  informal writing.
