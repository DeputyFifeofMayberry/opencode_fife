# Rebrand allowlist

Identifiers in this list are **owned by external systems**. They stay spelled `opencode`/`OpenCode`
even after the rebrand to `fifecode`/`Fifecode`. Any bulk rename pass must exempt them, and the final
sweep (`docs/plans/fifecode-rebrand-plan.md`, WS-I) treats every remaining occurrence as either an
allowlisted entry or a defect.

This file governs **renaming only**. It says nothing about whether a surface should eventually be
rewired to a fork-owned service; those are product decisions recorded in the plan.

## Entries

1. **External npm packages** — `@opencode-ai/pty` and `@brendonovich/vite-plugin-opencode` are
   published by third parties. Never rename the dependency specifier.
   The compat shim in `provider.ts` maps both `@opencode-ai/*` and `@opencode/*` to `@fifecode/*`
   for in-repo providers.

2. **Provider wire id `"opencode"`** — the managed/Zen provider id in
   `packages/schema/src/provider.ts`. It matches the models.dev catalog. Only display copy becomes
   "Fifecode". User configs naming `provider: "opencode"` must keep working.
   The API-key env var is rebranded separately (`FIFECODE_ZEN_API_KEY`).

3. **`opencode.ai` hosts** — auth, console login, share, the models catalog, and update-server code
   stay wired to the existing domains. No new hosts are invented for the fork. Update checks are
   disabled rather than redirected (plan §0).

4. **Historical records** — `CHANGELOG.md`, `.github/release/`, and issue links in comments
   (for example `anomalyco/opencode#51867`) describe upstream history. Leave them as written.
   New entries use the new name.

5. **Config `$schema` URL** — if a schema URL served by `opencode.ai` is referenced, it stays.

6. **Upstream extension publishing metadata** — the `sst-dev` publisher id and the
   `sst/opencode` repository URL in `sdks/vscode/package.json` are upstream artifacts. They stay
   until the extension is actually published under a fork identity.

7. **This document and the rebrand plan** — both quote the old name deliberately.

## Working rules

- Add an entry here **before** the bulk pass that would otherwise rename it. An exemption that exists
  only in a script's regular expression is invisible to the next maintainer.
- Do not add an entry for something merely inconvenient to rename. The allowlist is for external
  ownership, not for avoiding work.
- When the final sweep reports a residual `opencode` occurrence, it must name the allowlist entry
  that permits it. "Known" is not an entry.
