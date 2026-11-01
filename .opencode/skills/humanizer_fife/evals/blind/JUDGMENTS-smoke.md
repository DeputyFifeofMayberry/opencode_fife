# Smoke judging run — 2026-10-10

> **Correction 2026-10-11:** the key recorded for this run was wrong — the
> generator hardcoded A=old, B=new regardless of the shuffle. Reconstructed
> from the archived pair texts (`evals/reconstruct_keys.py`): the email pair
> was actually A=v3.3.0 / B=v3.1.0, so the model's B pick on email was a win
> for **v3.1.0**, not v3.3.0. Corrected tally: **v3.3.0 2 – 1 v3.1.0**
> (essay and how-to to v3.3.0, email to v3.1.0). The table below preserves
> the originally recorded (wrong) version labels.

**Contamination disclosure:** the rewriter and the judge were the same model in
the same session, and the judge knew the key. This run validates the pairing and
tally pipeline end to end. It is NOT evidence of improvement. Cross-family or
human judging per `evals/README.md` is still owed.

Method: quality-only, forced choice, confidence 1-5, one quoted reason.

| pair | pick | conf | reason (quoted from pair) |
| --- | --- | --- | --- |
| essay-3f206ad7 | B | 4 | A ends "fundamentally human endeavor" (aphoristic closer, §13-style send-off); B ends on a concrete fact |
| howto-2b25593c | B | 5 | B has actual opinion ("Don't overbuy", "$100 router does most apartments") and uneven section lengths; A is tidy and faceless |
| email-94e6fab3 | B | 4 | A's "This happened because of your flexibility" is a floating tribute; B names what the flexibility did ("without service gaps") |

Tally vs key (see tally in results/): B = v3.3.0 in all three.

**Correction (found 2026-10-10, after human run):** the email row is
self-contradictory — it picks B but quotes B's floating tribute
("This happened because of your flexibility") as A's and A's concrete line
("without service gaps") as B's. The quotes are swapped relative to the pair
file, so the recorded pick for that row is unreliable. The essay and howto
rows match their pair files.
