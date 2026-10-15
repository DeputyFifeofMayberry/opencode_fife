import { expect } from "bun:test"
import { Session } from "@opencode/schema/session"
import { Effect, Schedule, Schema } from "effect"
import { it } from "../../core/test/lib/effect"
import { ServerFetch } from "../src/fetch"

const SessionResponse = Schema.Struct({ data: Schema.toEncoded(Session.Info) })
const CatalogResponse = Schema.Struct({
  data: Schema.Array(Schema.Struct({ id: Schema.String, name: Schema.String })),
})

it.live("session.switchAgent resolves display names to agent ids", () =>
  Effect.gen(function* () {
    const handler = yield* ServerFetch.make({
      app: { version: "test" },
      database: { path: ":memory:" },
      fs: { filewatcher: false },
      models: { fetch: false },
    })
    const request = (path: string, method: string, body?: unknown) =>
      Effect.promise(async () => {
        return handler(
          new Request(`http://opencode.local${path}`, {
            method,
            headers: { "content-type": "application/json" },
            body: body === undefined ? undefined : JSON.stringify(body),
          }),
        )
      })
    const json = (response: Response) => Effect.promise(() => response.json())

    const created = Schema.decodeUnknownSync(SessionResponse)(
      yield* Effect.flatMap(request("/api/session", "POST", {}), json),
    )
    const sessionID = created.data.id

    // Internal plugins register display names ("Build"/"Plan") over lowercase
    // ids, but plugin activation is asynchronous — wait for the catalog.
    const catalog = yield* Effect.flatMap(request("/api/agent", "GET"), json).pipe(
      Effect.flatMap(Schema.decodeUnknownEffect(CatalogResponse)),
      Effect.filterOrFail((body) => body.data.some((agent) => agent.name !== agent.id)),
      Effect.retry({ times: 100, schedule: Schedule.spaced("10 millis") }),
    )
    const named = catalog.data.find((agent) => agent.name !== agent.id)!

    // Switching by display name stores the resolvable id.
    const switchedByName = yield* request(`/api/session/${sessionID}/agent`, "POST", { agent: named.name })
    expect(switchedByName.status).toBe(204)
    const byName = Schema.decodeUnknownSync(SessionResponse)(
      yield* Effect.flatMap(request(`/api/session/${sessionID}`, "GET"), json),
    )
    expect(byName.data.agent).toBe(named.id)

    // Switching by exact id passes through.
    const switchedByID = yield* request(`/api/session/${sessionID}/agent`, "POST", { agent: named.id })
    expect(switchedByID.status).toBe(204)
    const byID = Schema.decodeUnknownSync(SessionResponse)(
      yield* Effect.flatMap(request(`/api/session/${sessionID}`, "GET"), json),
    )
    expect(byID.data.agent).toBe(named.id)

    // Unknown agents are rejected at the boundary instead of poisoning the session.
    const missing = yield* request(`/api/session/${sessionID}/agent`, "POST", { agent: "not-an-agent" })
    expect(missing.status).toBe(404)
    const unchanged = Schema.decodeUnknownSync(SessionResponse)(
      yield* Effect.flatMap(request(`/api/session/${sessionID}`, "GET"), json),
    )
    expect(unchanged.data.agent).toBe(named.id)
  }).pipe(Effect.scoped),
)
