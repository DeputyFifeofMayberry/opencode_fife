# Human judging run 3 — v3.6.0 gate — 2026-10-11

> **Correction 2026-10-11 (same day, post-audit):** two defects invalidate
> the interpretation below. (1) The recorded key was wrong — the generator
> hardcoded A=old, B=new regardless of the shuffle; the "15/15 fluke"
> analysis was therefore misguided, since the anomaly was in the key, not in
> the shuffle. (2) Three rewrite files (how-to, marketing, review) were edited
> after this run's pairs were cut, so those pairs judged text that no longer
> exists on disk. Reconstructed true mapping
> (`evals/reconstruct_keys.py`, `results/key-reconstruction.json`): essay
> A=v3.6.0, how-to A=v3.6.0 (pre-edit), email A=v3.1.0, marketing A=v3.1.0,
> review A=v3.1.0, technical A=v3.1.0. Corrected winners against the judge's
> picks (B, B, B, A, A, A): **v3.1.0 5 – 1 v3.6.0** — v3.6.0 won email
> only. The gate obligation for v3.6.0 is **not** met; the changes
> are gate-pending a clean re-judge (see 3.6.1 changelog). The "prior-defying
> wins" analysis below is withdrawn.

Purpose: protocol gate for v3.6.0 (injection bans, no-op rule, artifacts,
word-evidence weighting) against the v3.1.0 baseline the human gate preferred.
Same judge as runs 1–2, judging pasted pairs one at a time, blind to the key.
The rewriter session generated the key without printing it, so both judge and
rewriter were blind this run — until tally time, when this key was read. The
recorded key said A = v3.1.0, B = v3.6.0 in all six pairs, but per the
correction above, the recorded key does not reflect the actual pair contents.

## Tally

| pair | pick | version won |
| --- | --- | --- |
| essay-38b1fae6 | B | **v3.1.0** |
| howto-5fbf038f | B | **v3.1.0** (pre-edit text judged) |
| email-9c9edf62 | B | **v3.6.0** |
| marketing-8f89d7ec | A | **v3.1.0** (pre-edit text judged) |
| review-0fc940ad | A | **v3.1.0** (pre-edit text judged) |
| technical-a8c0f135 | A | **v3.1.0** |

**Corrected result: v3.1.0 5 – 1 v3.6.0.** The originally recorded 3–3 and
the "prior-defying wins" framing were artifacts of the wrong key; under the
true mapping, v3.6.0 wins email only.

No reasons were solicited per pick this run; the judge's standing taste
statement from runs 1–2 is "cleaner/tidier."

## Verdict (superseded by the correction above)

1. **The v3.6.0 gate obligation is not met.** Under the corrected key,
   v3.6.0 lost this run 5–1, and three of the six pairs judged pre-edit text
   that no longer exists on disk. The v3.6.0 changes stay in the skill as
   gate-pending candidates; a clean re-judge — fixed keys, frozen artifacts,
   judge not previously exposed to tallies — decides whether they stay.
2. **marketing, review, technical, essay, how-to all went to v3.1.0.** The
   only v3.6.0 win was email. Whatever the cause, the stripped v3.6.0 style
   did not beat the baseline here.
3. **Process fixes owed (all now in place):** key generation records the
   actual shuffle (`make_pairs.py` self-test), run artifacts are frozen with
   content hashes (`freeze_run.py`), and tallies are withheld from the judge
   until runs are banked.

## Compliance notes

- Claim preservation: the v3.6.0 rewrites were checked line-by-line against
  sources (see `results/run2-claim-correction.md` for why this is now a
  checklist item — the run-2 v3.3.0 set contained invented specifics).
- Mechanical gate (`check_gate.py`, revised OANC floors): email, essay,
  marketing pass all flags. how-to, review, technical carry CV flags reviewed
  and accepted: 7–11-sentence texts have noisy CVs, the floors were derived on
  long-form docs, and pushing sentence lengths to satisfy the metric is the
  formula variation step 4 forbids. Technical v3.6.0 sits at the human
  technical-genre boundary (sent CV 0.231 vs genre min 0.252).
