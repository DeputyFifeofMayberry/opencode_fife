# Fifecode Rebrand — Implementation Plan

Complete rebrand of this fork from **opencode / OpenCode** to **fifecode / Fifecode**: command name,
graphics, UI copy, docs, and all in-repo identifiers.

Scale (measured on current `dev`): **70,691** case-insensitive `opencode` matches across **3,878**
tracked files; ~2,235 are non-docs, non-test source files. 41 workspace packages named `@opencode/*`,
193 distinct `OPENCODE_*` env vars, 21 `*.opencode.ai` hosts referenced.

## 0. Confirmed decisions

| Decision | Choice |
|---|---|
| Existing local data (sessions, auth, config) | **One-time migration**: copy `opencode` dirs → `fifecode` dirs on first run. Old dirs stay intact for rollback. |
| Old `opencode` command | **Keep alias shim**: forwards to `fifecode`, prints deprecation notice. Dropped later on request. |
| opencode.ai integrations | **Disable self-update** (updates come exclusively from `bun run update:local` / `install:local`). Share, console login, auth stay wired to opencode.ai. |

Derived policy:

- Display name is **Fifecode** (prose, titles, marketing); identifier is **fifecode**;
  env/constant prefix is **FIFECODE_**.
- Wire identifiers that external systems own stay unchanged (§2 allowlist).
- `CHANGELOG.md` and `.github/release/` are historical records of upstream releases — left
  unrenamed (allowlisted). New entries use the new name.

## 1. Naming contract

Every rename in this plan is an instance of this table. Bulk passes are scripted per row so review
is mechanical.

| Class | Old | New |
|---|---|---|
| Lowercase identifier | `opencode` | `fifecode` |
| Display name | `OpenCode` | `Fifecode` |
| Env / constant prefix | `OPENCODE_` | `FIFECODE_` |
| Package scope | `@opencode/*` | `@fifecode/*` |
| Command | `opencode`, `opencode2`, `opencode-node` | `fifecode`, `fifecode2`, `fifecode-node` |
| Config file | `opencode.json`, `opencode.jsonc` | `fifecode.json`, `fifecode.jsonc` |
| Project config dir | `.opencode/` | `.fifecode/` |
| XDG app name (`global.ts`) | `opencode` | `fifecode` (`~/.local/share/fifecode`, `~/.config/fifecode`, `~/.local/state/fifecode`, `~/.cache/fifecode`) |
| System config dirs | `/etc/opencode`, `%ProgramData%\opencode`, `/Library/Application Support/opencode` | `fifecode` equivalents |
| macOS MDM plist | `ai.opencode.managed.plist` | `ai.fifecode.managed.plist` |
| Protocol headers | `x-opencode-ticket`, `x-opencode-directory` | `x-fifecode-ticket`, `x-fifecode-directory` |
| ACP identity | agent name `opencode`; methods `opencode/child-session-updates`, `opencode/session/child_update`, `opencode/child-session`; marker `opencode/compaction`; config key `opencode.acp.additionalDirectories` | `fifecode` / `fifecode/...` equivalents |
| Deep-link protocol | `opencode://` | `fifecode://` |
| Desktop appId | `ai.opencode.desktop(.dev/.beta)` | `ai.fifecode.desktop(.dev/.beta)` |
| Linux install path / exe | `/opt/OpenCode/ai.opencode` | `/opt/Fifecode/ai.fifecode` |
| Bundled CLI resource | `opencode-cli(.exe/.version)` | `fifecode-cli(.exe/.version)` |
| Service ports (channel) | `0xC0DE` / `0xC0DF` / `0xC0E0` (latest, local, dev) | `0xF1FE` ("F1FE") / `0xF1FF` / `0xF200` — distinct from old, no clash with a still-running old server; existing Windows ≥0x8000 remap yields 0x71FE/0x71FF/0x7200 |
| Compile-time defines | `OPENCODE_VERSION`, `OPENCODE_CHANNEL`, `OPENCODE_ARTIFACT`, `OPENCODE_RELEASE_HIGHLIGHTS` | `FIFECODE_*` (declares in `packages/cli/src/version.ts`, defines in `packages/cli/script/build.ts`) |
| TUI theme names | `opencode`, `opencode2` (`packages/tui/src/theme/assets/{opencode,v2/opencode,v2/opencode2}.json`) | `fifecode`, `fifecode2`, with legacy-name alias in the theme parser |
| VS Code extension | name `opencode`, commands `opencode.*` | `fifecode`, `fifecode.*` |
| Update DO (update worker) | binding `OPENCODE`, class `OpenCodeDO` | `FIFECODE`, `FifecodeDO` |
| Local build archive dir | `~/.local/share/opencode-fife-builds` | `~/.local/share/fifecode-builds` |
| Docker image | `opencode-image.tar` | `fifecode-image.tar` |

