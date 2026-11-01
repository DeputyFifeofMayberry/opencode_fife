import { describe, expect, test } from "bun:test"
import { Effect, Layer } from "effect"
import { Config } from "@opencode/core/config"
import { Database } from "@opencode/core/database/database"
import { EffortEvidence } from "@opencode/core/effort/evidence"
import { EffortStore } from "@opencode/core/effort/store"
import { ProjectTable } from "@opencode/core/project/sql"
import { SessionTable } from "@opencode/core/session/sql"
import { ConfigEffort } from "@opencode/schema/config/effort"
import { Document, Info } from "@opencode/schema/config"
import { Project } from "@opencode/schema/project"
import { AbsolutePath } from "@opencode/schema/schema"
import { SessionID } from "@opencode/schema/session-id"
import { Global } from "@opencode/util/global"
import { testEffect } from "../lib/effect"

const DatabaseLayer = Database.layer({ path: ":memory:" }).pipe(
  Layer.provide(Layer.succeed(Global.Service, Global.make({ data: process.cwd() }))),
)

const it = testEffect(
  Layer.mergeAll(
    DatabaseLayer,
    EffortStore.layer.pipe(Layer.provide(DatabaseLayer)),
    Config.testLayer([
      new Document({
        type: "document",
        info: new Info({
          effort_policy: new ConfigEffort.Info({
            verification_commands: ["pnpm typecheck"],
            mutating_tools: ["write"],
          }),
        }),
      }),
    ]),
  ),
)

const worktree = AbsolutePath.make("/work")

const seed = Effect.fn(function* (sessionID: SessionID) {
  const database = yield* Database.Service
  yield* database.db.insert(ProjectTable).values({ id: Project.ID.global, worktree, sandboxes: [] }).run()
  yield* database.db
    .insert(SessionTable)
    .values({ id: sessionID, project_id: Project.ID.global, directory: worktree, slug: "effort", version: "test" })
  const efforts = yield* EffortStore.Service
  yield* efforts.set({ sessionID, baseLevel: "standard", revision: 0 })
})

const settle = (sessionID: SessionID, tool: string, command: string | undefined, exit: number | undefined) =>
  Effect.gen(function* () {
    const efforts = yield* EffortStore.Service
    const config = yield* Config.Service
    const database = yield* Database.Service
    yield* EffortEvidence.observe(
      { db: database.db, efforts, config },
      sessionID,
      {
        tool,
        input: command === undefined ? {} : { command },
        metadata: exit === undefined ? {} : { exit },
      },
    )
  })

