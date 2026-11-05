# Lens 4: Security & Performance — Findings

**Scope:** Full-repo structural health audit (cross-cutting). Priority areas per codemap: server auth/pairing/CORS/middleware, core shell/scan, file-access/file-mutation, credential/session handling, plugin-browser, http-recorder, AI protocols, Drizzle/SQLite query patterns, session history loading, event feed.

**Cross-reference:** `bun run check` passes (0 errors); static-analysis findings are style/structural only and do not overlap with the security/perf issues below.

---

## Finding: Stored XSS in the public share page markdown renderer (unsanitized marked → innerHTML)
- **Location:** `packages/web/src/components/share/content-markdown.tsx:9-29, 40, 53` (consumed via `packages/web/src/components/share/part.tsx:136, 160, 655` and `packages/web/src/components/Share.tsx`)
- **Evidence:**
  ```ts
  const markedWithShiki = marked.use(
    {
      renderer: {
        link({ href, title, text }) {
          const titleAttr = title ? ` title="${title}"` : ""
          return `<a href="${href}"${titleAttr} target="_blank" rel="noopener noreferrer">${text}</a>`
        },
      },
    },
    ...
  )
  ...
  return markedWithShiki.parse(markdown)
  ...
  <div data-slot="markdown" ref={overflow.ref} innerHTML={html()} />
  ```
  Three defects compound: (1) `marked` output is injected via `innerHTML` with **no DOMPurify/sanitizer anywhere in packages/web** (grep confirms; no CSP header either), and `marked` passes raw HTML through by default; (2) the custom `link` renderer interpolates `href` and `title` into HTML without attribute escaping, so a `"` in `title` (or a crafted `href`) breaks out of the attribute into arbitrary attribute/event-handler injection; (3) `javascript:`/`data:` link schemes are not filtered. Contrast with the in-app pipeline, which does it correctly: `packages/session-ui/src/components/markdown-cache.tsx:76-79` runs every block through `DOMPurify.sanitize` before `markdown.tsx:1042` sets `source.innerHTML = block.html`.
- **Impact:** `Share.tsx` renders shared session messages fetched from a remote session API (`props.api`, `MessageV2` parts). Session content is attacker-influenceable at one remove — model/tool output echoing malicious repo files, web-search results, or tool output. A user shares such a session; any viewer of the public share page executes the injected script in the share-site origin (session-wide stored XSS on a public website). Even without script tags, attribute breakout via `title` yields event handlers; `javascript:` links yield click-based execution.
- **Severity suggestion:** P1
- **Category:** security (XSS, trust-boundary: external session content → public web origin)

---

## Finding: Symlinked paths bypass the external-directory approval boundary (lexical-only containment)
- **Location:** `packages/core/src/file-access.ts:95-106` (with `packages/util/src/fs-util.ts:289-292`)
- **Evidence:**
  ```ts
  const absolute = AbsolutePath.make(resolvePath(location.directory, input.path))   // path.resolve — lexical only
  const internal =
    FSUtil.contains(location.directory, absolute) ||                                // path.relative comparison — lexical only
    (worktree !== path.parse(worktree).root && FSUtil.contains(worktree, absolute))
  ```
  `FSUtil.contains` is a pure `path.relative` prefix check. No `realpath` canonicalization occurs on the target before the internal/external decision (`FSUtil.resolve`, which does call `realpathSync`, exists at `fs-util.ts:262-270` but is not used in this path). `Environment.files` explicitly follows final symlinks for content reads (`packages/core/src/environment/files.ts:33`: "Content operations (`read`, `list`) follow final symlinks"), and the tool plugins (read/grep/glob/edit) resolve through `FileAccess.resolve`.
- **Impact:** Git preserves symlinks, so an untrusted repository can ship `link → ~/.ssh` (or any path outside the workspace). A Read/Grep/Glob tool call on `link/id_rsa` resolves lexically *inside* the workspace, so the `external_directory` permission assert (`file-access.ts:125-142`) never fires, and the outside file's contents enter the LLM context under the workspace-internal approval path. The same applies to the write/edit path (`tool/plugin/edit.ts:327` locks the lexical path). This defeats the specific approval gate designed to make out-of-workspace access visible to the user, and the source of the symlink can be repo content the user didn't author.
- **Severity suggestion:** P2
- **Category:** security (sandbox boundary bypass; untrusted repo content → out-of-workspace file access without the intended prompt)

---

