# Lens: Cross-Module Coherence - Findings

**Date:** 2026-10-28. **Scope:** full repo. **Method:** verified every scout-flagged layering lead with file:line evidence on both sides; traced the primary event/SSE data flow (core bus -> schema manifest -> protocol guard -> server event-feed -> generated client) end to end; probed high-connectivity nodes (ui, schema, plugin, ai, client) for contract drift, duplication clusters, and manifest mismatches.

## Findings

## Finding: Share surface (packages/web) types against a phantom opencode/session/* module that exists nowhere, and the package is excluded from every check
- **Location:** packages/web/src/components/Share.tsx:8-10 + packages/web/src/pages/s/[id].astro:4 <-> packages/web/package.json (no opencode dependency; no typecheck/test script) and .audit/static-analysis.md:93 (web absent from the 35 turbo typecheck tasks; only www and posts run astro check)
- **Evidence:** Share.tsx imports MessageV2 from "opencode/session/message-v2", Message from "opencode/session/message", Session from "opencode/session/index"; the routed page s/[id].astro:4 imports Session from "opencode/session/index". No opencode package exists at root or web node_modules (Test-Path: both False), no tsconfig path aliases, and no ambient declare module "opencode/..." (src/types declares only virtual:starlight/user-images and lang-map). These specifiers match the pre-monorepo upstream layout, indicating the share UI predates the workspace restructure and was never migrated onto @opencode/schema. The live conversion fromV1 (Share.tsx:503-549+) maps the share API payload to these unverifiable shapes using non-null assertions (v1.metadata.assistant!.cost etc.). Share.tsx is live: rendered by pages/s/[id].astro:147 with client:only="solid".
- **Impact:** maintenance hazard + latent runtime risk on a deployed surface. All offending imports are import type, so builds erase them and deploys succeed; but any drift between the share API payload and these hand-assumed shapes is invisible to bun run check, astro build, and tests alike. The v1->v2 conversion logic is effectively uncheckable against current domain types.
- **Severity suggestion:** P2
- **Category:** coherence (also migration completeness)
## Finding: cli imports @opencode/protocol at runtime while protocol is only a devDependency
- **Location:** packages/cli/src/acp/client.ts:2 <-> packages/cli/package.json:59
- **Evidence:** cli/src/acp/client.ts:2 performs a runtime (non-type) import: import { InvalidCursorError, InvalidRequestError, SessionNotFoundError } from "@opencode/protocol/errors". In packages/cli/package.json, @opencode/protocol appears only under devDependencies (line 59); the dependencies block (lines 29-56) declares client, plugin, schema, server, tui, util but not protocol. Protocol resolves today only as a transitive runtime dep of the declared @opencode/server.
- **Impact:** fragile integration point: the direct edge is satisfied by workspace hoisting and bundling, not by the manifest. Strict installs, packaging changes, or hoisting strategy changes would break it; the manifest understates the real dependency surface of the CLI binary.
- **Severity suggestion:** P3
- **Category:** coherence

## QUESTIONs (unresolved, insufficient evidence to assert)

## QUESTION: Is there any automatic guard that every event published on core bus is registered in EventManifest.ServerDefinitions?
- **Location:** packages/server/src/event-feed.ts:49 <-> packages/schema/src/event-manifest.ts:70-83
- **Evidence:** the server SSE publisher silently drops any event failing the public-surface guard: if (!isOpenCodeEvent(event)) return (event-feed.ts:49), where the guard is event.type === "server.connected" || EventManifest.isServer(event) || event.type.startsWith("rpc.") (packages/protocol/src/groups/event.ts:85-86), and isServer is membership in the manifest union (schema/src/event-manifest.ts:83). The schema tests found (schema/test/event-manifest.test.ts:26,78,164,171) are targeted toContain/not.toContain assertions for specific events, not a sweep proving every core-published event is registered. If a new core event ships without a manifest entry, every UI surface silently loses it and no check fails.
- **Why not a finding:** no concrete event currently published but missing from the manifest was found; the failure mode is hypothetical without evidence of an actual victim.
- **Severity if confirmed:** P2 (silent feature loss across all clients)
## Verified non-issues (scout leads checked and dismissed)

