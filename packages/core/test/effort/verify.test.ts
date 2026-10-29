import { describe, expect } from "bun:test"
import type { ChildProcess } from "effect/process"
import { Effect, Layer } from "effect"
import { Config } from "@opencode/core/config"
import { Database } from "@opencode/core/database/database"
import { EffortStore } from "@opencode/core/effort/store"
import { EffortVerification } from "@opencode/core/effort/verify"
import { ProjectTable } from "@opencode/core/project/sql"
import { SessionTable } from "@opencode/core/session/sql"
import { AppProcessError, type RunResult } from "@opencode/util/process"
import { Global } from "@opencode/util/global"
import { ConfigEffort } from "@opencode/schema/config/effort"
import { Document, Info } from "@opencode/schema/config"
import { Project } from "@opencode/schema/project"
import { AbsolutePath } from "@opencode/schema/schema"
import { SessionID } from "@opencode/schema/session-id"
import { testEffect } from "../lib/effect"

const DatabaseLayer = Database.layer({ path: ":memory:" }).pipe(
  Layer.provide(Layer.succeed(Global.Service, Global.make({ data: process.cwd() }))),
)

const configLayer = (policy: ConfigEffort.Info) =>
  Config.testLayer([new Document({ type: "document", info: new Info({ effort_policy: policy }) })])

const adaptiveLayer = testEffect(
  Layer.mergeAll(
    DatabaseLayer,
    EffortStore.layer.pipe(Layer.provide(DatabaseLayer)),
    configLayer(new ConfigEffort.Info({ verification_commands: ["bun typecheck"], mode: "adaptive", clean_passes: 2 })),
  ),
)

const staticLayer = testEffect(
  Layer.mergeAll(
    DatabaseLayer,
    EffortStore.layer.pipe(Layer.provide(DatabaseLayer)),
    configLayer(new ConfigEffort.Info({ verification_commands: ["bun typecheck"] })),
  ),
)

const worktree = AbsolutePath.make("/work")
const directory = "/work"

/** Scripts spawns by kind: digest probes (`git`) and verifier runs get their own exit lists. */
const scriptedRuns = (
  gitExits: readonly (number | AppProcessError)[],
  verifierExits: readonly (number | AppProcessError)[],
) => {
  let git = 0
  let verifier = 0
  const runProcess = (_command: ChildProcess.Command, _options?: unknown) => {
    const isDigest = (git + verifier) % 2 === 0
    if (isDigest) {
      const exit = gitExits[Math.min(git, gitExits.length - 1)]!
      git++
      return settle(isDigest, exit)
    }
    const exit = verifierExits[Math.min(verifier, verifierExits.length - 1)]!
    verifier++
    return settle(isDigest, exit)
  }
  const settle = (isDigest: boolean, exit: number | AppProcessError) => {
    if (exit instanceof AppProcessError) return Effect.fail(exit)
    const result: RunResult = {
      command: isDigest ? "git status --porcelain" : "bun typecheck",
      exitCode: exit,
      stdout: Buffer.from(isDigest && exit === 0 ? " M file.ts\n" : ""),
      stderr: Buffer.alloc(0),
      stdoutTruncated: false,
      stderrTruncated: false,
    }
    return Effect.succeed(result)
  }
  return {
    runProcess,
    get gitCalls() {
      return git
    },
    get verifierCalls() {
      return verifier
    },
  }
}

const seed = Effect.fn(function* (sessionID: SessionID) {
  const database = yield* Database.Service
  yield* database.db.insert(ProjectTable).values({ id: Project.ID.global, worktree, sandboxes: [] }).run()
  yield* database.db
    .insert(SessionTable)
    .values({ id: sessionID, project_id: Project.ID.global, directory: worktree, slug: "effort", version: "test" })
  const efforts = yield* EffortStore.Service
  yield* efforts.set({ sessionID, baseLevel: "standard", revision: 0 })
})

