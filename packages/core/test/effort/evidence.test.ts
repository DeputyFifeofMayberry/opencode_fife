import { describe, expect, test } from "bun:test"
import { Effect, Layer, Logger } from "effect"
import { sql } from "drizzle-orm"
import { Bus } from "@opencode/core/bus"
import { Config } from "@opencode/core/config"
import { Database } from "@opencode/core/database/database"
import { backfillEvidenceSequence } from "@opencode/core/database/migration/20261101223922_add_session_effort_sequence"
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
      { db: database.db, efforts },
      Config.effortPolicy(yield* config.entries()),
      sessionID,
      {
        tool,
        input: command === undefined ? {} : { command },
        metadata: exit === undefined ? {} : { exit },
      },
    )
  })

describe("EffortEvidence.classify", () => {
  const configured = (...verification_commands: string[]) => new ConfigEffort.Info({ verification_commands })

  const cases: ReadonlyArray<{
    readonly name: string
    readonly settings: ConfigEffort.Info | undefined
    readonly tool: string
    readonly input: unknown
    readonly metadata: unknown
    readonly expected: EffortEvidence.VerifierVerdict
  }> = [
    {
      name: "classifies a passing model-run verifier",
      settings: configured("pnpm typecheck"),
      tool: "shell",
      input: { command: "pnpm typecheck" },
      metadata: { exit: 0 },
      expected: { kind: "verification-pass", verifier: "pnpm typecheck" },
    },
    {
      name: "classifies a failing model-run verifier",
      settings: configured("pnpm typecheck"),
      tool: "shell",
      input: { command: "pnpm typecheck" },
      metadata: { exit: 1 },
      expected: { kind: "verification-failure", verifier: "pnpm typecheck" },
    },
    {
      name: "classifies a passing harness settlement",
      settings: configured("pnpm typecheck"),
      tool: "harness-verifier",
      input: { command: "pnpm typecheck" },
      metadata: { exit: 0 },
      expected: { kind: "verification-pass", verifier: "pnpm typecheck" },
    },
    {
      name: "treats a missing exit as infrastructure",
      settings: configured("pnpm typecheck"),
      tool: "shell",
      input: { command: "pnpm typecheck" },
      metadata: {},
      expected: { kind: "infrastructure" },
    },
    {
      name: "treats a timeout as infrastructure",
      settings: configured("pnpm typecheck"),
      tool: "shell",
      input: { command: "pnpm typecheck" },
      metadata: { exit: 0, timeout: true },
      expected: { kind: "infrastructure" },
    },
    {
      name: "treats a signal as infrastructure",
      settings: configured("pnpm typecheck"),
      tool: "shell",
      input: { command: "pnpm typecheck" },
      metadata: { exit: 0, signal: "SIGTERM" },
      expected: { kind: "infrastructure" },
    },
    {
      name: "rejects a command that is not configured",
      settings: configured("pnpm typecheck"),
      tool: "shell",
      input: { command: "pnpm build" },
      metadata: { exit: 0 },
      expected: { kind: "not-a-verifier" },
    },
    {
      name: "rejects a tool that cannot be a verifier",
      settings: configured("pnpm typecheck"),
      tool: "write",
      input: { command: "pnpm typecheck" },
      metadata: { exit: 0 },
      expected: { kind: "not-a-verifier" },
    },
    {
      name: "rejects a compound command",
      settings: configured("pnpm typecheck"),
      tool: "shell",
      input: { command: "pnpm build && pnpm typecheck" },
      metadata: { exit: 1 },
      expected: { kind: "not-a-verifier" },
    },
    {
      name: "rejects an appended flag",
      settings: configured("pnpm typecheck"),
      tool: "shell",
      input: { command: "pnpm typecheck --pretty=false" },
      metadata: { exit: 0 },
      expected: { kind: "not-a-verifier" },
    },
    {
      name: "rejects a redirected command",
      settings: configured("pnpm typecheck"),
      tool: "shell",
      input: { command: "pnpm typecheck 2>&1" },
      metadata: { exit: 0 },
      expected: { kind: "not-a-verifier" },
    },
    {
      name: "rejects a quoted command",
      settings: configured("pnpm typecheck"),
      tool: "shell",
      input: { command: 'pnpm typecheck "strict"' },
      metadata: { exit: 0 },
      expected: { kind: "not-a-verifier" },
    },
    {
      name: "rejects a multi-line command",
      settings: configured("pnpm typecheck"),
      tool: "shell",
      input: { command: "pnpm typecheck\nrm -rf build" },
      metadata: { exit: 0 },
      expected: { kind: "not-a-verifier" },
    },
    {
      name: "trims whitespace on both sides",
      settings: configured("  pnpm typecheck  "),
      tool: "shell",
      input: { command: "  pnpm typecheck  " },
      metadata: { exit: 0 },
      expected: { kind: "verification-pass", verifier: "pnpm typecheck" },
    },
    {
      name: "is inert without settings",
      settings: undefined,
      tool: "shell",
      input: { command: "pnpm typecheck" },
      metadata: { exit: 1 },
      expected: { kind: "not-a-verifier" },
    },
    {
      name: "is inert when nothing is configured",
      settings: configured(),
      tool: "shell",
      input: { command: "pnpm typecheck" },
      metadata: { exit: 1 },
      expected: { kind: "not-a-verifier" },
    },
    {
      name: "ignores an empty configured entry",
      settings: configured("", "pnpm typecheck"),
      tool: "shell",
      input: { command: "pnpm typecheck" },
      metadata: { exit: 0 },
      expected: { kind: "verification-pass", verifier: "pnpm typecheck" },
    },
  ]

  for (const row of cases)
    test(row.name, () => {
      expect(
        EffortEvidence.classify(row.settings, { tool: row.tool, input: row.input, metadata: row.metadata }),
      ).toEqual(row.expected)
    })
})