## 2. Explicitly unchanged (allowlist)

These must **not** be bulk-renamed; they are identifiers owned by external systems. Record them in
`docs/rebrand-allowlist.md` and make the final sweep exempt them:

- `@opencode-ai/pty` and `@brendonovich/vite-plugin-opencode` — external npm packages. The
  `provider.ts` compat shim (`@opencode-ai/` → built-in scope) is extended instead: map both
  `@opencode-ai/*` and `@opencode/*` to `@fifecode/*`.
- Provider wire id `"opencode"` (`packages/schema/src/provider.ts:13`, the managed/Zen provider,
  `FIFECODE_ZEN_API_KEY` after rename). It matches the models.dev catalog; only **display** copy
  becomes "Fifecode". User configs naming `provider: "opencode"` keep working.
- `opencode.ai` domains (§6): kept for auth/console/share/models catalog/update-server code that
  stays wired (decision §0). New hosts are not invented; fork updates don't use them.
- Upstream repo references in historical records: `CHANGELOG.md`, `.github/release/`, issue links
  in comments (e.g. `anomalyco/opencode#51867`).
- The `$schema` URL served by opencode.ai for config files, if referenced.
- `sst-dev` publisher id and `sst/opencode` URL in `sdks/vscode/package.json` — upstream artifacts;
  strings may stay until the extension is actually published under a fork identity (open item §9).

## 3. Workstreams

Order matters; tests are updated **with** the code they pin, not in a separate sweep. Final sweep is
WS-I.

### WS-A — Groundwork

1. Worktree + branch `rebrand-fifecode` off current local `dev`.
2. Scripted transform tooling: a small Bun script applying ordered, per-pattern replacements
   (identifier, `OpenCode`, `OPENCODE_`, `@opencode/`, paths, `opencode.ai`-exempt). One commit per
   pattern class for reviewability: `refactor(rebrand): rename …` / `chore(rebrand): …`.
3. Write `docs/rebrand-allowlist.md` (content of §2) before the first bulk pass.

### WS-B — Visual brand assets

Inventory (all confirmed present):

- `packages/console/app/src/asset/brand/opencode-logo-*.{svg,png}`, `opencode-wordmark-*`
  (light/dark/square/simple), `preview-opencode-*` (17 files).
- Lander: `opencode-logo-{dark,light}.svg`, `opencode-wordmark-*`, `opencode-poster.png`,
  `opencode-comparison-poster.png`, `brand-assets-{dark,light}.svg`.
- Favicons/icons: `packages/app/public/` and `packages/console/app/public/` (`favicon*.{ico,svg}`,
  v3 variants, `apple-touch-icon*.png`, `web-app-manifest-{192,512}.png`), desktop icon sets
  (`packages/desktop/icons/` per channel), console email `logo.png`.
- Inline: `packages/app/src/providers/opencode-logo.tsx`, console `logo.svg`, `logo-ornate-*`,
  `zen-ornate-*`. Root `screenshot-uk.png` (replace after UI copy changes).

Approach:

1. **Functional pass**: produce new `fifecode`-branded SVGs by re-texting existing wordmark/logo
   SVGs and, where glyphs are outlined paths, generating replacement text in the same fonts the repo
   already ships; export the PNG/ICO size matrix from the new SVGs via a one-off script
   (`photon-node` is already a CLI dependency for image work).
