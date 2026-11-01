# Human judging run — 2026-10-10

> **Correction 2026-10-11:** the recorded key was wrong (generator bug, see
> JUDGMENTS-smoke.md). Reconstructed mapping for these three pairs: essay
> A=v3.1.0 ✓ (as recorded), how-to A=v3.1.0 ✓, but **email A was v3.3.0** —
> so the human's email pick was a win for **v3.3.0**, not v3.1.0. Corrected
> run-1 tally: **v3.1.0 2 – 1 v3.3.0**.

One human judge, blind to the key, after the smoke run. This is the clean
judging the smoke run's contamination disclosure called for: judge did not
write the rewrites and did not know which letter was which version.

Method: quality-only, forced choice, one quoted reason.

| pair | pick | reason (judge's words) |
| --- | --- | --- |
| essay-3f206ad7 | A | cleaner/tidier |
| howto-2b25593c | A | cleaner/tidier |
| email-94e6fab3 | A | cleaner/tidier |

Tally vs key: A = v3.1.0 in all three. **Human prefers v3.1.0 3/0 over
v3.3.0** — the opposite of the (contaminated) model-judge result.

Interpretation, held loosely at n=3 and one judge: the judge prefers the
smoother, tidier prose. The unevenness and added opinion the 3.3.0 rhythm
check produces is what this reader discounts. This is the same direction as
the known limit in `evals/README.md` (judges prefer polished prose), now
observed in a human — which matters more, since human preference is the gate.
Does not by itself revert 3.3.0; it does mean the rhythm check's value is
unproven against the real gate and should be re-judged at larger n before any
change builds on it.
