# Task telemetry

Task telemetry answers one question the runtime cannot: **what did one accepted task cost, and was it
actually accepted?** It is a query-time ledger over data the runtime already stores. It adds no model
request, no prompt token, and no write on the execution path.

## Model

A **task** is one root Session plus every Session descended from it through `parent_id`. The task row
holds only what cannot be derived: a label, a grouping policy, and an append-only acceptance history.
Everything else — sessions, turns, tokens, cost, timing — is aggregated on demand from `session_v2`,
`session_message`, and the durable event log.

### One task per root Session

This is a deliberate limitation. A root Session is the only durable unit that already groups a user
objective with all of its subagent children, retries, and resumes. Splitting one Session into several
tasks would require a segmentation model, a migration of existing history, and a policy for which
messages belong to which task. None of that is justified by the measurement need, so:

- one root Session = one task;
- a new objective started inside the same Session is **not** a new task;
- to measure a separate objective separately, start a new Session.

### Discovery

Tasks are discovered, not registered. `task list` and `task export` scan root Sessions and create a
task row for any that lacks one:

```
parent_id IS NULL          -- a root, not a subagent child
AND fork_session_id IS NULL -- a fork is a copy, not a new objective
AND time_archived IS NULL   -- archived work is out of scope
ORDER BY time_created DESC
```

A discovered task's identity is deterministic: `tsk_` + the root Session ID. Repeated queries, restarts,
and concurrent discovery therefore converge on the same row. Manual registration (`task start`) is still
supported and wins: discovery looks up `root_session_id` first and never rewrites an existing row's
label, policy, or acceptance history.

Discovery costs three queries when every task row already exists and four when it must insert: one for
eligible roots, one for existing task rows, one bulk insert for the missing ones, and a re-read. It never
runs on the execution path.

### Forks

A fork is a new Session that copies settled messages and records `fork_session_id` + `fork_boundary`;
its `parent_id` stays null. Forks are excluded from discovery and from another task's aggregation, so a
forked copy is never billed twice. A fork becomes its own task only if registered explicitly.

## Request and cost accounting

`requests` distinguishes what is observed from what is not:

| Field | Meaning |
| --- | --- |
| `observed` | Durable assistant message rows. One row is one logical step. |
| `provider_attempts` | `session.step.started` events, i.e. dispatches including retries. `null` when the event log is unusable. |
| `settled` | Observed steps that reported tokens or cost. |
| `unsettled` | Observed steps that reported neither. |
| `failed` | Observed steps that recorded an error. |
| `retries` | `session.retry.scheduled` events. `null` when the event log is unusable. |
| `unreconciled` | Provider attempts with no durable row. `null` when it cannot be computed. |

A retried attempt **reuses the same assistant message row** and clears its retry marker, so retry counts
cannot be read from messages. They come from the durable event log instead, which a deployment populates
only when `events.persist` is enabled. The local `serve` and service path does not enable it, so on a
default local install `provider_attempts`, `retries`, and `unreconciled` are `null`. They populate in a
deployment that persists the durable event log. A log that does not cover every observed step is reported
as `null` rather than as a false zero.

Tokens and cost are reported at message level, with the session-level residual exposed separately:

- `tokens` — summed from settled messages.
- `unattributed_tokens` — session rollup minus message sum, which is where retry-attempt usage and
  title/warming spend land.
- `cost.provider` / `cost.estimated` / `cost.legacy_unknown` — how each amount was priced, read from the
  settled message's own provenance and overridden by a manifest when one supplies it.
- `cost.unattributed` — session total minus message total.

`completeness` reports each dimension separately: `sessions` (the tree was enumerated and every session
built), `requests` (every observed step settled and sessions complete), `usage` (the token rollup
reconciles and requests are complete), `cost` (no unpriced records, no provenance mismatch, a
non-negative residual, every step settled, no reverted activity, no missing session row, and no
truncated or skipped session), and `measured` (at least one step was observed, so an empty ledger cannot
read as complete). `reconciled` is `cost` completeness with a zero unattributed cost. `billing_verified`
stays `false` until an external billing source is joined; nothing in this subsystem claims to verify a
provider invoice.

## Acceptance evidence

An acceptance row records a decision. `source` alone never establishes that a check ran, so every row
also carries a derived `verification` level:

| Level | Meaning |
| --- | --- |
| `verified` | A command was executed by the recorder and exited successfully. |
| `executed` | A command was executed by the recorder and did not exit successfully. |
| `declared` | Evidence was attached (artifact, report, or claimed result) but not independently executed. |
| `attested` | A person asserted the outcome with no machine evidence. |
| `unverified` | No evidence, and no user attestation. Legacy `test`/`command` rows land here. |

