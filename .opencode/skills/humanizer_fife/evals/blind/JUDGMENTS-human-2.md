# Human judging run 2 — 2026-10-10

> **Correction 2026-10-11:** the recorded key was wrong (generator bug, see
> JUDGMENTS-smoke.md). Reconstructed mapping: the **how-to pair was actually
> A=v3.3.0** — the judge's how-to pick was a win for **v3.3.0**, not v3.1.0.
> The other five pairs were keyed correctly. Corrected run-2 tally:
> **v3.1.0 5 – 1 v3.3.0** (not 6–0), and the cumulative gate across runs 1–2
> is **7–2 for v3.1.0**, not 9–0.

Same judge as run 1 (`JUDGMENTS-human.md`), now over all six registers. Blind
to the key; judged from the pair files only. Disclosure: the pairing script
printed the key to the session log before judging, so the rewriter session saw
it (no blind model judging possible this run); the judge reports working from
the pair files. The judge was told all six picks were A before tallying — same
direction as run 1, which argues the leak did not drive the calls but cannot
be proven.

Method: quality-only, forced choice. No per-pair reasons given this run; the
judge endorsed run 1's basis ("I still like A", run 1 reason: cleaner/tidier).

| pair | pick | reason |
| --- | --- | --- |
| essay-1647e644 | A | "I still like A" (run 1 basis: cleaner/tidier) |
| howto-28c21b7e | A | same |
| email-7c35534c | A | same |
| marketing-aa3ebdfd | A | same |
| review-bd5d67d7 | A | same |
| technical-69167e30 | A | same |

Tally vs key: A = v3.1.0 in all six. **v3.1.0 6/0 over v3.3.0.**

Cumulative human gate across both runs: **v3.1.0 9/0 over v3.3.0** (p ≈ 0.002
under a 50/50 null — superseded by the correction above: 7–2, and the p-value
is not meaningful at a key error rate of 1-in-3 pairs). Caveats: one judge,
both runs, correlated picks; judge's
stated taste is "cleaner/tidier", which is the exact axis the rhythm check
trades away. But the sample now spans all six registers, and the protocol's
rule is that a SKILL.md change ships only when it beats the previous version
here. The rhythm check does not.

Decision this forces (3.5.0): either rework the rhythm check to add unevenness
without the performed looseness this reader discounts, or gate it off. Building
anything further on top of 3.3.0's rhythm behavior is not supported by the
only clean preference data the repo has.
