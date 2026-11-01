# Correction to run-2 artifacts — 2026-10-11

Protocol step 6 (claim preservation: additions are an automatic fail) applied
retroactively to the v3.3.0 rewrite files found three invented specifics:

- `howto_v330.md`: "every scanner on the internet knows the factory one" — no
  such claim in `ai_howto_network.md`.
- `email_v330.md`: "without service gaps" and "if your tool is on the chopping
  block, you'll hear it there first" — neither in `ai_email_vendor.md`.

These were rewrite-side additions, not source claims. Consequences, honestly
stated: the run-2 human preference data (recorded 6/0 under the wrong key;
5–1 after correction) compared a compliant
v3.1.0 set against a partially non-compliant v3.3.0 set, and neither the model
judge nor the human caught the additions. The style-preference verdict stands
as preference data; it is no longer clean evidence about v3.3.0's *protocol*
compliance. The v3.5.0 removal decision rests primarily on that preference
data plus the restraint calibration (79% token change), and is unaffected in
direction, but this file exists so the ledger shows exactly what was compared.

The v3.6.0 rewrites were checked line-by-line against their sources before
pairing.