2. Rename asset files `opencode-*` → `fifecode-*` and update every importer
   (`Head.astro`, manifests, electron-builder icon config, console layouts, email templates).
3. Ship these as **v1 placeholder-quality** assets; a final logo design is an open item (§9) and can
   land later without code changes.

### WS-C — CLI command, packaging, installers

1. `packages/cli/package.json`: `bin` → `fifecode` / `fifecode2`; rename `bin/opencode*.cjs`; inside
   them update `opencode-node` detection, `sourceCommand`, and platform package prefix
   `@opencode/cli-*` → `@fifecode/cli-*` (also `packages/cli/script/opencode-pty.ts`).
2. `packages/cli/script/build.ts`: output binary `fifecode(.exe)`; compile defines `FIFECODE_*`;
   `version.ts` declares/exports renamed constants (update all importers).
3. **Alias shim**:
   - npm path: keep a `bin/opencode.cjs` that prints a deprecation notice and spawns `fifecode`.
   - local-installer path: `script/install-local.ps1` + `local-builds.ps1` additionally write a
     two-line `opencode.cmd` next to `fifecode.exe` in the bin dir (forward + notice), so the
     installed daily driver keeps muscle memory working.
4. Curl installer `install`: `APP=fifecode`, URLs, help text.
5. `script/install-local.ps1`, `local-builds.ps1`, `local-{list,status,rollback,prune}.ps1`:
   binary name, archive dir `fifecode-builds`, `fifecode.exe.old-*` archive naming, env vars.
   Old archives in `opencode-fife-builds` are left in place; rollback to a pre-rebrand build still
   works from there.
6. `script/dev-live.ts`: `fifecode service status|get password`.
7. Self-update gate (decision §0): in `packages/cli/src/services/updater.ts`, disable the automatic
   update check unless `FIFECODE_UPSTREAM_UPDATES=1` is set; `fifecode upgrade` prints a pointer to
   `bun run update:local`. Keep brew/winget/npm method code intact (renamed identifiers) so upstream
   behavior is recoverable. Hide the TUI/desktop "Update Fifecode" prompt when the check is off.
8. Docker pack name; `packages/cli/script/pack.ts`; SDK verify fixtures (`fifecode-sdk-consumer`,
   `FifecodeDO`), update worker binding/class rename.

### WS-D — Core identifiers (highest-risk tier; do in this sub-order)

1. **Package scope**: all 41 `package.json` names `@opencode/*` → `@fifecode/*`; every import
   specifier; catalog/workspace refs. Then `bun install` to regenerate `bun.lock` (never hand-edit).
   Extend the `provider.ts` scope-compat shim to accept `@opencode-ai/*` **and** `@opencode/*` →
   `@fifecode/*` so old user plugin/provider configs still resolve.
2. **Env vars**: `OPENCODE_*` → `FIFECODE_*` (193 names, incl. `FIFECODE_CHANNEL`, `FIFECODE_CONFIG_DIR`,
   `FIFECODE_TEST_HOME`, desktop/WSL vars). No compat reads except where §5 says otherwise; scripts
   and tests are in-repo and rename together.
3. **Storage roots** + migration: `packages/util/src/global.ts` `app = "fifecode"`; implement the
   one-time migration (§5) and wire it into CLI startup and desktop main before anything reads
   `Global`.
4. **Config discovery** (`packages/core/src/config/discovery.ts`): `names = ["fifecode.json",
   "fifecode.jsonc"]`; project dir `.opencode` → `.fifecode` (`.claude`/`.agents` unchanged);
   system dirs; MDM plist id `ai.fifecode.managed`. Legacy fallback: if no `fifecode.json(c)`
   exists but a legacy `opencode.json(c)` is found, read it **read-only** with a one-time log line
   (never written back). Config key `opencode.acp.additionalDirectories` → `fifecode.acp.…` with
   legacy-key alias at merge time.
5. **Protocol/API**: rename `x-opencode-*` headers and any schema/protocol identifiers, then run
   `bun run generate` from repo root (never edit generated client files). Update ACP agent name and
   `opencode/*` method/marker strings in `packages/cli/src/acp/*`.
