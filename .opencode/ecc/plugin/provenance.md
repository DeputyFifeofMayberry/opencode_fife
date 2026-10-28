# ECC native hook adapter

Source: [ECC PR #3676](https://github.com/affaan-m/ECC/pull/3676), commit `9f61fc050f10a47fab1a8abefabde44ad552f77d`. ECC's MIT license is retained at `../LICENSE`.

Adapted from `v2-hooks.ts`: native hook registration order, shell environment fields, package/language detection, console-log diagnostics, completion auditing, and compaction guidance. Adapted from `hooks-shared.ts`: profile levels, disabled-hook identifiers, root/version detection, and bounded diagnostics. These files are a fork-specific adaptation; they are not byte-identical upstream copies.

Local changes use the actual host types, explicit enablement, successful native write/edit/patch outputs, session/location isolation, awaited cleanup, native execution terminal events, bounded file reads, and optional Bun checks with executable arguments. Native formatting and permission decisions remain authoritative. The upstream installer, v1 wrapper, observer, permission auto-approval, telemetry, notification launcher, and custom tools were not imported.

Runtime dependencies come from OpenCode's provided plugin modules. Tests initialize that same host runtime. The local typecheck maps Effect to the existing workspace package; no npm installation or additional runtime dependency is required.

Enable with a single directory entry in `.opencode/opencode.jsonc`:

```json
{"package":"./ecc/plugin","options":{"enabled":true}}
```

Options: `enabled` (default false), `profile` (`minimal`, `standard`, `strict`), `disabledHooks` (identifier list), and optional `check` with `command` (Bun executable plus argument array), project-relative `cwd`, and `timeoutMs` (maximum 120000). Checks execute only with strict profile and explicit configuration. `ECC_HOOK_PROFILE` and `ECC_DISABLED_HOOKS` remain supported. Remove the entry or set `enabled` false to disable and clean up the adapter.

The default profile is `standard`. Each higher profile includes the lower profiles. The following identifiers can be placed in `disabledHooks` or the comma/space-separated `ECC_DISABLED_HOOKS` environment variable:

| Identifier | Minimum profile | Behavior |
| --- | --- | --- |
| `shell:env` | minimal | Supply command-local ECC/project environment values |
| `compaction:context` | minimal | Append bounded session file context |
| `stop:check-console-log` | minimal | Audit changed scripts after a native terminal event |
| `post:edit:console-warn` | standard | Add advisory debug-output diagnostics after a successful edit |
| `pre:bash:git-push-reminder` | strict | Attach a review/authorization reminder to the settled shell result |
| `pre:bash:tmux-reminder` | strict | Suggest the native background option for long commands |
| `post:edit:typecheck` | strict | Run the explicitly configured Bun check; inactive without `check` |

Change tracking and lifecycle cleanup continue when advisory hooks are disabled. The two historical `pre:bash` identifiers apply to the native shell tool on Windows as well; they do not invoke Bash or change permissions.