describe("EffortEvidence.warnUnmatchable", () => {
  const warnings = () => {
    const seen: string[] = []
    const text = (message: unknown) =>
      Array.isArray(message)
        ? message.map((part) => (typeof part === "string" ? part : JSON.stringify(part))).join(" ")
        : String(message)
    return {
      seen,
      layer: Logger.layer([
        Logger.make(({ logLevel, message }) => {
          if (logLevel === "Warn") seen.push(text(message))
        }),
      ]),
    }
  }

  test("warns once per distinct configured command that cannot be attributed", async () => {
    const sink = warnings()
    const settings = new ConfigEffort.Info({
      verification_commands: ["pnpm build && pnpm test", "", "pnpm build && pnpm test"],
    })
    await Effect.runPromise(
      Effect.gen(function* () {
        yield* EffortEvidence.warnUnmatchable(settings)
        yield* EffortEvidence.warnUnmatchable(settings)
      }).pipe(Effect.provide(sink.layer)),
    )
    expect(sink.seen).toHaveLength(1)
    expect(sink.seen[0]).toContain("pnpm build && pnpm test")
  })

  test("says nothing when every configured command is usable", async () => {
    const sink = warnings()
    await Effect.runPromise(
      Effect.gen(function* () {
        yield* EffortEvidence.warnUnmatchable(new ConfigEffort.Info({ verification_commands: ["bun test"] }))
        yield* EffortEvidence.warnUnmatchable(undefined)
      }).pipe(Effect.provide(sink.layer)),
    )
    expect(sink.seen).toHaveLength(0)
  })
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

  it.effect("rejects decorated verifier invocations", () => {
    return Effect.gen(function* () {
      const efforts = yield* EffortStore.Service
      const id = SessionID.make("ses_evidence_decorated")
      yield* seed(id)
      // Pipelines and redirections do not provide a trustworthy verifier exit.
      yield* settle(id, "shell", "pnpm typecheck 2>&1 | Select-String -Pattern error", 1)
      yield* settle(id, "shell", "pnpm typecheck > out.log 2>&1", 1)
      expect((yield* efforts.get(id))?.openFailure).toBeUndefined()
      // Flags can change what runs, including --help, so only the configured command counts.
      yield* settle(id, "shell", "pnpm typecheck --pretty=false", 1)
      yield* settle(id, "shell", "pnpm typecheck-strict", 1)
      expect((yield* efforts.get(id))?.openFailure).toBeUndefined()
      yield* settle(id, "shell", "pnpm typecheck", 1)
      yield* settle(id, "shell", "pnpm typecheck --help", 0)
      expect((yield* efforts.get(id))?.openFailure?.verifier).toBe("pnpm typecheck")
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

  it.effect("observes the revision at settlement without moving it", () => {
    return Effect.gen(function* () {
      const efforts = yield* EffortStore.Service
      const id = SessionID.make("ses_evidence_revision")
      yield* seed(id)
      yield* settle(id, "shell", "pnpm typecheck", 1)
      // The dispatch path owns the bump now, so a mutating settlement no longer moves it.
      yield* settle(id, "write", undefined, 0)
      yield* settle(id, "echo", undefined, 0)
      const row = yield* efforts.get(id)
      expect(row?.revision).toBe(0)
      expect(row?.openFailure).toBeDefined()

      // A dispatch-time mutation invalidates the workspace the failure was observed in;
      // a later pass at the newer revision still clears it, because revision never decreases.
      yield* efforts.bumpWorkspaceRevision(id)
      yield* settle(id, "shell", "pnpm typecheck", 0)
      expect((yield* efforts.get(id))?.revision).toBe(1)
      expect((yield* efforts.get(id))?.openFailure).toBeUndefined()
    })
  })

  it.effect("clears a failure recorded before the observation order existed", () => {
    return Effect.gen(function* () {
      const database = yield* Database.Service
      const efforts = yield* EffortStore.Service
      const id = SessionID.make("ses_evidence_backfill")
      yield* seed(id)

      // The shape a pre-migration session is in: an open failure whose sequence came from
      // the event counter, and an event counter sitting at that same number.
      yield* efforts.recordEvidence(id, {
        openFailure: { verifier: "pnpm typecheck", sequence: 7, revision: 0 },
      })
      yield* Bus.reserveSequence(database.db, id, 7)
      yield* database.db.run(sql.raw(backfillEvidenceSequence))

      // One qualifying pass claims the next number and clears it.
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

  adaptiveIt.effect("a mutation invalidates clean passes from the previous revision", () =>
    Effect.gen(function* () {
      const efforts = yield* EffortStore.Service
      const id = SessionID.make("ses_evidence_mutation_resets_passes")
      yield* seed(id)
      yield* efforts.recordEvidence(id, { openFailure: undefined, level: "standard", cleanPasses: 0 })
      yield* settle(id, "shell", "pnpm typecheck", 1)
      yield* settle(id, "shell", "pnpm typecheck", 0)
      expect((yield* efforts.get(id))?.cleanPasses).toBe(1)
      yield* efforts.bumpWorkspaceRevision(id)
      expect((yield* efforts.get(id))?.cleanPasses).toBe(0)
      yield* settle(id, "shell", "pnpm typecheck", 0)
      expect((yield* efforts.get(id))?.level).toBe("deep")
      expect((yield* efforts.get(id))?.cleanPasses).toBe(1)
    }),
  )

  adaptiveIt.effect("raises the durable level on failure and decays it after clean passes", () => {
    return Effect.gen(function* () {
      const efforts = yield* EffortStore.Service
      const id = SessionID.make("ses_evidence_adaptive")
      yield* seed(id)
      yield* efforts.recordEvidence(id, { openFailure: undefined, level: "standard", cleanPasses: 0 })

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