Evidence is optional and stored as `kind`, `reference`, `result`, `executed`, and `duration_ms`. The CLI
records `executed: true` only when it actually ran the command (`task outcome --run "<command>"`), in
which case the exit code decides `result`. Artifact and report references are recorded as `declared`
because this subsystem does not read or judge their contents.

### Trust boundary

The server trusts the authenticated local recorder for `executed`. `verified` means the recorder ran the
command and observed success; the server does not re-run it. A plugin or script with local API access can
assert evidence, so treat the level as recorder-attested execution, not third-party attestation.

The acceptance history stays append-only. A later outcome never edits an earlier row, so rework and
repeated verification remain visible. Legacy rows decode unchanged and are never upgraded: a historical
`source: test` row with no evidence reports `unverified`.

## Usage

```sh
# Discover tasks and show identities
opencode task list
opencode task list --format json --limit 200

# Read one task ledger
opencode task show tsk_ses_abc123
opencode task show tsk_ses_abc123 --format json

# Record an explicit decision
opencode task outcome tsk_ses_abc123 accepted --source user --note "shipped"
opencode task outcome tsk_ses_abc123 accepted --source test --run "bun test packages/core/test/telemetry"
opencode task outcome tsk_ses_abc123 rejected --source test --evidence-kind artifact \
  --evidence-ref reports/qa-2026-11-03.json --evidence-result failed

# Export
opencode task export --format csv --out tasks.csv
opencode task export --format json --limit 500
```

`task list` returns the 50 most recent tasks by default. `task export` covers up to 500 tasks, the maximum
per call; pass `--limit` to narrow either. An export sets `truncated` when the number of root Sessions
exceeds the number of tasks it selected, and reports it on stderr or in the file summary line. A task
whose ledger fails to build is counted in `skipped`, not `truncated`.

CSV rows carry `root_outcome` (the root Session's last execution outcome, not the last enumerated
Session's) and `measured` alongside the completeness flags. A cell starting with `=`, `+`, `-`, or `@` is
prefixed with a single quote so spreadsheet software treats it as text.

## Guarantees

- **Zero inference.** No route, command, or aggregation calls a model. `test/telemetry/zero-token.test.ts`
  fails if the session runtime imports this subsystem.
- **No prompt change.** Nothing here is model-visible.
- **No execution-path write.** Task rows are written only by an explicit command or a reporting query.
- **Local only.** Data stays in the local SQLite database.
- **Append-only acceptance.** No update or delete API exists for acceptance rows.

## Benchmark

`packages/core/script/telemetry-bench.ts` measures only the work telemetry adds on demand: explicit
writes, discovery, report builds, and exports. Run it from `packages/core`:

```sh
bun script/telemetry-bench.ts
```

It prints one JSON object and exits non-zero when a threshold fails. **Every latency threshold is a p95
limit**, not a maximum: `task.record` 5 ms, `task.ensure` 10 ms, `task.discover.warm` 50 ms,
`report.build 1x5000` 500 ms, `report.export.csv 100` 2000 ms, and the eight-way concurrent report build
2000 ms. A single slow sample can push `max_ms` past its limit while the case passes, because one outlier
does not describe typical latency; `max_ms` is reported for visibility, not as the pass criterion.

Each verdict records `evaluated_on`. It is `p95_ms` whenever the sample size supports that statistic (the
95th percentile needs at least 40 samples) and `max_ms` otherwise. `max_ms` bounds p95 from above, so the
fallback cannot pass a case that p95 would fail. Each case discards `max(10, 20% of samples)` warm-up
iterations and runs `Bun.gc(true)` before and after; heap and SQLite file growth are reported, not
thresholded. Report-build cost is also compared with the equivalent pre-telemetry path
(`SessionTransfer.export` for every session, then `SessionUsageReport.build`) against a 2.5x limit; the
pure in-memory aggregation time is informational.

## Known limitations

- One task per root Session (see above).
- Retry and provider-attempt counts require a persisted durable event log. The default local server does
  not enable `events.persist`, so they are `null` there rather than a guessed number.
- Retry-attempt token usage is only visible as the `unattributed` residual, not attributed per attempt.
- `billing_verified` is always `false`; provider invoices are not joined.
- Forks are excluded from aggregation unless registered as their own task.
- Sessions deleted from the store cascade-delete their task and acceptance rows.
- `task start` can register an archived Session; discovery excludes archived roots, so the task is
  reachable by `task show` but absent from `task list`/`task export`.
- `unattributed_tokens` clamps a negative residual to zero; `completeness.usage` is the signal for that
  anomaly.
- `verification` is derived from stored evidence on read, so a future rule change reinterprets history;
  the stored evidence itself is immutable.