describe("EffortEvidence", () => {
  it.effect("opens an escalation on a failing verifier", () => {
    return Effect.gen(function* () {
      const efforts = yield* EffortStore.Service
      const id = SessionID.make("ses_evidence_fail")
      yield* seed(id)
      yield* settle(id, "shell", "pnpm typecheck", 1)
      const row = yield* efforts.get(id)
      expect(row?.openFailure?.verifier).toBe("pnpm typecheck")
      expect(row?.revision).toBe(0)
      // Static observations never grow adaptive state.
      expect(row?.level).toBeUndefined()
      expect(row?.cleanPasses).toBe(0)
    })
  })

  it.effect("clears the same verifier on a later pass", () => {
    return Effect.gen(function* () {
      const efforts = yield* EffortStore.Service
      const id = SessionID.make("ses_evidence_clear")
      yield* seed(id)
      yield* settle(id, "shell", "pnpm typecheck", 1)
      yield* settle(id, "shell", "pnpm typecheck", 0)
      expect((yield* efforts.get(id))?.openFailure).toBeUndefined()
    })
  })

  it.effect("ignores unconfigured commands, non-numeric exits, and other tools", () => {
    return Effect.gen(function* () {
      const efforts = yield* EffortStore.Service
      const id = SessionID.make("ses_evidence_noise")
      yield* seed(id)
      // A compound command cannot attribute its exit to a single segment.
      yield* settle(id, "shell", "pnpm lint && pnpm typecheck", 1)
      expect((yield* efforts.get(id))?.openFailure).toBeUndefined()
      // Fully unconfigured commands, missing exits, and non-shell tools change nothing.
      yield* settle(id, "shell", "pnpm lint && exit 0", 1)
      yield* settle(id, "shell", "pnpm typecheck", undefined)
      yield* settle(id, "write", undefined, 0)
      expect((yield* efforts.get(id))?.openFailure).toBeUndefined()
    })
  })

  it.effect("classifies decorated verifier invocations", () => {
    return Effect.gen(function* () {
      const efforts = yield* EffortStore.Service
      const id = SessionID.make("ses_evidence_decorated")
      yield* seed(id)
      // Pipelines and redirections do not provide a trustworthy verifier exit.
      yield* settle(id, "shell", "pnpm typecheck 2>&1 | Select-String -Pattern error", 1)
      yield* settle(id, "shell", "pnpm typecheck > out.log 2>&1", 1)
      expect((yield* efforts.get(id))?.openFailure).toBeUndefined()
      // Appended flags classify at the token boundary; a longer word does not.
      yield* settle(id, "shell", "pnpm typecheck --pretty=false", 1)
      expect((yield* efforts.get(id))?.openFailure?.verifier).toBe("pnpm typecheck")
      yield* efforts.setOpenFailure(id, undefined)
      yield* settle(id, "shell", "pnpm typecheck-strict", 1)
      expect((yield* efforts.get(id))?.openFailure).toBeUndefined()
    })
  })

  it.effect("never clears or opens a failure from an ambiguous command", () => {
    return Effect.gen(function* () {
      const efforts = yield* EffortStore.Service
      const id = SessionID.make("ses_evidence_ambiguous")
      yield* seed(id)
      for (const command of ["pnpm typecheck && fail", "fail && pnpm typecheck", "pnpm typecheck || exit 0", "pnpm typecheck | filter", "pnpm typecheck; exit 0", "pnpm typecheck > out", "pnpm typecheck $(echo bad)", "pnpm typecheck\nexit 0"]) {
        yield* settle(id, "shell", command, 1)
        expect((yield* efforts.get(id))?.openFailure).toBeUndefined()
      }
      yield* settle(id, "shell", "pnpm typecheck", 1)
      yield* settle(id, "shell", "pnpm typecheck || exit 0", 0)
      expect((yield* efforts.get(id))?.openFailure?.verifier).toBe("pnpm typecheck")
      yield* settle(id, "other", "pnpm typecheck", 0)
      expect((yield* efforts.get(id))?.openFailure?.verifier).toBe("pnpm typecheck")
    })
  })

  it.effect("advances the revision for mutating tools and guards the pass", () => {
    return Effect.gen(function* () {
      const efforts = yield* EffortStore.Service
      const id = SessionID.make("ses_evidence_revision")
      yield* seed(id)
      yield* settle(id, "shell", "pnpm typecheck", 1)
      yield* settle(id, "write", undefined, 0)
      yield* settle(id, "echo", undefined, 0)
      const row = yield* efforts.get(id)
      expect(row?.revision).toBe(1)
      expect(row?.openFailure).toBeDefined()

      // A pass at the current revision clears; the core's stale-pass rules are covered upstream.
      yield* settle(id, "shell", "pnpm typecheck", 0)
      expect((yield* efforts.get(id))?.openFailure).toBeUndefined()
    })
  })
})

describe("EffortEvidence adaptive", () => {
  const adaptiveIt = testEffect(
    Layer.mergeAll(
      DatabaseLayer,
      EffortStore.layer.pipe(Layer.provide(DatabaseLayer)),
      Config.testLayer([
        new Document({
          type: "document",
          info: new Info({
            effort_policy: new ConfigEffort.Info({
              verification_commands: ["pnpm typecheck"],
              mutating_tools: ["write"],
              mode: "adaptive",
              clean_passes: 2,
            }),
          }),
        }),
      ]),
    ),
  )

  adaptiveIt.effect("raises the durable level on failure and decays it after clean passes", () => {
    return Effect.gen(function* () {
      const efforts = yield* EffortStore.Service
      const id = SessionID.make("ses_evidence_adaptive")
      yield* seed(id)
      yield* efforts.setLevel(id, "standard", 0)

      yield* settle(id, "shell", "pnpm typecheck", 1)
      let row = yield* efforts.get(id)
      expect(row?.level).toBe("deep")
      expect(row?.openFailure).toBeDefined()
      expect(row?.cleanPasses).toBe(0)

      // The clearing pass counts as the first clean pass; the raise survives it.
      yield* settle(id, "shell", "pnpm typecheck", 0)
      row = yield* efforts.get(id)
      expect(row?.openFailure).toBeUndefined()
      expect(row?.level).toBe("deep")
      expect(row?.cleanPasses).toBe(1)

      // The second clean pass reaches the configured threshold and steps down.
      yield* settle(id, "shell", "pnpm typecheck", 0)
      row = yield* efforts.get(id)
      expect(row?.level).toBe("standard")
      expect(row?.cleanPasses).toBe(0)
    })
  })
})


test.skipIf(process.platform !== "win32")("PowerShell command status is not attributed across a compound command", () => {
  const direct = Bun.spawnSync(["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", "cmd /c exit 7"])
  const masked = Bun.spawnSync(["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", "cmd /c exit 7; Write-Output ok"])
  expect(direct.exitCode).not.toBe(0)
  expect(masked.exitCode).toBe(0)
  expect(EffortEvidence.matchVerifier("cmd /c exit 7", ["cmd /c exit 7"])).toBe("cmd /c exit 7")
  expect(EffortEvidence.matchVerifier("cmd /c exit 7; Write-Output ok", ["cmd /c exit 7"])).toBeUndefined()
})
