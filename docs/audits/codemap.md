# Codemap — opencode (Y:\Coding_Projects\opencode_fife)

**Audit scope:** FULL REPO (general structural health). Detailed analysis on the 10 focus packages (core, server, tui, cli, app, ai, protocol, schema, sdk, plugin); everything else documented at directory/package level.
**Repo:** Bun + TypeScript monorepo, turbo-managed, version 2.2.0, `dev` is the daily integration branch. Working tree clean at audit time (only untracked `.audit/`).

## Scale Summary (measured, excludes node_modules / dist / .worktrees / lockfiles / generated trees)

- **~3,890 TS/TSX source files** under `packages/*` and `services/*` `src/` trees (per-package counts in table below) — plus **845 test files** in `packages/<pkg>/test/` dirs and **127 colocated test files** in `packages/app/src`.
- **~635,000 lines** across the 31 largest src trees + `script/` (measured with `ReadAllLines`, includes blank lines; earlier per-package line figures undercount blank lines and are approximate).
- **286 source files exceed 500 lines**; top offenders listed in Risk Hotspots.
- 40 turbo-visible packages (typecheck ran in 35 of them); workspaces: `packages/*`, `packages/plugins/*`, `services/*`, `packages/console/*`, `packages/stats/*`.

## Architecture Overview

**What it is:** opencode is an AI-powered development tool: a CLI + terminal UI + web app + Electron desktop app that drives LLM sessions (agents, tools, MCP, plugins) against a local project, backed by a local HTTP server and SQLite persistence. Effect-TS (v4) is the backbone of the backend; SolidJS is the backbone of all UI surfaces (TUI via @opentui/solid, web via SolidStart, desktop embeds the web app).

**Tier map (top → bottom):**

1. **Surfaces** — `packages/cli` (CLI entry, `commands/`, spawns server + TUI), `packages/tui` (OpenTUI terminal UI), `packages/app` (SolidStart/Vite PWA web app), `packages/desktop` (Electron shell embedding app), `packages/console/app` + `packages/stats/app` (separate web consoles), `services/www` + `packages/posts` (Astro sites), `services/{changelog,files,update}` (small deploy services).
2. **Client runtime** — `packages/client`: generated HTTP client in three flavors (`promise/`, `effect/`, `solid/`), generated from the protocol (regenerate via `bun run generate` after any public HttpApi change — never hand-edit `src/promise/generated`, `src/effect/generated`).
3. **Protocol** — `packages/protocol`: the typed HttpApi definition (34 files in `groups/`), OpenAPI generation, client contract. Depends only on schema.
4. **Server** — `packages/server`: Effect/Hono HTTP server. `handlers/` (35 files) + `middleware/` (location scoping: form/session/location), `auth.ts` (basic auth + signed session tokens), `event-feed.ts` (SSE), `routes.ts`/`api.ts` (composition), `pairing.ts` (device pairing).
5. **Core domain** — `packages/core` (466 src files, largest package): session engine (`session/` 54 files — inbox, runner, execution, projector, compaction, diff, move, store), tools (`tool/` 23), config (`config/` 29), database (`database/` 86 — Drizzle + SQLite, incl. `v1-migration.bun.ts`), plugin host (`plugin/` 70), LLM/effort adapters (`effort/` 11), provider integrations (`github-copilot/` 24, `mcp/`, `oauth/`, `credential/`), filesystem (`filesystem/` 11 + `file-access.ts`/`file-mutation.ts`), shell scanning (`shell/` 7 incl. 2,407-line `scan.ts`), PTY (`pty/`, `persistent-pty/`).
6. **AI/LLM layer** — `packages/ai` (244 files): provider protocol implementations (`protocols/anthropic-messages.ts` 1,713 ln, `openai-chat.ts` 1,410, `open-responses.ts` 1,481), consumed heavily by core (434 import statements).
7. **Shared layers** — `packages/schema` (105 files, leaf: all Effect Schema domain types + identifiers), `packages/util` (58 files, generic helpers), `packages/theme`, `packages/ui` (258 files shared Solid component library — highest fan-in in repo), `packages/session-ui` (session rendering components), `packages/gui-plugins`, `packages/plugin` (plugin runtime/API — 86 files, `gui/host-apis.ts` 2,050 ln), `packages/codemode` (sandboxed JS interpreter, 2,357-line `interpreter.ts`), `packages/merman` + `packages/latex` (diagram/markdown rendering), `packages/patchmark`, `packages/simulation` (test doubles driving server), `packages/sdk` (public SDK composing client+core+server), `packages/plugin-browser`, `packages/stories`, `packages/gui-extensions`, `packages/effect-drizzle-sqlite`, `packages/function`, `packages/web`.

