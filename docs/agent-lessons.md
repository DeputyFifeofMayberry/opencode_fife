# Agent Lessons Learned

## LL-001 — Performance stress case not checked against actual workload
- **Status:** Open
- **Reported By:** Spec Writer
- **Location:** `.opencode/specs/2026-11-06-session-context-investigation.md`; `docs/audits/cli-performance/`
- **Problem:** The investigation spec chose a synthetic tool-heavy scenario (500 messages, 20 parts each, 10,000 parts, 50 MB) without checking the repository's actual session data. The delivered benchmark measured a storage mode and scale that the current workload does not use.
- **Observations:** The local session database has zero `session_part` rows; all 21,253 parts from the last seven days are inline. The largest real session has 632 messages, 1,344 parts, and 3.89 MB. The entire week has 10,884 tool parts across 452 sessions, roughly the volume of one synthetic S3 session. The benchmark's `withParts` target therefore does not apply to the current inline path. Recommendation: before writing a performance investigation spec, query the actual session database for storage mode, session size, part count, and tool-call volume, and compare the proposed scenarios to that distribution.

## LL-002 — QA stage handoff omitted explicit user authorization
- **Status:** Open
- **Reported By:** Spec Writer
- **Location:** `.opencode/specs/2026-11-06-session-context-investigation.md`; QA stage handoff
- **Problem:** The first QA handoff stated that QA was authorized but did not quote the user's explicit approval. The QA agent stopped at its authorization check and returned Blocked without reviewing the work.
- **Observations:** The user had approved the QA stage in response to "Do you authorize QA?" The corrected handoff quoted the exact exchange and QA resumed. The stop consumed a round trip and delayed the review. Recommendation: include the user's exact approval wording and the review cycle in every gated-stage handoff.

## LL-003 — 20-iteration p95 was too unstable to decide the verdict
- **Status:** Open
- **Reported By:** Tester
- **Location:** `packages/core/script/benchmark-session-context.ts`; S3 measurement
- **Problem:** The benchmark's default 20 measured iterations made the S3 p95 the second-highest of 20 samples. The same tree produced p95 values from 93.24 to 120.51 ms across runs, straddling the 100 ms verdict threshold.
- **Observations:** The report's 20-iteration runs produced 93.24, 92.86, and 93.96 ms; the Tester's clean runs produced 120.51 and 115.77 ms. At 100 iterations, three runs produced 104.47, 103.66, and 121.93 ms, all above 100 ms, and the verdict became Material. The S3 median stayed stable at 85.21 to 85.90 ms. Recommendation: for tail-sensitive thresholds, use at least 100 iterations and decide from a distribution across multiple runs, not a single 20-sample p95.