6. **Service config**: ports `0xF1FE/0xF1FF/0xF200` in `service-config.ts` (+ tests). Registration
   file name stays `service.json` (state dir rename already separates old/new). Do **not** migrate
   the old registration (§5) — it points at the old server/port.
7. **Themes**: rename theme assets and registration to `fifecode`/`fifecode2`; theme parser accepts
   legacy names `opencode`/`opencode2` as aliases (mapped, never written back) so existing user
   configs don't break.
8. **Provider display**: keep wire id `"opencode"`; override display name to "Fifecode" for the
   managed provider's group label in model dialogs/catalog UIs.
9. **Misc identity strings**: terminal title (`packages/tui/src/app.tsx`, `attention.ts`), OTLP /
   observability service names in `packages/util/src/observability`, sentry/app names, `"Usage:
   fifecode …"` error strings, help text in the command tree, splash strings.

### WS-E — Desktop app

1. `electron-builder.config.ts` + tests: appIds `ai.fifecode.desktop(.dev/.beta)`, executableName,
   `desktopName`, update feed path `.../desktop/fifecode/` (feed host stays opencode.ai per §2;
   irrelevant while self-update is off), `files` filters `fifecode-cli*`,
   Linux desktop entry (`Exec=/opt/Fifecode/ai.fifecode`, `Icon=ai.fifecode`,
   `StartupWMClass=ai.fifecode.desktop`), metainfo names, fpm mappings.
2. Keep the existing legacy-entry *pattern*: ship `fifecode.desktop` as canonical and retain an
   `opencode-desktop.desktop` hidden entry pointing at the new executable so pre-rebrand GNOME/KDE
   pins survive.
3. `environment.ts`: `setAsDefaultProtocolClient("fifecode")`; deep-link parsing `fifecode://` in
   `lifecycle/index.ts` + tests. Old OS registration for `opencode://` disappears when the old
   build is uninstalled (runbook §7).
4. Resources/icons per channel; `packages/desktop/src` `FIFECODE_DESKTOP_*` vars; WSL CLI build
   names (`fifecode-cli`); author/homepage/email fields (`hello@opencode.ai` stays — it's upstream's
   support address; open item §9).
5. `packages/app` (embedded web UI): title/head metadata, PWA manifest name, `opencode-logo.tsx`,
   i18n source strings, favicons (WS-B outputs).

### WS-F — Web, console, docs, marketing

1. `packages/app`, `packages/console/app`, `packages/stats`, `services/changelog`, `services/www`:
   display copy "Fifecode", lander text, email templates, legal/trust pages, i18n files
   (app ~40 locales, ui 40 locales, web 18 locales — mechanical replace of `OpenCode`, preserving
   all-casing conventions for new name).
2. Docs sites (`packages/web` ~21.8k hits, `services/www`): command → `fifecode`, config →
   `fifecode.json(c)`, env → `FIFECODE_*`, paths → `~/.config/fifecode`, project dirs →
   `.fifecode/`, theme names → `fifecode`. **Install instructions policy**: pages describing *this*
   product's install switch to the fork flow (`bun run update:local` / this repo); upstream registry
   instructions (`brew install opencode`, npm tarballs, AUR) are removed from the fork docs rather
   than shown as working, with a short "upstream" note where context is needed.
