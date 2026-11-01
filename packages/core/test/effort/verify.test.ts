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

const ambiguousLayer = testEffect(
  Layer.mergeAll(
    DatabaseLayer,
    EffortStore.layer.pipe(Layer.provide(DatabaseLayer)),
    configLayer(new ConfigEffort.Info({ verification_commands: ["bun typecheck || exit 0"], mode: "adaptive" })),
  ),
)

const staticLayer = testEffect(
  Layer.mergeAll(
    DatabaseLayer,
    EffortStore.layer.pipe(Layer.provide(DatabaseLayer)),
    configLayer(new ConfigEffort.Info({ verification_commands: ["bun typecheck"] })),
  ),
)

const laterVerifierLayer = testEffect(
  Layer.mergeAll(
    DatabaseLayer,
    EffortStore.layer.pipe(Layer.provide(DatabaseLayer)),
    configLayer(
      new ConfigEffort.Info({ verification_commands: ["bun test", "bun typecheck"], mode: "adaptive" }),
    ),
  ),
)

const invalidFirstLayer = testEffect(
  Layer.mergeAll(
    DatabaseLayer,
    EffortStore.layer.pipe(Layer.provide(DatabaseLayer)),
    configLayer(
      new ConfigEffort.Info({
        verification_commands: ["bun test && bun typecheck", "bun typecheck"],
        mode: "adaptive",
      }),
    ),
  ),
)

const removedVerifierLayer = testEffect(
  Layer.mergeAll(
    DatabaseLayer,
    EffortStore.layer.pipe(Layer.provide(DatabaseLayer)),
    configLayer(new ConfigEffort.Info({ verification_commands: ["bun test"], mode: "adaptive" })),
  ),
)

