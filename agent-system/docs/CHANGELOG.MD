# Changelog

All notable changes to this repository are documented here.

## v1.1.1 — 2026-11-05

### Changed
- `tester.md`: numbered section headings to match the role-file contract.

## v1.1.0 — 2026-11-05

### Added
- `AGENTS.md`: conventions for single-source rules, evidence-based rule additions, frontmatter and permission validation, and per-phase cost/intervention tracking.
- `spec-writer.md`: untrusted-material handling, high-consequence approval list, handoff version anchors, and execution-record cost tracking.
- `implementer.md`: untrusted-material handling, merged high-consequence approval rule, two-attempt retry ceiling, and `Skipped`/`Blocked` verification statuses.
- `tester.md`: working-directory and exit-code provenance, `Skipped`/`Blocked` statuses, assertion-strength checks, untrusted-material rule, and handoff version anchors.
- `qa.md`: untrusted-material rule and handoff version anchors.

### Changed
- `spec-writer.md`: verification statuses now distinguish `Skipped` and `Blocked`; only `Passed` may be reported as passed.

### Fixed
- `spec-writer.md`: removed a stray `M-` bullet prefix from the execution coordination principles.