## Finding: Session list queries sort/filter on unindexed columns (full scan per list)
- **Location:** `packages/core/src/session/store.ts:145-187` with schema `packages/core/src/session/sql.ts:74-80`
- **Evidence:** `SessionStore.list` filters on `directory` / `workspace_id` / `project_id` and always orders by `(time_updated, id)` (anchor pagination). The table declares indexes only on `project_id`, `workspace_id`, `parent_id`, and `time_suspended` — no index on `directory` and none on `time_updated`. The common per-project/directory listing therefore full-scans and sorts on every refresh (session list is a frequently polled UI surface; `time_updated` is also deliberately pinned on claim writes so ordering only moves on real changes, which keeps the hot path on this sort).
- **Impact:** O(n log n) sort of all sessions per list call as the sessions table grows (heavy daily-use databases reach tens of thousands of rows). Local SQLite keeps this sub-100ms today, but it is the server's most frequent query path and degrades linearly with history.
- **Severity suggestion:** P3
- **Category:** performance (missing index on hot server request path)

---

## Questions (theoretical / below finding threshold)

1. **Non-timing-safe password comparison** — `packages/server/src/auth.ts:36` compares the Basic-auth password with `===` (only the session-token path uses `timingSafeEqual`). Exploitation requires high-confidence byte-by-byte timing against a 32-byte random password over loopback — theoretical, but `timingSafeEqual` is one line and would match the rest of the module's discipline.
2. **CORS trusts all localhost origins** — `packages/server/src/cors.ts:13-14` allows any `http://localhost:*` / `http://127.0.0.1:*` origin to read API responses. A malicious local web server (e.g., a compromised npm dev server) could query the API if it also obtains the password (or against an embedder served unauthenticated). Standard dev-tool tradeoff; worth a docs note rather than a change.
3. **Unauthenticated embedded routes contract** — `createEmbeddedRoutes` (`packages/server/src/routes.ts:104-110`) and `ServerFetch.make` (`fetch.ts:32-34`) serve without auth when no password is passed, with the documented expectation that embedders front access control themselves. The CLI/desktop/server-process paths all provision a random 32-byte password (`packages/cli/src/server-process.ts:91-97`), but the SDK embedder path was not exhaustively traced — worth a follow-up confirm.
4. **LIKE wildcard injection in session search** — `store.ts:155` interpolates user `search` into `like(title, '%…%')` without escaping `%`/`_`. Parameterized (no SQL injection); only effect is wildcard surprises in local search. Cosmetic.
5. **codemode interpreter sandbox** — `packages/codemode/src/interpreter/interpreter.ts` (2,357 lines) executes agent-authored JS. A full sandbox-escape audit was out of scope; note that the sandbox's failure mode equals the agent's already-granted shell access, so escape impact is bounded by existing permissions.

## Checked and sound (no findings)

- **Auth surface:** loopback default binding (`127.0.0.1`, `server/process.ts:56`); random password always provisioned; session tokens HMAC-signed, derived from the password so rotation revokes them, timing-safe verify, 30-day TTL; pairing codes 128-bit, 5-min TTL, single-use; cookie auth correctly restricted to same-origin when `Origin` present; Basic challenge suppressed for browser fetch (commented rationale).
- **PTY/MCP WebSocket ticket flow:** single-use tickets, 60s TTL, scoped to ptyID/client+directory+workspace, mint-gating via required custom header + origin policy; no-ticket requests fall through to normal auth middleware — no bypass.
- **plugin-browser proxy:** desktop-only leaf; random per-instance Basic credentials, `timingSafeEqual`, header/request timeouts, socket cleanup.
- **http-recorder:** consistent redaction pipeline (Bearer tokens, secret findings) across HTTP and WebSocket recording/replay.
- **Secrets handling:** service config and registration files written `0o600`; passwords kept out of tool-inherited env in stdio mode (`server-process.ts:87-90`); foreground password echo is intentional UX; AI provider errors don't embed key material.
- **XSS elsewhere:** session-ui/app markdown pipelines sanitize via DOMPurify before any `innerHTML`; shiki-based renderers escape; the one unsanitized pipeline is Finding 1.
- **Performance elsewhere:** SSE feed uses bounded queues (4,096) with overflow failure isolation; message endpoint defaults to 50 with cursor pagination and indexed `(session_id, seq)` lookups; session history hydration is batched (`SessionBlob.hydrate`) rather than per-row; config hooks capped at 1 MiB output with 60s timeout.
- **Shell scan fail-safe:** unparseable commands return `{ kind: "opaque" }` and the consumer fails closed (`shell/parse.ts:219-220`) — under-analysis cannot silently auto-approve.