**Primary data flow:** UI (cli/tui/app/desktop) → `@opencode/client` (typed generated client) → HTTP → `@opencode/server` (middleware → `handlers/`) → `@opencode/core` services → Drizzle/SQLite + filesystem + `@opencode/ai` LLM providers → durable events (`schema/event-log`, `core/src/bus.ts`, projections) → SSE `event-feed.ts` back to all connected clients. Tool calls flow core `tool/` → permission gate (`permission/`, `managed-policy.ts`) → shell/PTY/filesystem execution. MCP servers integrate via `core/src/mcp` (@modelcontextprotocol/client).

**Repo-level tooling:** `script/` (generate.ts codegen, dev-live.ts, lint-changed.ts, release.ts, pack.ts, sdk-docs.ts…), `turbo.json` (typecheck/test/build with `transit` hash-folding task), `.github/workflows/` (check.yml, check-test.yml, release.yml, nightly-beta.yml, deploy-*.yml, triage-*.yml), `docs/` (local-development.md, local-development-recap.md), `specs/v2/`, `patches/` (19 patched deps), `.opencode/` (ECC skills/hooks for agents), `perf/`, `infra/`, `nix/`, `salesforce/`, `sdks/`, `tasks/`.

## File Manifest (representative, not exhaustive — see Coverage Notes)

### Entry points

