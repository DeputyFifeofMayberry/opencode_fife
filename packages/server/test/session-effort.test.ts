import { expect } from "bun:test"
import { Effect } from "effect"
import fs from "node:fs/promises"
import path from "node:path"
import { tmpdir } from "../../core/test/fixture/tmpdir"
import { it } from "../../core/test/lib/effect"
import { ServerFetch } from "../src/fetch"

it.live("reports effort policy for the session location and handles missing sessions", () =>
  Effect.gen(function* () {
    const tmp = yield* Effect.acquireDisposable(Effect.promise(() => tmpdir("opencode-effort-status-")))
    const global = path.join(tmp.path, "global")
    const project = path.join(tmp.path, "project")
    yield* Effect.promise(async () => {
      await fs.mkdir(global, { recursive: true })
      await fs.mkdir(path.join(project, ".opencode"), { recursive: true })
      await fs.writeFile(path.join(global, "opencode.json"), JSON.stringify({ effort_policy: { mode: "adaptive", clean_passes: 3 } }))
      await fs.writeFile(path.join(project, ".opencode", "opencode.jsonc"), JSON.stringify({ effort_policy: { verification_commands: ["bun run check"] } }))
    })
    const handler = yield* ServerFetch.make({ database: { path: ":memory:" }, config: { directory: global }, models: { fetch: false }, fs: { filewatcher: false } })
    const created = yield* Effect.promise(() => handler(new Request("http://opencode.local/api/session", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ location: { directory: project } }),
    })))
    expect(created.status).toBe(200)
    const payload = (yield* Effect.promise(() => created.json())) as { data: { id: string } }
    const response = yield* Effect.promise(() => handler(new Request(`http://opencode.local/api/session/${payload.data.id}/effort`)))
    expect(response.status).toBe(200)
    expect(yield* Effect.promise(() => response.json())).toMatchObject({ data: { mode: "adaptive", support: "unknown", initialized: false, verificationCommands: ["bun run check"], cleanPassesNeeded: 3 } })
    const missing = yield* Effect.promise(() => handler(new Request("http://opencode.local/api/session/ses_missing/effort")))
    expect(missing.status).toBe(404)
  }).pipe(Effect.scoped),
)