3. `services/update` worker: internal naming, DO class/binding (`FifecodeDO`), tests. Domain stays.
4. `.github/workflows` + `.github/release`: workflow names, artifact names, AUR/brew/tap identifiers
   (renamed for consistency; they don't run against real registries from this fork — release
   pipelines remain upstream's). Historical release notes: allowlisted, untouched.
5. Root docs: `README.md`, `CONTRIBUTING.md`, `SECURITY.md`; `docs/**` incl. `docs/local-development.md`
   and `docs/intent/*` (update the "update opencode" wording to `fifecode`); `specs/`, `tasks/`,
   `salesforce/` copy, `perf/` notes.
6. `.opencode/glossary` translator source of truth: flip do-not-translate entries `OpenCode` →
   `Fifecode` (after docs pass, so translation memory updates once).

### WS-G — SDKs & extensions

- `sdks/vscode`: `name`/`displayName`/`description` → fifecode, commands `opencode.*` → `fifecode.*`
  (titles "Open Fifecode"), terminal title, `images/icon.png` + button SVGs (WS-B), README.
- `packages/sdk`/`packages/client` jsdocs and generated files (regenerated, not hand-edited).

### WS-H — Repo self (harness config; atomic with WS-D.4)

1. Move `.opencode/` → `.fifecode/` (skills, `ecc/` adapter + plugin, `references/`, `glossary/`,
   `scripts/` — the local installer machinery `.opencode/scripts/lib/install/*` moves with it and
   its internal names update in WS-C).
2. Root `opencode.json` → `fifecode.json`.
3. Update every in-repo reference: all `AGENTS.md` files, `.opencode/ecc/INSTRUCTIONS.md`,
   workflows, scripts, docs that point at `.opencode/...` paths.
4. **Must land in the same changeset as WS-D.4** — the product only reads `.fifecode` after the
   discovery rename, and the repo only works with the new build after this move. Known transient:
   between landing and running the switchover install, the still-installed old build can't resolve
   ECC skills in this repo; accept the window (§7 step ordering minimizes it).

### WS-I — Tests, snapshots, final sweep

1. Name-pinning tests updated with their features: `electron-builder.config.test.ts` (appIds, feed,
   desktop entries, resources), `provider-opencode.test.ts` (env/imports; provider id assertions
   stay `"opencode"`), config/discovery tests, theme v2 tests, deep-link tests, updater tests,
   sdk verify fixtures, TUI snapshots (`.snap`) containing "OpenCode".
2. Final acceptance sweep:

   ```
   git grep -iI -l opencode -- ':!CHANGELOG.md' ':!.github/release'
   ```

   every remaining hit must be justified by `docs/rebrand-allowlist.md`. Target: **0 unexplained
   matches**. Add the grep (minus allowlist) as an advisory lint script so drift is caught.

## 4. Data migration design (one-time, copy-based)

- **Trigger**: CLI startup and desktop main, immediately after `Global` paths resolve, before any
  DB/session/auth access.
- **Rule**: if `~/.local/share/fifecode/.migrated` marker is absent AND legacy dirs exist → copy.
  Marker stores timestamp + source paths; never auto-recopies.
- **Copy**:
  - data: `~/.local/share/opencode` → `~/.local/share/fifecode` (sessions DB, `auth.json`,
    snapshots, tool output, shell dirs, repos cache).
  - config: `~/.config/opencode` → `~/.config/fifecode`, with file renames `opencode.json(c)` →
    `fifecode.json(c)` and `config.json` as-is.
- **Do NOT copy**:
  - state (`~/.local/state/opencode`) — contains the old service registration pointing at the old
    port/password; the new service must write its own fresh registration.
  - cache and tmp — re-derivable.
- **Legacy aliases in code** (so copied configs need no mutation): theme names, ACP config key,
  `@opencode-ai/*`/`@opencode/*` scope shim, read-only legacy `opencode.json(c)` discovery fallback.
- **Failure handling**: migration is idempotent; on partial copy, next start resumes (copy into
  temp dir, then atomic swap of the marker last). Never deletes or writes the legacy dirs.
- **Rollback**: legacy dirs are untouched; `local:rollback` to a pre-rebrand build finds everything
  where it was.

## 5. Repo docs touched by the decisions themselves

- `docs/local-development.md`, `docs/intent/local-update.md`: installed command name becomes
  `fifecode`; "update opencode" wording becomes "update fifecode"; self-update is disabled in the
  fork, so docs state updates come from `bun run update:local` only.
- `.opencode/ecc/README.md` and `verification.md` paths after the `.fifecode` move.

## 6. Sequencing

Single branch `rebrand-fifecode`, commits per pattern class. Rough order:

1. WS-A groundwork + allowlist doc.
2. WS-D.1 scope rename → `bun install` → fix imports until `bun run check` passes.
3. WS-C CLI/packaging + WS-D.2–9 (env, storage+migration, discovery, protocol+`bun run generate`,
   ports, themes, identity strings).
4. WS-E desktop, WS-F web/console/docs, WS-G sdks (parallelizable as separate read-only-scoped
   agents per area, **one writer per file area**; docs and desktop don't overlap).
5. WS-H repo self (same changeset as WS-D.4 if split commits, otherwise immediately after).
6. WS-B assets (any time after importers renamed; placeholder quality acceptable).
7. WS-I test reconciliation + final sweep.
8. §7 switchover on the daily-driver machine.

Delegation notes (per repo delegation rules): the parent owns the transform script, WS-D, and final
verification; broad docs/i18n passes (WS-F.1–2) and asset regeneration (WS-B) are good bounded
subagent work with explicit file scopes.

## 7. Switchover runbook (daily-driver machine)

1. All tiers landed and committed on `dev` (installer refuses a dirty tree).
2. `bun run check` + package-local tests for `packages/cli`, `packages/core`, `packages/tui`.
3. When sessions/terminal work are idle: `opencode service stop` (old CLI).
4. `bun run update:local` — builds `fifecode.exe`, smoke-tests it, archives the old install, writes
   the `opencode.cmd` alias shim. It does not restart services.
5. Start `fifecode` once → first-run migration copies data/config (§4); then `fifecode service
   status` (new port family 0xF1FE…) and `fifecode` TUI smoke: session history visible, provider
   auth works, theme resolves.
6. `bun run dev:live` against the new service (it now calls `fifecode service status`).
7. Open a normal new TUI; confirm terminal title, about/version strings, and ECC skill resolution
   from `.fifecode/`.
8. Verify `opencode --version` still works via the shim and prints the deprecation notice.
9. Rollback path if anything is wrong: `bun run local:rollback` (previous build) — legacy data dirs
   are untouched, so the old build resumes cleanly.

## 8. Risk register

| Risk | Mitigation |
|---|---|
| Daily-driver breakage mid-rebrand (harness reads `.opencode`, binary name changes) | WS-H atomicity + §7 ordering + `opencode` alias shim + copy-based migration |
| Missed hidden binding (compile defines, service discovery, ports, snapshot fixtures) | Builds fail loudly on define mismatch; WS-I sweep; electron-builder/discovery tests pin the rest |
| Windows file locks on `opencode.exe` during install | Runbook requires idle sessions; installer already archives via `.old-*` renames |
| User configs in *other* repos (`.opencode` dirs, `OPENCODE_*` env in personal scripts) | Read-only legacy discovery fallback + env: no compat (documented); command shim covers muscle memory; residual risk accepted |
| Provider/theme names breaking user config | Wire id kept; theme/key aliases in code; nothing written back to user files |
| Generated client drift | `bun run generate` after every protocol touch; no hand edits (repo rule) |
| Tests run from repo root | All verification from package directories (repo guard) |
| Accidental rename of allowlisted externals breaking upstream integrations | Allowlist written before first bulk pass; sweep enforces |
| i18n churn | Only the product name changes; keys stay stable; glossary flipped once, after docs |

## 9. Open items (decide during or after implementation)

1. Final logo/wordmark design (v1 placeholders ship first).
2. Whether to claim a `fifecode` domain eventually; until then opencode.ai hosts stay (§2).
3. VS Code extension publisher identity if it's ever published (currently upstream's `sst-dev`).
4. Support/contact email (`hello@opencode.ai` in desktop metadata) — replace with a fork address or
   drop.
5. When to drop the `opencode` alias shim (default: keep until you ask).

## 10. Effort estimate

- Scripted bulk passes + fix loop (WS-D.1–2, WS-F docs/i18n): 1–2 sessions.
- Core migration + shims + ports + protocol regen (WS-D.3–9, §4): 1 session.
- Desktop + web/console + sdks (WS-E/F/G): 1–2 sessions (delegable in parallel).
- Assets v1 (WS-B): 0.5 session.
- Repo self + tests + sweep (WS-H/I): 0.5 session.
- Switchover + verification (§7): 0.5 session, machine idle.

Total: roughly **4–6 focused sessions** on one branch, plus whatever the final logo design takes.
