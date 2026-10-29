# Intent: Local Update Process

Date: 2026-10-29
Status: Confirmed

## Outcome

One unambiguous local update process for the installed `opencode` command. Every
phrasing — "update opencode", "create local update package", "install local
build" — is a defined synonym for one procedure: `bun run update:local` (alias of
`install:local`) from the repo root on a committed `dev` tree. The full process
lives in [the local development doc](../local-development.md).

## User

The fork maintainer on this one Windows machine, and every future agent session
that receives an update request. Before this definition, agents reading "create
local update package" could land on npm packing, the Electron packer, the
disabled release workflows, or the purposeless `local-app` scaffold; recurring
interpretation confusion was the trigger for this work.

## Confirmed decisions

- **Trigger:** updates run only when the user asks. Agents may run
  `bun run local:status` and say that `dev` is ahead, but never install unasked.
- **Gate:** the installer's compiled smoke test is the only hard gate. Lint,
  typechecks, and focused tests stay advisory, guided by the checklist in the
  local development doc.
- **Source:** committed trees only. The installer refuses uncommitted source;
  the previous dirty-tolerant behavior is retired.
- **Companion commands:** `local:list`, `local:status`, `local:rollback`,
  `local:prune`.
- **Retention:** the archive keeps the newest 5 builds (~270 MB each, roughly a
  1.3 GB ceiling). Installs prune automatically; `local:prune` trims on demand.
- **Stale renames:** `opencode.exe.old-*` files held by running sessions are
  reported, not treated as failures, and cleaned by a later install or prune.
- **Engine:** the existing PowerShell installer keeps its build, smoke-test,
  source-fingerprint, and atomic-swap mechanics. No TypeScript rewrite.
- **Removed:** the empty `packages/local-app` scaffold (merged without a stated
  purpose), its branch, and its worktree.

## Success

- Any phrasing of an update request lands on `update:local` on the first try.
- A dirty tree is refused with instructions to commit first.
- Rollback is one command; the archive stays bounded; no stale rename survives
  a prune once its holding session exits.

## Constraint

Single machine. No binaries on GitHub. No service restarts by installers. The
built-in distribution update checks stay disabled.

## Out of scope

Desktop app, standalone web app, npm publishing, release workflows,
multi-machine distribution, TypeScript rewrite, automatic adoption of new
builds.
