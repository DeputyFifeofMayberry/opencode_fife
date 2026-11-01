# Profile eval fixture — 2026-10-11

Closes the 3.4.0 evidence gap: does a saved voice profile change the rewrite's
style, without leaking the profile's content or dropping the source's claims?

## The case

- Source: `evals/corpus/ai_email_vendor.md` (the Q3 vendor-consolidation email)
- Profile: `references/profiles/example-site-updates.md` (construction PM
  writing to crew and subs — short sentences joined by "so", specifics named,
  contractions, ends on the ask; exemplars are a subcontractor number, a steel
  delivery, and an RFI deadline)
- Rewrite under profile: `evals/rewrite/profile_email_v360.md`
- Command:

```
python evals/check_profile.py --source evals/corpus/ai_email_vendor.md \
  --rewrite evals/rewrite/profile_email_v360.md \
  --profile references/profiles/example-site-updates.md \
  --claims "twelve|four|Thursday|November 1st"
```

## Checks

1. **Claims preserved (mechanical, committed as `check_profile.py`).** Every
   numeric token in the source — 23%, 15%, $400,000, 1st — plus the listed
   word claims (twelve, four, Thursday, November 1st) appears in the
   rewrite as a complete token. Run it — PASS, exit 0.
2. **Exemplar leakage (mechanical).** Ordered word-sequence match against the
   joined exemplar passages; longest shared run must stay under 3 words.
   Run it — PASS.
3. **Style shift (human, this fixture's worked example).** The rewrite reads
   in the profile's voice — "Phase one wrapped up", "so costs are down",
   "Details at Thursday's standup" — rather than the source's voice
   ("I'm thrilled to announce", "significant milestone"). Verified by
   inspection against the profile's style summary and voice bands.

## Correction history

The first version of this fixture claimed preservation while the rewrite said
"about $400,000" (source: "over $400,000"), invented procurement "chasing
twelve invoices," and added an attendance request to the standup line — and
the original checker would have passed it anyway (substring matching accepted
"123%" for "23%", word-numbers and dates were not checked, and a failed run
exited 0). All three additions were removed, the checker was rebuilt with the
audit's reproductions as tests, and this report now claims only what the
checker measures. Residual limitation, stated plainly: the checker verifies
listed claims and copied phrases; it cannot detect contextual additions —
that remains a claim-by-claim human review step (see
`results/run2-claim-correction.md`).

## What this fixture proves

Profile mechanics work: style transfers, content does not, source claims
survive. It does not prove a real writer's profile (built from their samples)
behaves identically — that needs a real profile and its owner's judgment,
which is exactly what the README's replacement flow sets up.