| File | Lines | Purpose |
|------|-------|---------|
| packages/cli/src/index.ts | — | CLI binary entry (`bun run dev` → this) |
| packages/cli/src/server-process.ts | — | spawns/owns the local server process |
| packages/cli/src/mini.ts + mini-host.ts | — | lightweight "mini" host mode |
| packages/tui/src/index.tsx | — | TUI entry (re-exports `run` from app.tsx, 1,483 ln) |
| packages/tui/src/app.tsx | 1,483 | TUI application root |
| packages/server/src/fetch.ts / routes.ts / api.ts | — | HTTP server entry & route composition |
| packages/app/index.html + vite.config.ts | — | web app entry (SolidStart/Vite, PWA) |
| packages/desktop/src/* | — | Electron main/renderer shell |
| script/generate.ts | — | root codegen entry (`bun run generate`) |
| packages/httpapi-codegen/src/index.ts | 1,977 | generates client from protocol |

### Largest source files (>1,100 lines, non-generated, top ~40 of 286 files >500 lines)

| File | Lines |
|------|-------|
| packages/tui/src/routes/session/index.tsx | 3,820 |
| packages/session-ui/src/tools/tool-renderer.tsx | 2,722 |
| packages/client/src/effect/api/api.ts | 2,589 |
| packages/core/src/shell/scan.ts | 2,407 |
| packages/codemode/src/interpreter/interpreter.ts | 2,357 |
| packages/client/src/solid/data.ts | 2,085 |
| packages/plugin/src/gui/host-apis.ts | 2,050 |
| packages/tui/src/component/prompt/index.tsx | 2,049 |
| packages/tui/src/mini/stream-v2.transport.ts | 1,916 |
| packages/stats/app/src/routes/index.tsx | 1,883 |
| packages/tui/src/component/session-tabs.tsx | 1,801 |
| packages/gui-plugins/src/browser/chromium.ts | 1,785 |
| packages/app/src/providers/connect/dialog.tsx | 1,752 |
| packages/ai/src/protocols/anthropic-messages.ts | 1,713 |
| packages/core/src/github-copilot/responses/openai-responses-language-model.ts | 1,636 |
| packages/ui/src/data-display/project-avatar/procedural.ts | 1,563 |
| packages/ui/src/data-display/project-avatar/procedural-world.ts | 1,542 |
| packages/tui/src/mini/footer.prompt.tsx | 1,538 |
| packages/app/src/session/requests/session-question-dock.tsx | 1,534 |
| packages/merman/src/state/routing.ts | 1,522 |
| packages/core/src/git.ts | 1,495 |
| packages/stats/app/src/routes/[lab]/[model].tsx | 1,494 |
| packages/app/src/composer/editor/editor.tsx | 1,487 |
| packages/tui/src/app.tsx | 1,483 |
| packages/ai/src/protocols/open-responses.ts | 1,481 |
| packages/merman/src/flowchart/routing.ts | 1,429 |
| packages/tui/src/feature-plugins/system/diff-viewer.tsx | 1,414 |
| packages/ai/src/protocols/openai-chat.ts | 1,410 |
| packages/tui/src/mini/tool.ts | 1,394 |
| packages/session-ui/src/components/file.tsx | 1,391 |
| packages/session-ui/src/timeline/session-timeline-row.tsx | 1,342 |
| packages/gui-plugins/src/browser/panel.tsx | 1,300 |
| packages/tui/src/component/dialog-integration.tsx | 1,286 |
| packages/core/src/session/compaction.ts | 1,285 |
| packages/app/src/runtime/i18n/en.ts | 1,270 |
| packages/patchmark/src/inline.ts | 1,247 |
| packages/core/src/database/v1-migration.bun.ts | 1,234 |
| packages/tui/src/mini/footer.command.tsx | 1,205 |
| packages/session-ui/src/components/markdown.tsx | 1,198 |
| packages/session-ui/src/message/message-content.tsx | 1,181 |

Generated (excluded from analysis, listed for completeness): `packages/client/src/promise/generated/types.ts` (4,548), `packages/client/src/promise/generated/client.ts` (2,527), `packages/client/src/effect/generated/client.ts` (1,810). Largest test files: `packages/merman/src/flowchart/flowchart.test.ts` (2,693), `packages/session-ui/src/timeline/rows-current.test.ts` (1,777), `packages/merman/src/state/diagram.test.ts` (1,386).

### Per-package inventory (files in src/, all TS/TSX incl. colocated tests/stories)

| Package | Files | Role / notes |
|---------|-------|--------------|
| packages/app | 630 | SolidStart web app (PWA); 127 colocated test files + e2e/ Playwright suite; densest lint-warning cluster (new-session/*) |
| packages/core | 466 | Domain core; 305 test files in test/ |
| packages/gui-plugins | 858 | In-app plugin panels (browser/terminal/details…); fixture-driven component tests |
| packages/tui | 303 | Terminal UI; 190 test files in test/ |
| packages/ai | 244 | LLM provider protocols; 151 test files in test/ |
| packages/ui | 258 | Shared Solid component library (highest fan-in) |
| packages/session-ui | 137 | Session rendering components (stories/fixtures) |
| packages/desktop | 154 | Electron shell (src/ + script/) |
| packages/console/app | 86 | Console web app |
| packages/plugin | 86 | Plugin runtime/host APIs; only 4 test files |
| packages/merman | 88 | Diagram rendering (colocated tests) |
| packages/cli | 120 | CLI; 53 test files in test/ |
| packages/codemode | 45 | Sandboxed JS interpreter; 34 test files |
| packages/client | 34 | Generated HTTP client (promise/effect/solid) |
| packages/schema | 105 | Effect Schema domain types (leaf) |
| packages/protocol | 40 | HttpApi definition groups; only 4 test files |
| packages/server | 55 | HTTP server; 38 test files in test/ |
| packages/util | 58 | Shared helpers; 5 test files |
| packages/stats/app · core · server | 61 · 27 · 1 | Stats web app/core |
| others (theme 10, latex 14, patchmark 8, plugin-browser 8, http-recorder 14, simulation 13, sdk 15, web 18, gui-extensions, function 3, stories 4, posts 1, script 3, services ~15) | — | see Architecture Overview |

## Convention Fingerprint (authoritative source: AGENTS.md; verified in code)

- **Formatting:** Prettier, no semicolons, 120 print width; blank line required between statements (enforced by custom ast-grep rule `require-readable-spacing`).
- **Type assertions require a `SAFETY:` comment** stating the checked invariant (ast-grep `require-safety-comment-for-type-assertion`); no chained assertions, no `any`, prefer inference; `unknown` at boundaries must be parsed once at the owning boundary (no repeated typeof checks — `no-runtime-typeof` rule).
- **Module style:** namespace-aggregation re-export at file top (`export * as Session from "./session.js"` — core/src/session.ts:1); namespace-style imports (`import { Project } from "@opencode/core/project"`, use `Project.ID`); **no star imports, no aliased imports, no type-position `import()`**.
- **Layering rules (the audit yardstick):** Schema → Core; Protocol → Server; client runtime depends on Schema + Protocol only, never Core/Server; sdk composes Client+Core+Server. HttpApi changes require `bun run generate`; never edit generated client files.
- **Effect-TS v4 idiom throughout backend:** `Effect`/`Layer`/`Context`/`Option`/`Stream`; bind services to named variables before calling methods (no nested service yields); typed error classes per domain (`core/src/session/error.ts`: `BusyError`, `PromptConflictError`, …) re-exported through facades; avoid try/catch; `Redacted`/`Option` for secrets (seen in server/test/auth.test.ts).
- **Drizzle schemas:** snake_case columns, no name-redefining strings (`sqliteTable("session", { project_id: text().notNull() })`).
- **No `else` after return**; early returns; `const` preferred; no preemptive single-use helpers; `src/config` self-export pattern.
- **Testing:** `bun:test`, flat `test("…", () => {})` (AAA, descriptive behavior names, minimal mocks); tests live in `packages/<pkg>/test/` (core 305, tui 190, ai 151, cli 53, server 38, codemode 34, client 22, schema 19, simulation 9, sdk 11, util 5, plugin 4, protocol 4) except `app` (127 colocated in src + Playwright e2e) and a few colocated suites (merman, ui, app voice). **Tests never run from repo root** (root `test` script deliberately fails); run per package. Playwright component tests mount story fixtures (`packages/stories`, `*.fixture.tsx`).
- **Checks:** `bun run check` = oxlint + ast-grep anti-slop rules + sdk-docs + turbo `typecheck` (`bun check`, TS 7.1); CI uses `typecheck:tsc` (`@typescript/native` tsc -b); turbo `transit` task folds workspace deps into cache hashes. Optional rule sets (verified in `script/ast-grep/{rules,rule-tests,effect-simplifications,gui-plugins}/`): effect-pattern rules (`no-effect-catch-*`, `no-effect-and-then-succeed-undefined`, `no-effect-flat-map-suspend`, `no-identity-pipe`, `no-module-state`) and convention rules (`no-drizzle-column-name`, `no-import-alias`, `no-json-parse-cast`, `no-nested-effect-service-yield`, `no-star-import`, `no-effect-die-string`), each with `.test.yml` snapshots.
- **Git:** conventional commits `type(scope): summary` (feat/fix/perf/docs/chore/refactor/test + optional scope); husky pre-commit; **no Changesets**; branch names ≤3 hyphenated words; `dev` is the daily integration branch; explicit approval required for push/PR/tag.
- **Frontend:** SolidJS (not React) on every surface; shared component library `packages/ui` consumed via `@opencode/ui/*` subpaths; i18n via `app/src/runtime/i18n/*.json` (27 locales); TUI theming via `packages/theme` with semantic token roles (no raw hues).
- **Custom lint ("anti-slop") culture:** repo-authored ast-grep rules encode design intent (boundary parsing, inference preservation, Effect idioms, readability spacing) — 1,579 active warnings, 0 errors.

## Dependency Graph

### Manifest-declared workspace dependencies (verified in each package.json)

| Package | Declares dependency on |
|---------|------------------------|
| schema, util, theme, latex, patchmark | *(no internal deps — leaves)* |
| client | schema, protocol |
| protocol | schema |
| ai | schema, util |
| codemode | schema, util |
| core | schema, util, **ai**, **codemode**, **plugin**, **plugin-browser** |
| server | core, protocol, schema, simulation, util |
| sdk | client, core, plugin, schema, server, util |
| simulation | core, protocol, schema, util, ai, plugin |
| plugin | schema, client, util, ai, protocol, theme |
| tui | client, core, latex, merman, plugin, schema, simulation, theme, ui, util |
| cli | client, plugin, schema, server, tui, util |
| app | client, schema, gui-plugins, plugin, session-ui, ui, util |
| desktop | client, plugin, ui, app, gui-plugins, schema |
| session-ui | client, ui, util, patchmark, sdk (sparse) |
| gui-plugins | plugin, ui, session-ui, client, util, plugin-browser, schema |

### Import-statement edges (regex scan of all `src` trees for `"@opencode/<pkg>…"`, including subpath imports; counts = import occurrences)

```
 572  app -> ui              434  core -> ai            329  core -> schema
 266  core -> util           179  gui-plugins -> plugin 163  gui-plugins -> ui
 142  server -> core         138  app -> client         132  core -> plugin
 126  session-ui -> ui       107  plugin -> schema       88  protocol -> schema
  77  client -> schema       75  app -> plugin           73  cli -> client
  69  tui -> client           62  app -> session-ui      57  app -> util
  55  cli -> util             53  plugin -> client        53  server -> protocol
  46  tui -> plugin           37  cli -> schema           36  session-ui -> client
  32  sdk -> schema           25  gui-plugins -> util     24  desktop -> plugin
  24  tui -> util             24  gui-plugins -> session-ui  21 desktop -> app
  20  app -> schema           20  cli -> tui              19  session-ui -> util
  19  gui-plugins -> plugin-browser  19  sdk -> core       18  tui -> schema
  15  gui-plugins -> client   14  server -> util          12  ai -> schema
  11  console-app -> console-resource 11  stats-app -> stats-core  10 desktop -> client
   9  plugin-browser -> schema 8  stats-app -> ui          8  stats-core -> stats
   8  tui -> theme            7  client -> protocol       7  desktop -> ui
   6  tui -> ui               6  sdk -> client            5  cli -> plugin / cli -> ui / server -> schema / stats-server -> stats-core
   4  simulation -> core      4  console-app -> ui        4  plugin-browser -> plugin
   3  sdk -> util/server/plugin  3  app -> gui-plugins    3  simulation -> util
   3  core -> codemode        3  desktop -> gui-plugins   3  plugin -> util
```

Sparse edges (1–2 occurrences — may include non-import string references, treat as leads not proof): `protocol -> client` (2), `plugin -> ai` (2), `plugin -> protocol` (2), `simulation -> protocol/ai/plugin`, `session-ui -> server` (1), `session-ui -> core` (1), `session-ui -> sdk` (1), `tui -> core` (1), `cli -> protocol` (1), `cli -> server` (1), `merman -> plugin` (1), `latex -> plugin` (1), `app -> ai` (1), `core -> plugin-browser` (1), plus unmatched-name strings (`core -> example|storage|v2` — likely string literals, not real imports).

### Layering verdict (vs AGENTS.md yardstick — grep-verified)

- ✅ `packages/client/src`: **zero** imports of `@opencode/core|server|plugin` (grep: 0 matches). Client consumes only schema (77) + protocol (7).
- ✅ `packages/schema/src`: **zero** internal imports (grep: 0 matches) — clean leaf.
- ✅ `packages/core/src`: no imports of `server|protocol|sdk|client|tui` (edge scan shows core fan-out = ai/schema/util/plugin/codemode/plugin-browser only). Schema→Core direction respected.
- ✅ `packages/app/src`: no `core`/`server` edge at all — the web app stays on the client runtime (one `app -> ai` lead worth a lens look).
- ✅ server → {core, protocol, schema, simulation, util}: Protocol→Server respected.
- ⚠️ Leads for lens agents: `protocol -> client` (2), `session-ui -> server` (1), `session-ui -> core` (1), `tui -> core` (1) — each is a single low-count occurrence; verify whether real imports (potential layering drift) or string literals.

### High-connectivity nodes (fan-in, by import occurrences)

- `@opencode/ui` — ≈890 (app 572, gui-plugins 163, session-ui 126, desktop 7, tui 6, cli 5, stats-app 8, console-app 4)
- `@opencode/schema` — ≈750+ (core 329, plugin 107, protocol 88, client 77, cli 37, sdk 32, app 20, session-ui 19, tui 18, ai 12 …)
- `@opencode/plugin` — ≈465 (gui-plugins 179, core 132, app 75, tui 46, desktop 24, cli 5, plugin-browser 4)
- `@opencode/ai` — ≈438 (core 434, plugin 2, simulation 1, app 1)
- `@opencode/client` — ≈400 (app 138, cli 73, tui 69, plugin 53, session-ui 36, gui-plugins 15, desktop 10, sdk 6)
- `@opencode/core` — ≈167 from server (142), sdk (19), simulation (4), session-ui (1), tui (1)

Fan-out champions: `core` (imports ai 434 + schema 329 + util 266 + plugin 132 …), `app` (ui 572 + client 138 + plugin 75 + session-ui 62 …), `gui-plugins` (plugin 179 + ui 163 …).

### External dependencies (key, from catalog + manifests)

effect 4.0.1 (+ @effect/platform-node, @effect/opentelemetry, @effect/sql-sqlite-bun) · drizzle-orm 1.0.0-rc (SQLite) · hono 4.10 + hono-openapi · ai-sdk 6.x (@ai-sdk/* providers) · @modelcontextprotocol/client+core 2.3.1 · zod 4.1 · solid-js 1.9 + @opentui/* 0.7.0 (TUI) · vite 7/8 · tailwindcss 4 · Playwright 1.60 · tree-sitter (bash/powershell via web-tree-sitter) · @lydell/node-pty / bun-pty / @opencode-ai/pty · jose (JWT) · 19 patchedDependencies (notably @ai-sdk/* providers, vite, solid-js, electron-updater).

## Utility Inventory (shared helpers — location + purpose)

| Name / module | Location | Type | Description |
|---------------|----------|------|-------------|
| abort, retry, flock, teardown | packages/util/src/*.ts | modules | async cancellation, retry, file locking, cleanup |
| fs-util (FSUtil), path, glob, open | packages/util/src/{fs-util,path,glob,open}.ts | modules | filesystem helpers (used as `FSUtil` in core) |
| hash, base64, binary, bom, encode | packages/util/src/* | modules | encoding/hashing primitives |
| process, process-signal, cross-spawn-spawner | packages/util/src/* | modules | process spawning (cross-spawn + Effect ChildProcessSpawner bridge) |
| session-mention, session-turn, session-title-fallback | packages/util/src/* | modules | session text heuristics |
| no-timeout-fetch, npm, npm-config, qr, record, artifact, activity-calendar, duration | packages/util/src/* | modules | misc platform helpers |
| effect/ , observability/ , runtime/ | packages/util/src subdirs | dirs | Effect helpers (app-node, layer-node), observability, runtime detection |
| identifiers (Session.ID, Location.Ref, Agent.ID…) | packages/schema/src/{session-id,location,agent,…}.ts | schema | branded ID types used across all layers |
| event-log, event-manifest, durable-event-manifest | packages/schema/src/*.ts | schema | durable event vocabulary |
| Bus | packages/core/src/bus.ts | service | in-process event bus |
| LocationServiceMap / location-services / location-lifecycle | packages/core/src/location*.ts | services | per-location service registry (placement) |
| Slug | packages/core/src/util/slug.ts | helper | slug generation (used by Session facade) |
| SessionStore.ListInput, ListAnchor, ListCursor, ListFilter | packages/core/src/session/store.ts + schema/session | types | shared list/pagination vocabulary |
| ServerAuth (authorized, issueSession, verifySession, SESSION_TTL_SECONDS) | packages/server/src/auth.ts | service | basic auth + signed expiring session tokens |
| makeDefaultApi | packages/protocol/src/api.ts | factory | composes the HttpApi with location middleware |
| effect-drizzle-sqlite | packages/effect-drizzle-sqlite | package | Effect × Drizzle SQLite integration |

Project-wide pattern: cross-module vocabulary is centralized in `schema` and re-exported through package facades (namespace imports like `Session.Inbox`, `Project.ID`), rather than through a generic "utils" dumping ground.

## Risk Hotspots

### Large / complex files (lens priority)

- `packages/tui/src/routes/session/index.tsx` (3,820 ln) — the TUI session screen; largest hand-written file in repo.
- `packages/session-ui/src/tools/tool-renderer.tsx` (2,722 ln) — tool output rendering dispatch.
- `packages/client/src/effect/api/api.ts` (2,589 ln) + `solid/data.ts` (2,085 ln) — client runtime; large but partially shaped by codegen contracts (hand-written api layer, not in generated/).
- `packages/core/src/shell/scan.ts` (2,407 ln) — shell command risk scanning; security-relevant + complex.
- `packages/codemode/src/interpreter/interpreter.ts` (2,357 ln) — sandboxed JS interpreter core.
- `packages/plugin/src/gui/host-apis.ts` (2,050 ln), `packages/tui/src/component/prompt/index.tsx` (2,049 ln), `packages/tui/src/mini/*` transport/footer cluster (1,916/1,538/1,205/1,194 ln), `packages/tui/src/component/session-tabs.tsx` (1,801 ln), `packages/tui/src/app.tsx` (1,483 ln).
- `packages/ai/src/protocols/*` (1,713/1,481/1,410 ln) — provider wire-protocol implementations.
- `packages/core/src/{git.ts (1,495), session/compaction.ts (1,285), database/v1-migration.bun.ts (1,234), github-copilot/responses/openai-responses-language-model.ts (1,636)}`.
- `packages/httpapi-codegen/src/index.ts` (1,977 ln) — the codegen itself; errors here propagate to every client.
- 286 files >500 lines total; concentration in tui (mini/ + component/ + routes/session), session-ui, ui procedural avatar generators, and core.

### Lint-drift hotspots (from static analysis)

- `packages/app/src/new-session/` — pin-board.tsx (133), wordmark.tsx (103), brick-breaker.tsx (69), pin-quads.ts (36), pin-sound.ts (21): 362 warnings in one decorative feature directory (mostly spacing + safety-comment rules).
- `packages/app/src/runtime/persistence/drafts.ts` (50), `packages/desktop/script/profile-by-source.ts` (39), `packages/app/src/usage/` (dialog 34 + limits 20), `packages/ui/src/theme/*` (32).

### Security-sensitive areas

- `packages/server/src/auth.ts` + `test/auth.test.ts` — HTTP basic auth, signed expiring session tokens, password rotation revocation.
- `packages/server/src/pairing.ts`, `cors.ts`, `middleware/` — public HTTP surface hardening; `handlers/` (35 files) is the whole attack surface.
- `packages/core/src/shell/scan.ts` (2,407 ln) — shell command risk analysis feeding permission prompts.
- `packages/core/src/permission/` + `managed-policy.ts` + `permission` schemas — tool approval gates.
- `packages/core/src/{credential, oauth, account, github-copilot/, integration/}` — provider token storage & exchange (24-file copilot integration incl. responses LM).
- `packages/core/src/{file-access.ts, file-mutation.ts, filesystem/, snapshot.ts}` — path boundary enforcement for tool file operations.
- `packages/core/src/mcp/` + `websearch.ts` — external process/HTTP integrations.
- `packages/core/src/config/` (29 files) — parses user-controlled config incl. hooks; `config-hooks.ts`.
- `packages/app/e2e/utils/sse-transport.ts` + `app/src/runtime/server/*` — app-side server/event plumbing.

### Recently changed / churn (git log -15; tree otherwise clean)

- `packages/tui` — prompt history machine extraction + adoption (`2aaa7e7a70`, `89c5ef11f2`), new-orleans-saints theme (`9011dfb`, `16728ff`): the two newest features land in TUI prompt/theme code.
- `packages/core` — effort adapter rework (`9c0ad118`) aligning to v2.2.0 surfaces.
- `script/` + `.github/workflows/triage-*` — triage workflow refactor (`a56dd74`, `262bc12`, `16dd93c`).
- Regenerated clients + root effect dependency (`da010dfb`) — codegen drift touches client/protocol/schema together.
- v2.2.0 tag merges (`f1250d2`, `c057af1`) and integration merge (`0e2c896`) — recent large merges into `dev`.
- No uncommitted modifications; only untracked `.audit/` (this audit's own output).

### Test coverage gaps (measured, package level)

- **Thin vs size:** `packages/plugin` (86 src files / 4 tests), `packages/protocol` (40 / 4), `packages/util` (58 / 5), `packages/sdk` (15 / 11 — small but it's the public API), `packages/desktop` (154 src files; confirmed no test/ dir — only src/, script/, out/, resources), `packages/theme` (10 / 0 found), `packages/patchmark` (8 / 0 found), `packages/latex` (14 / 0 found), `packages/console/*` + `packages/stats/*` (none found), `packages/session-ui` + `packages/gui-plugins` (no test dirs; covered by story fixtures + Playwright component tests instead).
- **Well covered:** core (305), tui (190), ai (151), cli (53), server (38), codemode (34), app (127 colocated + full e2e/ Playwright suite).
- Counts are per-package `packages/<pkg>/test/` file counts; colocated `*.test.ts` (app 127, ui, merman) counted separately — exhaustively counting colocated tests outside app was out of scope.

## Static Analysis Summary

Full report in `.audit/static-analysis.md` (raw 24,180-line output in `.audit/static-analysis-raw.txt`). Headline: **`bun run check` passes (exit 0)** — 0 errors; 1,579 ast-grep anti-slop warnings across 306 files (top rules: require-readable-spacing 563, require-safety-comment-for-type-assertion 409, no-runtime-typeof 171); oxlint clean; sdk-docs 0 problems; turbo typecheck 35/35 tasks successful **but fully served from turbo cache** (content-valid, not freshly compiled this run). One advisory unused ast-grep-ignore in `packages/util/src/cross-spawn-spawner.ts`.

## Coverage Notes

- **Files examined:** deep-read ~12 files (entry points, facades, configs, test sample); programmatic scan of **all ~4,700 TS/TSX files** (src + test) for line counts and `@opencode/*` import edges; directory-level enumeration of all 40 workspace packages; manifests read for core, server, protocol, schema, sdk, client, tui, cli, app, root.
- **Sampling strategy:** full-repo metrics are machine-collected (not sampled). Qualitative reading focused on the 10 focus packages + representative test/config files. Subpath imports included in edge counts; counts of 1–2 may contain non-import string references and are labeled as leads.
- **Not examined (deferred):** file contents of `packages/gui-plugins` (858 files — directory level only), `packages/console/*`, `packages/stats/*`, `services/*` (directory level only); generated client trees (`client/src/*/generated/` — excluded by audit policy); `patches/` contents (19 patch files noted, not reviewed); `.github/workflows` contents beyond names; `sdks/`, `perf/`, `infra/`, `nix/`, `salesforce/`, `tasks/` (non-TS or auxiliary); test *content* quality (structure/location only); runtime test execution (out of scout scope).
- **Measurement caveats:** turbo typecheck results are cache replays; per-package line figures from the first inventory pass exclude blank lines (file counts exact); total-lines figure (≈635k) uses exact ReadAllLines across the 31 largest src trees + script/.
