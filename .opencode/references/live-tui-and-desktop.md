# Task-specific repository guidance

## Live TUI Testing

- `bun run dev:live` from a development worktree tests its TUI against the currently elected `opencode` background server and live sessions; pass a directory when needed (`bun run dev:live /path/to/project`).
- Script discovers server via `opencode service status`, injects its private local credential (`opencode service get password`), uses the `dev` TUI storage channel so tabs and client-local state match the installed client.
- Prefer `dev:live` over plain `bun run dev`. Implicit managed-service connection may replace the live server when worktree client version differs; explicit `--server` warns and continues without replacing it.
- **Concurrent testing:** Worktree isolation does not isolate background servers, ports, storage, or live sessions — `dev:live` targets the currently elected server and the shared `dev` TUI storage channel from any worktree. Coordinate concurrent tests; use separate instances or storage to prevent interference.


## Live Desktop Diagnostics

- When attaching Playwright to a running desktop app, use `chromium.connectOverCDP(endpoint, { noDefaults: true })`.
- Without `noDefaults`, Playwright applies light-mode media emulation during attachment. An app following the system theme then flashes light until the connection closes. The option also preserves the existing focus and other media preferences.
- Do not emulate a color scheme or reduced-motion preference on the user's live window unless explicitly requested; use an isolated test context for those scenarios.


## TUI Stories

- TUI story request → fixture-driven story under `packages/tui/src/feature-plugins/system/storybook`, registered in `index.tsx`.
- Render the real production component, not a visual copy; keep submissions and side effects local so the story is safe to explore repeatedly.
- Expose state dimensions via story keybindings, listed in `StoryFooter`; include a reset command when combinations can leave the fixture confusing.
- Run one story: `OPENCODE_STORY=<story-id> bun run dev:live` from the development worktree; exercise narrow + wide terminal sizes when layout matters.


## TUI Theme Tokens

- Choose tokens by semantic role, never current color: no raw `theme.hue`, no borrowing unrelated semantic tokens for a preferred appearance.
- `text.feedback`/`background.feedback`: outcome/status feedback only (errors, warnings, success, informational). `formfield` states: form-control text, ordinals, selection markers. `action` states: actions.
- Missing semantic role → extend theme schema, defaults, resolution, types before component use; never repurpose the nearest-looking token.
- Changing the public token surface → verify built-in light + dark defaults and the custom-theme fallback path, plus the affected component.

