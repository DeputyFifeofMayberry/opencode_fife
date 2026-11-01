# Glossary

Shared vocabulary for the effort subsystem. Terms are listed once and used
consistently in code, tests, specs, and issues. Behavior reference:
`docs/spec/effort-policy.md`.

**Verifier.** A command configured in `effort_policy.verification_commands` whose
process exit describes whether the session's work is correct. Identity is the bare
command string, matched exactly, with the working directory ignored. Only a
command whose own exit can be attributed counts: a compound or decorated command
is not a verifier, because a shell reports one status for the whole expression.

**Settlement.** One finished tool call: its tool name, input, and outcome
metadata. Every settlement is offered to the effort subsystem for classification,
but only a verifier settlement can change escalation state. Spawn failures,
cancellations, timeouts, and missing exits are called *infrastructure* and change
nothing.

**Revision.** A durable per-session counter that advances when the workspace may
have changed. It rises when a file-mutating tool starts, and when a shell command
that is not a verifier starts, for every session in the same directory. Running a
verifier never raises it. A pass observed at an older revision cannot clear a
failure recorded at a newer one.

**Observation order.** A durable per-session counter (`evidence_sequence`) that
orders settlements. One number is claimed per qualifying settlement, inside the
same transaction that records its effect; a discarded settlement claims nothing.
It is independent of the session's event log and never consumes an event sequence
number.

**Escalation.** The state that raises a session's effort level because a verifier
is failing. It opens when a verifier exits non-zero and clears only when the same
verifier passes at a strictly newer observation order and a revision that is not
older than the failure's.
