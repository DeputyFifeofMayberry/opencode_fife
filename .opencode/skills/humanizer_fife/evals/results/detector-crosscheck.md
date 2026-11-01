# External detector cross-check — 2026-10-10

`avoid-ai-writing-detector` (npm, MIT, from conorbronsdon/avoid-ai-writing) run
over the raw AI corpus and all twelve rewrites. This is the lexical-surface
complement to `rhythm_metrics.py`, which measures structural uniformity — the
two look at opposite risks. Reproduce:

```
npm install avoid-ai-writing-detector
node -e "const A=require('avoid-ai-writing-detector');const fs=require('fs');
for (const f of process.argv.slice(1)) {
  const r = A.analyzeText(fs.readFileSync(f,'utf8'));
  console.log(f, r.score, r.label, (r.issues||[]).length);
}" evals/corpus/*.md evals/rewrite/*.md
```

Raw per-file numbers: `detector-crosscheck.json`.

## Results

| text | score (0–100) | issues |
| --- | --- | --- |
| raw AI corpus (6 files) | 3 – 18 | 4 – 11 |
| rewrites v3.1.0 (6 files) | 0 – 5 | 1 – 3 |
| rewrites v3.3.0 (6 files) | 0 – 3 | 0 – 2 |

Reading:

1. **Direction agrees with our own metrics and the human gate:** the detector
   sees the rewrites as far cleaner than the raw drafts.
2. **Artifact caveat:** every rewrite shows exactly one `em-dash` hit — that is
   the `# 3.x.0 rewrite — file.md` header line, not prose. True residual score
   is the score minus that artifact.
3. **Genuine residues:** `essay_v310` carries two Tier-1 words (consistent with
   its deliberately light rewrite); `marketing_v310` and both technical
   rewrites carry one each — the same word their Tier-1 list flags and ours
   does not ("optimize"). That is the cross-check earning its keep: a candidate
   word for our §12 watch list, to be admitted only after the false-positive
   sweep.
4. **Never a gate.** The detector's own authors measured paragraph-level
   ROC-AUC 0.501 (a coin flip) and publish it (`PROOF.md` in their repo). It
   informs; the human gate decides.

## Follow-up: "optimize" swept and rejected — 2026-10-11

The Tier-1 residue in both technical rewrites is "optimize(s)". Swept over the
human-prose corpus: 9 hits, all in RFC technical registers (T06, T11, T12),
all in engineering senses ("optimizes the allocation of..."), none figurative.
That matches the §12 pattern already used for `robust` and `gate`: figurative
uses are tells, technical uses are the correct word. **Not adopted** — in the
one place the detector flagged it, our skill would (correctly) keep it.

