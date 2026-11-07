# Task-specific repository guidance

## Style Guide

### General Principles

- One function unless composable or reusable.
- Validate unknown values once, at the owning boundary; pass typed values inward. No repeated `typeof value === "object"`/property-existence checks; no defensive revalidation of values already guaranteed by schema, constructor, or internal type.
- No preemptive single-use helpers; inline at the call site unless reused, hiding a genuinely complex boundary, or carrying a clear independent name that improves the caller.
- Speculative or vanishingly unlikely race/security complexity → explain concrete failure mode, likelihood, complexity cost; get user buy-in first. Never silently expand scope for theoretical robustness.
- Avoid `try`/`catch` where possible.
- No `any`.
- Prefer Bun APIs (`Bun.file()`).
- Prefer type inference; explicit annotations/interfaces only when necessary (exports, clarity).
- Prefer functional array methods (`flatMap`, `filter`, `map`) over for loops; type guards on `filter` preserve downstream inference.
- `src/config`: follow the existing self-export pattern at file top (`export * as ConfigAgent from "./agent.js"`).
- Effect generators: bind services to named variables before calling methods; no nested service yields (`yield* (yield* Foo.Service).bar()`).

Inline values used only once:

```ts
// Good
const journal = await Bun.file(path.join(dir, "journal.json")).json()

// Bad
const journalPath = path.join(dir, "journal.json")
const journal = await Bun.file(journalPath).json()
```

### Destructuring

Avoid unnecessary destructuring; dot notation preserves context.

```ts
// Good
obj.a
obj.b

// Bad
const { a, b } = obj
```

### Imports

- No aliased imports (`import { foo as bar } from "..."`, renamed imports like `resolve as pathResolve`).
- No type-position `import("...")`, e.g. `Schema.declare<import("@opencode/plugin/effect/plugin").Plugin["effect"]>`. Genuine, unavoidable name collision only: aliased type import (`import type { Plugin as PluginDefinition } from "..."`) as last resort — still strongly discouraged.
- No star imports (`import * as Foo`, `import type * as Foo`).
- Namespace-style value → import the module's exported namespace by name (`import { Project } from "@opencode/core/project"`), reference `Project.ID`.
- Dynamic imports for heavy modules needed only in selected code paths, especially startup-sensitive entrypoints. Destructure bindings near the top of the narrowest scope, reading like normal imports. No inline chains (`await import("./module").then((mod) => mod.value())`, `(await import("./module")).value()`). Branch-specific imports stay inside the branch needing them, preserving lazy loading.

### Variables

Prefer `const` over `let`; ternaries or early returns over reassignment.

```ts
// Good
const foo = condition ? 1 : 2

// Bad
let foo
if (condition) foo = 1
else foo = 2
```

### Control Flow

No `else`; prefer early returns.

```ts
// Good
function foo() {
  if (condition) return 1
  return 2
}

// Bad
function foo() {
  if (condition) return 1
  else return 2
}
```

### Complex Logic

Several validation branches or supporting details → main function reads as the happy path; supporting details move to small helpers below.

```ts
// Good
export function loadThing(input: unknown) {
  const config = requireConfig(input)
  const metadata = readMetadata(input)
  return createThing({ config, metadata })
}

function requireConfig(input: unknown) {
  ...
}
```

- Helpers stay close to the code they support, below the main export when that reads better; extract only real concepts (`requireConfig`, `readMetadata`).
- No `Effect` returns from helpers unless genuinely effectful; synchronous parsing, validation, option building stay synchronous.
- Untrusted JSON → Effect schema helpers (`Schema.UnknownFromJsonString`, `Schema.decodeUnknownOption`), not manual `JSON.parse` in `Effect.try`.
- Comments cover non-obvious constraints and surprising behavior only — not obvious assignments or control flow.

### Schema Definitions (Drizzle)

snake_case field names, so columns never redefine names as strings.

```ts
// Good
const table = sqliteTable("session", {
  id: text().primaryKey(),
  project_id: text().notNull(),
  created_at: integer().notNull(),
})

// Bad
const table = sqliteTable("session", {
  id: text("id").primaryKey(),
  projectID: text("project_id").notNull(),
  createdAt: integer("created_at").notNull(),
})
```

### Experimental API

- An experimental endpoint lives at `/api/experimental/<group>/...`, its OpenAPI identifier is `experimental.<group>.<method>`, and it lands in the SDK as `client.experimental.<group>.<method>`. Its description says "Experimental: may change without compatibility guarantees."
- `packages/protocol/test/experimental-identifiers.test.ts` enforces the path and identifier match in both directions; the SDK namespace follows from the path.
- An experimental field or parameter on a stable endpoint goes under an `experimental` key (`experimental.<name>`), the same way config does (`config.experimental.*`).
- New endpoints and new default behaviors start experimental.
- To graduate one, move the route out of `/api/experimental`, drop the `experimental.` prefix, and note it in `CHANGELOG.md`.
- Experimental HTTP routes change without aliases: rename or remove the route, then update the callers.
- A breaking move of shipped SDK or plugin API (including moving it under `experimental`) keeps the old path and type names as deprecated aliases of the new ones until the next minor, each marked `@deprecated` with the replacement and "Removed in the next minor". Generated SDK moves get them from the codegen (`compile(..., { aliases: true })` in `packages/client/script/generate.ts`), not by hand.
- Experimental plugin hooks are named `experimental.*` (`experimental.ws.handshake`).