const unmatchableFailureLayer = testEffect(
  Layer.mergeAll(
    DatabaseLayer,
    EffortStore.layer.pipe(Layer.provide(DatabaseLayer)),
    configLayer(
      new ConfigEffort.Info({
        verification_commands: ["bun typecheck || exit 0", "bun test"],
        mode: "adaptive",
      }),
    ),
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

/** Harness dependencies with the layer's policy already resolved, as the caller does. */
const deps = Effect.fn(function* (runProcess: EffortVerification.Deps["runProcess"]) {
  const database = yield* Database.Service
  const efforts = yield* EffortStore.Service
  const config = yield* Config.Service
  return {
    db: database.db,
    efforts,
    settings: Config.effortPolicy(yield* config.entries()),
    runProcess,
  }
})

describe("EffortVerification", () => {
  ambiguousLayer.effect("skips an ambiguous configured verifier without recording a verdict", () =>
    Effect.gen(function* () {
      const runs = scriptedRuns([1], [0])
      const id = SessionID.make("ses_verify_ambiguous")
      yield* seed(id)
      const efforts = yield* EffortStore.Service
      yield* efforts.bumpWorkspaceRevision(id)
      yield* EffortVerification.runIfDirty(
        yield* deps(runs.runProcess),
        { sessionID: id, directory },
      )
      expect(runs.verifierCalls).toBe(0)
      expect((yield* efforts.get(id))?.verdictRevision).toBeUndefined()
    }),
  )

  adaptiveLayer.effect("raises the level from a harness failure and records the verdict", () => {
    return Effect.gen(function* () {
      const runs = scriptedRuns([1], [1])
      const id = SessionID.make("ses_verify_raise")
      yield* seed(id)
      const efforts = yield* EffortStore.Service
      // A model mutation since the seed marks the session dirty.
      yield* efforts.bumpWorkspaceRevision(id)

      yield* EffortVerification.runIfDirty(
        yield* deps(runs.runProcess),
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
      yield* efforts.recordEvidence(id, { openFailure: undefined, level: "standard", cleanPasses: 0 })
      yield* efforts.bumpWorkspaceRevision(id)
      const run = () =>
        Effect.gen(function* () {
          yield* EffortVerification.runIfDirty(
            yield* deps(runs.runProcess),
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
      yield* efforts.bumpWorkspaceRevision(id)

      yield* EffortVerification.runIfDirty(
        yield* deps(runs.runProcess),
        { sessionID: id, directory },
      )

      const row = yield* efforts.get(id)
      expect(row?.verdictDigest).toBeDefined()
      expect(row?.verdictDigest).not.toBe("clean")
    })
  })

  adaptiveLayer.effect("discards a verifier result when the workspace changes during the run", () =>
    Effect.gen(function* () {
      const runs = scriptedRuns([1], [0])
      const id = SessionID.make("ses_verify_concurrent_change")
      yield* seed(id)
      const efforts = yield* EffortStore.Service
      yield* efforts.set({ sessionID: id, baseLevel: "standard", revision: 1, level: "deep", cleanPasses: 0,
        openFailure: { verifier: "bun typecheck", sequence: 1, revision: 1 } })
      const runProcess = (command: ChildProcess.Command, options?: unknown): Effect.Effect<RunResult, AppProcessError> =>
        Effect.gen(function* () {
          const result = yield* runs.runProcess(command, options)
          if (runs.verifierCalls === 1) yield* efforts.bumpWorkspaceRevision(id)
          return result
        })
      yield* EffortVerification.runIfDirty(
        yield* deps(runProcess),
        { sessionID: id, directory },
      )
      const row = yield* efforts.get(id)
      expect(row?.revision).toBe(2)
      expect(row?.openFailure?.verifier).toBe("bun typecheck")
      expect(row?.level).toBe("deep")
      expect(row?.verdictRevision).toBeUndefined()
    }),
  )

  adaptiveLayer.effect("treats spawn failures as infrastructure", () => {
    return Effect.gen(function* () {
      const runs = scriptedRuns([1], [new AppProcessError({ command: "bun typecheck" })])
      const id = SessionID.make("ses_verify_spawn")
      yield* seed(id)
      const efforts = yield* EffortStore.Service
      yield* efforts.bumpWorkspaceRevision(id)

      yield* EffortVerification.runIfDirty(
        yield* deps(runs.runProcess),
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

      yield* EffortVerification.runIfDirty(yield* deps(runs.runProcess), { sessionID: id, directory })

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
      yield* efforts.bumpWorkspaceRevision(id)

      yield* EffortVerification.runIfDirty(yield* deps(runs.runProcess), { sessionID: id, directory })

      expect(runs.gitCalls).toBe(0)
      expect(runs.verifierCalls).toBe(0)
    })
  })

  unmatchableFailureLayer.effect("stops when the failing verifier cannot be attributed", () =>
    Effect.gen(function* () {
      const runs = scriptedRuns([1], [0])
      const id = SessionID.make("ses_verify_unmatchable_failure")
      yield* seed(id)
      const efforts = yield* EffortStore.Service
      yield* efforts.set({
        sessionID: id,
        baseLevel: "standard",
        revision: 1,
        level: "deep",
        cleanPasses: 0,
        openFailure: { verifier: "bun typecheck || exit 0", sequence: 0, revision: 1 },
      })

      yield* EffortVerification.runIfDirty(yield* deps(runs.runProcess), { sessionID: id, directory })

      // No other command can clear that failure, so running one would only burn a pass.
      expect(runs.verifierCalls).toBe(0)
      expect((yield* efforts.get(id))?.openFailure?.verifier).toBe("bun typecheck || exit 0")
    }),
  )

  laterVerifierLayer.effect("clears a failure opened by a later configured verifier", () =>
    Effect.gen(function* () {
      const runs = scriptedRuns([1], [0])
      const id = SessionID.make("ses_verify_later_verifier")
      yield* seed(id)
      const efforts = yield* EffortStore.Service
      yield* efforts.set({
        sessionID: id,
        baseLevel: "standard",
        revision: 1,
        level: "deep",
        cleanPasses: 0,
        openFailure: { verifier: "bun typecheck", sequence: 0, revision: 1 },
      })

      yield* EffortVerification.runIfDirty(yield* deps(runs.runProcess), { sessionID: id, directory })

      // The failing verifier is not the first entry; running `bun test` would never clear it.
      expect(runs.verifierCalls).toBe(1)
      expect((yield* efforts.get(id))?.openFailure).toBeUndefined()
    }),
  )

  invalidFirstLayer.effect("skips an unusable first entry and runs a later usable one", () =>
    Effect.gen(function* () {
      const runs = scriptedRuns([1], [0])
      const id = SessionID.make("ses_verify_invalid_first")
      yield* seed(id)
      const efforts = yield* EffortStore.Service
      yield* efforts.set({
        sessionID: id,
        baseLevel: "standard",
        revision: 0,
        level: "standard",
        cleanPasses: 0,
      })
      yield* efforts.bumpWorkspaceRevision(id)

      yield* EffortVerification.runIfDirty(yield* deps(runs.runProcess), { sessionID: id, directory })

      // A clean pass only counts when the command is attributable. The first entry is a
      // compound command, so this fails if the harness takes it instead of the usable one.
      expect(runs.verifierCalls).toBe(1)
      expect((yield* efforts.get(id))?.cleanPasses).toBe(1)
    }),
  )

  removedVerifierLayer.effect("runs nothing when the failing verifier is no longer configured", () =>
    Effect.gen(function* () {
      const runs = scriptedRuns([1], [0])
      const id = SessionID.make("ses_verify_removed_verifier")
      yield* seed(id)
      const efforts = yield* EffortStore.Service
      yield* efforts.set({
        sessionID: id,
        baseLevel: "standard",
        revision: 1,
        level: "deep",
        cleanPasses: 0,
        openFailure: { verifier: "bun typecheck", sequence: 0, revision: 1 },
      })

      yield* EffortVerification.runIfDirty(yield* deps(runs.runProcess), { sessionID: id, directory })

      // `bun test` cannot clear a `bun typecheck` failure, so running it would only burn a
      // verifier run on every idle pass without ever recovering.
      expect(runs.verifierCalls).toBe(0)
      expect((yield* efforts.get(id))?.openFailure?.verifier).toBe("bun typecheck")
    }),
  )
})