describe("EffortVerification", () => {
  adaptiveLayer.effect("raises the level from a harness failure and records the verdict", () => {
    return Effect.gen(function* () {
      const runs = scriptedRuns([1], [1])
      const id = SessionID.make("ses_verify_raise")
      yield* seed(id)
      const efforts = yield* EffortStore.Service
      // A model mutation since the seed marks the session dirty.
      yield* efforts.bumpRevision(id)

      yield* EffortVerification.runIfDirty(
        { db: (yield* Database.Service).db, efforts, config: yield* Config.Service, runProcess: runs.runProcess },
        { sessionID: id, directory },
      )

      const row = yield* efforts.get(id)
      expect(row?.level).toBe("deep")
      expect(row?.openFailure?.verifier).toBe("bun typecheck")
      expect(row?.verdictRevision).toBe(1)
      expect(runs.verifierCalls).toBe(1)
    })
  })

  adaptiveLayer.effect("decays through clean passes and stops once clean", () => {
    return Effect.gen(function* () {
      const runs = scriptedRuns([1], [1, 0, 0])
      const id = SessionID.make("ses_verify_decay")
      yield* seed(id)
      const efforts = yield* EffortStore.Service
      yield* efforts.setLevel(id, "standard", 0)
      yield* efforts.bumpRevision(id)
      const run = () =>
        Effect.gen(function* () {
          yield* EffortVerification.runIfDirty(
            {
              db: (yield* Database.Service).db,
              efforts,
              config: yield* Config.Service,
              runProcess: runs.runProcess,
            },
            { sessionID: id, directory },
          )
        })

      yield* run()
      expect((yield* efforts.get(id))?.level).toBe("deep")

      yield* run()
      expect((yield* efforts.get(id))?.openFailure).toBeUndefined()
      expect((yield* efforts.get(id))?.cleanPasses).toBe(1)

      yield* run()
      const row = yield* efforts.get(id)
      expect(row?.level).toBe("standard")
      expect(row?.cleanPasses).toBe(0)

      // Clean and verified: the verifier does not run again.
      yield* run()
      expect(runs.verifierCalls).toBe(3)
    })
  })

  adaptiveLayer.effect("records the workspace digest when the session is a repository", () => {
    return Effect.gen(function* () {
      const runs = scriptedRuns([0], [1])
      const id = SessionID.make("ses_verify_digest")
      yield* seed(id)
      const efforts = yield* EffortStore.Service
      yield* efforts.bumpRevision(id)

      yield* EffortVerification.runIfDirty(
        { db: (yield* Database.Service).db, efforts, config: yield* Config.Service, runProcess: runs.runProcess },
        { sessionID: id, directory },
      )

      const row = yield* efforts.get(id)
      expect(row?.verdictDigest).toBeDefined()
      expect(row?.verdictDigest).not.toBe("clean")
    })
  })

  adaptiveLayer.effect("treats spawn failures as infrastructure", () => {
    return Effect.gen(function* () {
      const runs = scriptedRuns([1], [new AppProcessError({ command: "bun typecheck" })])
      const id = SessionID.make("ses_verify_spawn")
      yield* seed(id)
      const efforts = yield* EffortStore.Service
      yield* efforts.bumpRevision(id)

      yield* EffortVerification.runIfDirty(
        { db: (yield* Database.Service).db, efforts, config: yield* Config.Service, runProcess: runs.runProcess },
        { sessionID: id, directory },
      )

      const row = yield* efforts.get(id)
      expect(row?.level).toBeUndefined()
      expect(row?.openFailure).toBeUndefined()
      expect(row?.verdictRevision).toBeUndefined()
    })
  })

  adaptiveLayer.effect("skips the verifier for clean sessions", () => {
    return Effect.gen(function* () {
      const runs = scriptedRuns([], [])
      const id = SessionID.make("ses_verify_clean")
      yield* seed(id)
      const efforts = yield* EffortStore.Service

      yield* EffortVerification.runIfDirty(
        { db: (yield* Database.Service).db, efforts, config: yield* Config.Service, runProcess: runs.runProcess },
        { sessionID: id, directory },
      )

      // The digest probe observes workspace state; only the verifier stays silent.
      expect(runs.gitCalls).toBe(1)
      expect(runs.verifierCalls).toBe(0)
    })
  })

  staticLayer.effect("never runs in static mode", () => {
    return Effect.gen(function* () {
      const runs = scriptedRuns([], [])
      const id = SessionID.make("ses_verify_static")
      yield* seed(id)
      const efforts = yield* EffortStore.Service
      yield* efforts.bumpRevision(id)

      yield* EffortVerification.runIfDirty(
        { db: (yield* Database.Service).db, efforts, config: yield* Config.Service, runProcess: runs.runProcess },
        { sessionID: id, directory },
      )

      expect(runs.gitCalls).toBe(0)
      expect(runs.verifierCalls).toBe(0)
    })
  })
})