1. **protocol -> client (2 hits): DISMISSED.** packages/protocol/src/client.ts:9,14 - the strings "@opencode/client/LocationMiddleware" / "@opencode/client/SessionLocationMiddleware" are Effect HttpApiMiddleware.Service Context.Tag identifier literals, not imports. Zero actual @opencode/client imports in protocol src.
2. **session-ui -> server / core / sdk: DISMISSED.** All three hits are packages/session-ui/src/import-boundaries.test.ts:17-19, an executable boundary contract asserting these dependencies are undefined in package.json (they are; verified against packages/session-ui/package.json:67-86). Healthy hygiene, not drift. Note: the codemap claim that session-ui declares sdk is inaccurate - the actual manifest has no sdk dependency and the test forbids it.
3. **tui -> core (1 hit): CONFIRMED as a real import, DISMISSED as a violation.** packages/tui/src/component/dialog-worktree-name.tsx:1 imports Slug from @opencode/core/util/slug; core is declared in packages/tui/package.json dependencies, and the AGENTS.md yardstick places no restriction on tui -> core. It is tui only core import, and Slug has a single implementation repo-wide (core/src/util/slug.ts:1) - no duplication. Observation only: one helper justifies a heavyweight manifest edge.
4. **app -> ai (1 hit): DISMISSED.** packages/app/src/providers/models/select-dialog.stories.tsx:11 - an npm package name as a string field value in a story fixture, not an import.
5. **plugin -> ai (2 hits): DISMISSED.** plugin/src/promise/session.ts:2 and plugin/src/effect/session.ts:2 - type-only imports of GenerationOptionsFields/SystemPart from @opencode/ai/effect; both are genuinely re-exported there (ai/src/effect.ts:34,98, defined at ai/src/schema/options.ts:133 and ai/src/schema/messages.ts:29). Declared in plugin manifest.
6. **plugin -> protocol: DISMISSED.** Dynamic import at plugin/src/promise/adapter.ts:224; @opencode/protocol is in plugin dependencies per its manifest.
7. **cli -> server: DISMISSED.** Dynamic import at cli/src/server-process.ts:84 (@opencode/server/process); manifest-declared; by design (the CLI owns the server process).
8. **merman -> plugin / latex -> plugin: DISMISSED.** merman/src/plugin.ts:1 and latex/src/plugin.ts:1 import Plugin from @opencode/plugin/tui; both manifests declare @opencode/plugin as workspace:* and both packages export a deliberate ./plugin subpath. (The codemap "latex: no internal deps (leaf)" row is inaccurate.)
9. **Event vocabulary sync: HEALTHY.** session.inbox.enqueued/delivered literals are defined once (schema/src/session-event.ts:231,238); all consumers (core message-updater.ts:141-142, server feed, client, tui, sdk tests) match via the schema discriminated union or generated artifacts, not hand-maintained parallel lists.
10. **SSE envelope contract: HEALTHY.** Producer frame() = data: JSON of event + newlines (server/src/event-feed.ts:29-31); parsing lives in the generated client (SSE handling in httpapi-codegen/src/index.ts:972, codegen-tested). The app has no raw-fetch bypass of the typed client (only story-fixture tool mocks use fetch calls).
11. **Plugin <-> ai interface consistency: HEALTHY.** All plugin->ai symbols verified present on the ai side (see item 5).

Also noted (below reporting threshold): normalizeLocale exists in two standalone-by-design surfaces (packages/web/src/components/share/common.tsx:21 returning string; packages/app/src/runtime/i18n/language.tsx:198 returning Locale) with different signatures; only 2 sites, under the 3+ duplication-cluster bar, and web is intentionally workspace-independent.
