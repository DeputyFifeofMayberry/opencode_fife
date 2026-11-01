# Watch-word discrimination ratios — AI corpus vs 11.87M human words — 2026-10-11

Revised after the audit (findings 7 and 8): one shared watch list and one
shared boundary matcher (`evals/watch_words.py`) now feed both the human
sweeps and this script, every candidate is measured in both baselines, and
unmeasured words are reported as unmeasured instead of zero.

AI side: 60 drafts, 11,117 words (`evals/corpus` + `evals/corpus2`; wave 2
deliberately samples classic model vocabulary). Human side: OANC + MASC,
11,868,228 words. Reproduce:

```
python evals/word_ratios.py
```

Raw: `word-ratios.json`.

## Results

| word | AI/100k | human/100k | ratio |
| --- | --- | --- | --- |
| showcases | 63.0 | 0.101 | 623× |
| unlock | 81.0 | 0.152 | 534× |
| meticulously | 81.0 | 0.211 | 384× |
| meticulous | 107.9 | 0.312 | 346× |
| tapestry | 27.0 | 0.152 | 178× |
| seamless | 36.0 | 0.160 | 225× |
| delve | 36.0 | 0.152 | 237× |
| showcase | 63.0 | 0.438 | 144× |
| seamlessly | 18.0 | 0.202 | 89× |
| testament | 54.0 | 1.036 | 52× |
| quietly | 45.0 | 1.306 | 34× |
| pivotal | 18.0 | 0.640 | 28× |
| crucial | 81.0 | 3.632 | 22× |
| underscore | 9.0 | 0.463 | 19× |
| robust | 45.0 | 2.561 | 18× |
| optimize | 9.0 | 0.565 | 16× |
| intricate | 9.0 | 0.649 | 14× |
| leverage | 9.0 | 0.657 | 14× |
| vibrant | 9.0 | 0.716 | 13× |
| comprehensive | 63.0 | 5.224 | 12× |
| enduring | 9.0 | 0.935 | 10× |
| foster | 9.0 | 2.915 | 3× |
| landscape | 9.0 | 3.278 | 3× |
| enhance | 9.0 | 3.539 | 2.5× |
| align, bolster, enhancing, garner, highlighting, interplay, leveraging, navigate, optimizing, realm, underscores, unlocking | 0.0 | 0.03–1.7 | 0 — untested on the AI side |

## Reading

1. **The tier structure is measured, not asserted.** Strong markers
   (≥50×: showcases, unlock, meticulously, meticulous, tapestry, seamless,
   delve, showcase), mid markers (10–90×: seamlessly, testament, quietly,
   pivotal, crucial, robust, underscore, optimize, intricate, leverage,
   vibrant, comprehensive, enduring), and everyday words (≤3×: foster,
   landscape, enhance) — matching §12's strong-vs-weak weighting.
2. **"comprehensive" is demoted from discovery to candidate.** The first pass
   called it absent from human writing because it was never measured there
   (audit finding 7). Measured: 5.2/100k human, 12× ratio — above the 10×
   screening bar, but human-common enough that it belongs in the mid tier,
   pending multi-model confirmation.
3. **Ratios came down across the board** once matching was unified (audit
   finding 8): e.g. tapestry 291× → 178×. The direction of every conclusion
   survived; the magnitudes were inflated.

## Standing caveats

- **One model, one session.** Wave 2 samples the model's cliché register, but
  it is still a single author. Screening values only; family-level claims
  need generation across model families.
- **AI side is 11k words.** A hit moves a rate; ratios below ~10× are
  directional only.
- **Twelve words untested on the AI side** (the sampled register doesn't use
  them). They stay on §12 by upstream evidence, untested here.
- Per the claim gate: none of this table publishes as a headline until the
  AI side spans families and ≥100k words.

## Next

Regenerate across model families; words holding ≥10× across families become
§12 admissions ("comprehensive" currently leads that queue at 12×); words
under 2× come off regardless of anecdote.
