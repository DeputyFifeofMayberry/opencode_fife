// Measures per-step session history reconstruction against synthetic sessions.
// Run from packages/core:
//
//   bun run benchmark:session-context
//   bun run benchmark:session-context -- --json out.json --keep
//   bun run benchmark:session-context -- --iterations 20 --warmups 5 --profile profile.json
//
// The primary measurement calls the production `SessionHistory.entriesForRunner`.
// Fixtures are seeded into a temporary SQLite database under a temporary global
// directory and home. No network, no filesystem watchers, no live user data.
//
// Query counts are derived from the code path and labeled `derived`; the SQLite
// driver exposes no statement counter. Memory is heapUsed after two forced GCs
// plus RSS, following benchmark-location-memory.ts.
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { sql } from "drizzle-orm"
import { and, asc, eq, gte } from "drizzle-orm"
import { DateTime, Effect, Layer, Logger, Schema, Stream } from "effect"
import type { SQL } from "drizzle-orm"
import type { SQLiteTable } from "drizzle-orm/sqlite-core"
import { samplingProfilerStackTraces, startSamplingProfiler } from "bun:jsc"
import { Agent } from "@opencode/schema/agent"
import { Model } from "@opencode/schema/model"
import { Project } from "@opencode/schema/project"
import { Provider } from "@opencode/schema/provider"
import { SessionID } from "@opencode/schema/session-id"
import { SessionMessage } from "@opencode/schema/session-message"
import { AbsolutePath } from "@opencode/schema/schema"
import { Global } from "@opencode/util/global"
import { Bus } from "../src/bus"
import { Database } from "../src/database/database"
import { Instructions } from "../src/instructions/index"
import { ProjectTable } from "../src/project/sql"
import { SessionBlob } from "../src/session/blob"
import { encodePart, SessionHistory, withParts } from "../src/session/history"
import { InstructionState } from "../src/session/instruction-state"
import {
  BlobRefTable,
  BlobTable,
  InstructionStateTable,
  SessionMessageTable,
  SessionPartTable,
  SessionTable,
} from "../src/session/sql"
import { SessionStored } from "../src/session/stored"

// bun-types 1.4.4 omits the runtime export that returns the collected samples.
declare module "bun:jsc" {
  function samplingProfilerStackTraces(): SamplingProfileStackTraces
}

type DatabaseService = Database.Interface["db"]
type Boundary = SessionHistory.Boundary

const args = process.argv.slice(2)
const flag = (name: string) => {
  const index = args.indexOf(`--${name}`)
  return index === -1 ? undefined : args[index + 1]
}
const positive = (name: string, fallback: number) => {
  const raw = flag(name)
  if (raw === undefined) return fallback
  const value = Number(raw)
  if (!Number.isInteger(value) || value < 1) {
    console.error(`--${name} must be a positive integer`)
    process.exit(1)
  }
  return value
}
const iterations = positive("iterations", 20)
const warmups = positive("warmups", 5)
const jsonPath = flag("json")
const profilePath = flag("profile")
const keep = args.includes("--keep")

const KB = 1024
const testModel = Model.Ref.make({ providerID: Provider.ID.make("bench"), id: Model.ID.make("bench-model") })
const otherModel = Model.Ref.make({ providerID: Provider.ID.make("bench"), id: Model.ID.make("other-model") })
const created = (seq: number) => 1_000 + seq * 1_000
const text = (bytes: number) => "x".repeat(bytes)

const tempRoot = await mkdtemp(path.join(os.tmpdir(), "opencode-session-context-"))
const worktree = path.join(tempRoot, "projects", "bench")
const databasePath = path.join(tempRoot, "data", "opencode.db")
await Promise.all(
  ["home", "data", "cache", "config", "state", "tmp", "bin", "log", "repos", "projects/bench"].map((directory) =>
    mkdir(path.join(tempRoot, directory), { recursive: true }),
  ),
)

// Keep any direct environment lookup away from the user's real home and config.
process.env.HOME = path.join(tempRoot, "home")
process.env.USERPROFILE = path.join(tempRoot, "home")
process.env.XDG_DATA_HOME = path.join(tempRoot, "data")
process.env.XDG_CACHE_HOME = path.join(tempRoot, "cache")
process.env.XDG_CONFIG_HOME = path.join(tempRoot, "config")
process.env.XDG_STATE_HOME = path.join(tempRoot, "state")

const globalLayer = Global.layerWith({
  home: path.join(tempRoot, "home"),
  data: path.join(tempRoot, "data"),
  cache: path.join(tempRoot, "cache"),
  config: path.join(tempRoot, "config"),
  state: path.join(tempRoot, "state"),
  tmp: path.join(tempRoot, "tmp"),
  bin: path.join(tempRoot, "cache", "bin"),
  log: path.join(tempRoot, "data", "log"),
  repos: path.join(tempRoot, "data", "repos"),
})
const databaseLayer = Database.layer({ path: databasePath }).pipe(Layer.provide(globalLayer))

const commit = () => {
  if (process.env.OPENCODE_BENCH_REVISION) return process.env.OPENCODE_BENCH_REVISION
  const result = Bun.spawnSync({
    cmd: ["git", "rev-parse", "HEAD"],
    cwd: path.resolve(import.meta.dir, "../../.."),
    stdout: "pipe",
    stderr: "pipe",
  })
  return result.exitCode === 0 ? result.stdout.toString().trim() : "unknown"
}

interface Shape {
  readonly messages: number
  readonly assistants: number
  readonly parts: number
  readonly blobs: number
  readonly compactions: number
  readonly selectedAssistants: number
  readonly retainedAssistants: number
  readonly hasKeepID: boolean
  readonly blobHashes: number
  readonly instructionHashes: number
}

interface Expected {
  readonly messages: number
  readonly assistants: number
  readonly parts: number
  readonly blobs: number
  readonly compactions: number
  readonly entries: number
  readonly firstType: string
  readonly retainedText: boolean
  readonly hydratedMedia: boolean
  readonly nativeCompaction: boolean
}

interface Seed {
  readonly sessionID: SessionID
  readonly messages: ReadonlyArray<typeof SessionMessageTable.$inferInsert>
  readonly parts: ReadonlyArray<typeof SessionPartTable.$inferInsert>
  readonly blobs: ReadonlyArray<typeof BlobTable.$inferInsert>
  readonly blobRefs: ReadonlyArray<typeof BlobRefTable.$inferInsert>
}

interface Scenario {
  readonly id: string
  readonly boundary: Boundary
  readonly seed: Seed
  readonly expected: Expected
  readonly shape: Shape
  readonly selectFromSeq: number
}

interface Timing {
  readonly median: number
  readonly p95: number
  readonly mean: number
  readonly min: number
  readonly max: number
  readonly samples: number
}

interface Memory {
  readonly retainedHeapBytes: number
  readonly rssBytes: number
  readonly rssDeltaBytes: number
  readonly entries: number
}

interface QueryCount {
  readonly latestCompaction: number
  readonly messageSelect: number
  readonly withParts: number
  readonly hydrate: number
  readonly instructionState: number
  readonly instructionBlobs: number
  readonly recentText: number
  readonly total: number
  readonly label: "derived"
}

interface ScenarioResult {
  readonly id: string
  readonly shape: Shape
  readonly queries: QueryCount
  readonly timing: Timing
  readonly memory: Memory
  readonly coldMs: number
}

const assistantMessage = (id: string, at: number, content: ReadonlyArray<SessionMessage.AssistantContent>) =>
  SessionMessage.Assistant.make({
    id: SessionMessage.ID.make(id),
    type: "assistant",
    agent: Agent.ID.make("build"),
    model: testModel,
    content,
    time: { created: DateTime.makeUnsafe(at) },
  })

const userMessage = (id: string, at: number, value: string) =>
  SessionMessage.User.make({
    id: SessionMessage.ID.make(id),
    type: "user",
    text: value,
    time: { created: DateTime.makeUnsafe(at) },
  })

const textPart = (value: string): SessionMessage.AssistantContent => ({ type: "text", text: value })

const toolPart = (id: string, at: number, output: string): SessionMessage.AssistantContent => ({
  type: "tool",
  id,
  name: "bash",
  state: { status: "completed", input: { command: "echo" }, content: [{ type: "text", text: output }] },
  time: { created: DateTime.makeUnsafe(at) },
})

const encodeMessage = Schema.encodeSync(SessionMessage.Info)
const encodeStoredUser = Schema.encodeSync(SessionStored.User)

const messageRow = (
  sessionID: SessionID,
  message: SessionMessage.Info,
  seq: number,
): typeof SessionMessageTable.$inferInsert => {
  const { id: _, type, ...data } = encodeMessage(message)
  const at = DateTime.toEpochMillis(message.time.created)
  return { id: message.id, session_id: sessionID, type, seq, time_created: at, time_updated: at, data }
}

const storedUserRow = (
  sessionID: SessionID,
  message: SessionStored.User,
  seq: number,
): typeof SessionMessageTable.$inferInsert => {
  const { id: _, type, ...data } = encodeStoredUser(message)
  const at = DateTime.toEpochMillis(message.time.created)
  return { id: message.id, session_id: sessionID, type, seq, time_created: at, time_updated: at, data }
}

const partRow = (
  sessionID: SessionID,
  messageID: SessionMessage.ID,
  ordinal: number,
  part: SessionMessage.AssistantContent,
  at: number,
): typeof SessionPartTable.$inferInsert => {
  const data = encodePart(part)
  return {
    message_id: messageID,
    session_id: sessionID,
    ordinal,
    type: data.type,
    call_id: data.type === "tool" ? data.id : null,
    data,
    time_created: at,
    time_updated: at,
  }
}

const chunk = <A>(items: ReadonlyArray<A>, size: number) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size))

const partsQueries = (count: number) => (count === 0 ? 0 : Math.ceil(count / 500))

const derivedQueries = (shape: Shape): QueryCount => {
  const recentText = shape.hasKeepID ? 1 + 1 + partsQueries(shape.retainedAssistants) : 0
  const latestCompaction = 1
  const messageSelect = 1
  const withPartsCount = partsQueries(shape.selectedAssistants)
  const hydrate = partsQueries(shape.blobHashes)
  const instructionState = 1
  const instructionBlobs = partsQueries(shape.instructionHashes)
  return {
    latestCompaction,
    messageSelect,
    withParts: withPartsCount,
    hydrate,
    instructionState,
    instructionBlobs,
    recentText,
    total: latestCompaction + messageSelect + withPartsCount + hydrate + instructionState + instructionBlobs + recentText,
    label: "derived",
  }
}

const shapeOf = (input: Partial<Shape>): Shape => ({
  messages: 0,
  assistants: 0,
  parts: 0,
  blobs: 0,
  compactions: 0,
  selectedAssistants: 0,
  retainedAssistants: 0,
  hasKeepID: false,
  blobHashes: 0,
  instructionHashes: 0,
  ...input,
})

const expectedOf = (
  shape: Shape,
  result: Pick<Expected, "entries" | "firstType" | "retainedText" | "hydratedMedia" | "nativeCompaction">,
): Expected => ({
  messages: shape.messages,
  assistants: shape.assistants,
  parts: shape.parts,
  blobs: shape.blobs,
  compactions: shape.compactions,
  ...result,
})

const emptySeed = (id: string): Seed => ({
  sessionID: SessionID.make(`ses_bench_${id}`),
  messages: [],
  parts: [],
  blobs: [],
  blobRefs: [],
})

const textScenario = (id: string, count: number): Seed => {
  const sessionID = SessionID.make(`ses_bench_${id}`)
  const messages = Array.from({ length: count }, (_, index) => {
    const seq = index + 1
    const messageID = `msg_${id}_${seq}`
    return messageRow(sessionID, assistantMessage(messageID, created(seq), []), seq)
  })
  const parts = Array.from({ length: count }, (_, index) => {
    const seq = index + 1
    return partRow(sessionID, SessionMessage.ID.make(`msg_${id}_${seq}`), 0, textPart(text(KB)), created(seq))
  })
  return { sessionID, messages, parts, blobs: [], blobRefs: [] }
}

const toolScenario = (id: string, count: number, partsPerMessage: number, outputBytes: number): Seed => {
  const sessionID = SessionID.make(`ses_bench_${id}`)
  const messages = Array.from({ length: count }, (_, index) => {
    const seq = index + 1
    const messageID = `msg_${id}_${seq}`
    return messageRow(sessionID, assistantMessage(messageID, created(seq), []), seq)
  })
  const parts = messages.flatMap((message, index) =>
    Array.from({ length: partsPerMessage }, (_, ordinal) =>
      partRow(
        sessionID,
        message.id,
        ordinal,
        toolPart(`call_${id}_${index}_${ordinal}`, created(index + 1), text(outputBytes)),
        created(index + 1),
      ),
    ),
  )
  return { sessionID, messages, parts, blobs: [], blobRefs: [] }
}

const mediaScenario = (id: string, withBlobs: boolean): Seed => {
  const sessionID = SessionID.make(`ses_bench_${id}`)
  const blobCount = 50
  const blobBytes = 200 * KB
  const blobs = withBlobs
    ? Array.from({ length: blobCount }, (_, index) => {
        const data = Buffer.alloc(blobBytes, index + 1)
        return { hash: SessionBlob.hashBytes(data), mime: "image/png", bytes: blobBytes, data }
      })
    : []
  const messages = Array.from({ length: 200 }, (_, index) => {
    const seq = index + 1
    const at = created(seq)
    const messageID = `msg_${id}_${seq}`
    const blob = blobs[index]
    if (blob === undefined) return messageRow(sessionID, userMessage(messageID, at, text(KB)), seq)
    const message = SessionStored.User.make({
      id: SessionMessage.ID.make(messageID),
      type: "user",
      text: text(KB),
      files: [
        SessionStored.FileRef.make({
          mime: "image/png",
          source: { type: "inline" },
          name: `blob-${index}.png`,
          uri: SessionStored.ref(blob.hash),
        }),
      ],
      time: { created: DateTime.makeUnsafe(at) },
    })
    return storedUserRow(sessionID, message, seq)
  })
  const blobRefs = blobs.map((blob, index) => ({
    session_id: sessionID,
    message_id: SessionMessage.ID.make(`msg_${id}_${index + 1}`),
    hash: blob.hash,
    seq: index + 1,
  }))
  return { sessionID, messages, parts: [], blobs, blobRefs }
}

const alternatingMessage = (id: string, seq: number) => {
  const messageID = `msg_${id}_${seq}`
  return seq % 2 === 1
    ? userMessage(messageID, created(seq), text(KB))
    : assistantMessage(messageID, created(seq), [textPart(text(KB))])
}

const compactionScenario = (id: string, keepIDSeq?: number): Seed => {
  const sessionID = SessionID.make(`ses_bench_${id}`)
  const preCount = 1_799
  const compactionSeq = 1_800
  const postCount = 200
  const messages = Array.from({ length: preCount }, (_, index) =>
    messageRow(sessionID, alternatingMessage(id, index + 1), index + 1),
  )
  const keepID = keepIDSeq === undefined ? undefined : SessionMessage.ID.make(`msg_${id}_${keepIDSeq}`)
  const compaction = SessionMessage.CompactionCompleted.make({
    id: SessionMessage.ID.make(`msg_${id}_${compactionSeq}`),
    type: "compaction",
    status: "completed",
    reason: "auto",
    summary: "summary compaction",
    ...(keepID === undefined ? {} : { metadata: { keepID } }),
    time: { created: DateTime.makeUnsafe(created(compactionSeq)) },
  })
  messages.push(messageRow(sessionID, compaction, compactionSeq))
  for (let offset = 1; offset <= postCount; offset++) {
    const seq = compactionSeq + offset
    messages.push(messageRow(sessionID, alternatingMessage(id, seq), seq))
  }
  return { sessionID, messages, parts: [], blobs: [], blobRefs: [] }
}

const nativeScenario = (id: string): Seed => {
  const sessionID = SessionID.make(`ses_bench_${id}`)
  const preCount = 1_899
  const compactionSeq = 1_900
  const postCount = 100
  const messages = Array.from({ length: preCount }, (_, index) =>
    messageRow(sessionID, alternatingMessage(id, index + 1), index + 1),
  )
  const compaction = SessionMessage.CompactionCompleted.make({
    id: SessionMessage.ID.make(`msg_${id}_${compactionSeq}`),
    type: "compaction",
    status: "completed",
    reason: "auto",
    summary: "native compaction",
    model: testModel,
    native: { messages: [{ role: "user", content: [{ type: "text", text: "native window" }] }] },
    time: { created: DateTime.makeUnsafe(created(compactionSeq)) },
  })
  messages.push(messageRow(sessionID, compaction, compactionSeq))
  for (let offset = 1; offset <= postCount; offset++) {
    const seq = compactionSeq + offset
    messages.push(messageRow(sessionID, alternatingMessage(id, seq), seq))
  }
  return { sessionID, messages, parts: [], blobs: [], blobRefs: [] }
}

const s0 = emptySeed("s0")
const s1 = textScenario("s1", 20)
const s2a = textScenario("s2a", 500)
const s2 = textScenario("s2", 2_000)
const s3 = toolScenario("s3", 500, 20, 5 * KB)
const s4 = mediaScenario("s4", true)
const s4b = mediaScenario("s4b", false)
const s5 = compactionScenario("s5", 1_600)
const s5b = compactionScenario("s5b")
const s6 = nativeScenario("s6")

const scenarios: ReadonlyArray<Scenario> = [
  {
    id: "S0",
    boundary: "latest",
    seed: s0,
    shape: shapeOf({}),
    expected: expectedOf(shapeOf({}), {
      entries: 0,
      firstType: "none",
      retainedText: false,
      hydratedMedia: false,
      nativeCompaction: false,
    }),
    selectFromSeq: 0,
  },
  {
    id: "S1",
    boundary: "latest",
    seed: s1,
    shape: shapeOf({ messages: 20, assistants: 20, parts: 20, selectedAssistants: 20 }),
    expected: expectedOf(shapeOf({ messages: 20, assistants: 20, parts: 20 }), {
      entries: 20,
      firstType: "assistant",
      retainedText: false,
      hydratedMedia: false,
      nativeCompaction: false,
    }),
    selectFromSeq: 0,
  },
  {
    id: "S2a",
    boundary: "latest",
    seed: s2a,
    shape: shapeOf({ messages: 500, assistants: 500, parts: 500, selectedAssistants: 500 }),
    expected: expectedOf(shapeOf({ messages: 500, assistants: 500, parts: 500 }), {
      entries: 500,
      firstType: "assistant",
      retainedText: false,
      hydratedMedia: false,
      nativeCompaction: false,
    }),
    selectFromSeq: 0,
  },
  {
    id: "S2",
    boundary: "latest",
    seed: s2,
    shape: shapeOf({ messages: 2_000, assistants: 2_000, parts: 2_000, selectedAssistants: 2_000 }),
    expected: expectedOf(shapeOf({ messages: 2_000, assistants: 2_000, parts: 2_000 }), {
      entries: 2_000,
      firstType: "assistant",
      retainedText: false,
      hydratedMedia: false,
      nativeCompaction: false,
    }),
    selectFromSeq: 0,
  },
  {
    id: "S3",
    boundary: "latest",
    seed: s3,
    shape: shapeOf({ messages: 500, assistants: 500, parts: 10_000, selectedAssistants: 500 }),
    expected: expectedOf(shapeOf({ messages: 500, assistants: 500, parts: 10_000 }), {
      entries: 500,
      firstType: "assistant",
      retainedText: false,
      hydratedMedia: false,
      nativeCompaction: false,
    }),
    selectFromSeq: 0,
  },
  {
    id: "S4",
    boundary: "latest",
    seed: s4,
    shape: shapeOf({ messages: 200, blobs: 50, blobHashes: 50 }),
    expected: expectedOf(shapeOf({ messages: 200, blobs: 50 }), {
      entries: 200,
      firstType: "user",
      retainedText: false,
      hydratedMedia: true,
      nativeCompaction: false,
    }),
    selectFromSeq: 0,
  },
  {
    id: "S4b",
    boundary: "latest",
    seed: s4b,
    shape: shapeOf({ messages: 200 }),
    expected: expectedOf(shapeOf({ messages: 200 }), {
      entries: 200,
      firstType: "user",
      retainedText: false,
      hydratedMedia: false,
      nativeCompaction: false,
    }),
    selectFromSeq: 0,
  },
  {
    id: "S5",
    boundary: "latest",
    seed: s5,
    shape: shapeOf({
      messages: 2_000,
      assistants: 999,
      compactions: 1,
      selectedAssistants: 100,
      retainedAssistants: 100,
      hasKeepID: true,
    }),
    expected: expectedOf(shapeOf({ messages: 2_000, assistants: 999, compactions: 1 }), {
      entries: 201,
      firstType: "compaction",
      retainedText: true,
      hydratedMedia: false,
      nativeCompaction: false,
    }),
    selectFromSeq: 1_800,
  },
  {
    id: "S5b",
    boundary: "latest",
    seed: s5b,
    shape: shapeOf({
      messages: 2_000,
      assistants: 999,
      compactions: 1,
      selectedAssistants: 100,
    }),
    expected: expectedOf(shapeOf({ messages: 2_000, assistants: 999, compactions: 1 }), {
      entries: 201,
      firstType: "compaction",
      retainedText: false,
      hydratedMedia: false,
      nativeCompaction: false,
    }),
    selectFromSeq: 1_800,
  },
  {
    id: "S6",
    boundary: "latest",
    seed: s6,
    shape: shapeOf({ messages: 2_000, assistants: 999, compactions: 1, selectedAssistants: 50 }),
    expected: expectedOf(shapeOf({ messages: 2_000, assistants: 999, compactions: 1 }), {
      entries: 101,
      firstType: "compaction",
      retainedText: false,
      hydratedMedia: false,
      nativeCompaction: true,
    }),
    selectFromSeq: 1_900,
  },
  {
    id: "S6-latest",
    boundary: "latest",
    seed: s6,
    shape: shapeOf({ messages: 2_000, assistants: 999, compactions: 1, selectedAssistants: 50 }),
    expected: expectedOf(shapeOf({ messages: 2_000, assistants: 999, compactions: 1 }), {
      entries: 101,
      firstType: "compaction",
      retainedText: false,
      hydratedMedia: false,
      nativeCompaction: true,
    }),
    selectFromSeq: 1_900,
  },
  {
    id: "S6-match",
    boundary: testModel,
    seed: s6,
    shape: shapeOf({ messages: 2_000, assistants: 999, compactions: 1, selectedAssistants: 50 }),
    expected: expectedOf(shapeOf({ messages: 2_000, assistants: 999, compactions: 1 }), {
      entries: 101,
      firstType: "compaction",
      retainedText: false,
      hydratedMedia: false,
      nativeCompaction: true,
    }),
    selectFromSeq: 1_900,
  },
  {
    id: "S6-local",
    boundary: "local",
    seed: s6,
    shape: shapeOf({ messages: 2_000, assistants: 999, compactions: 1, selectedAssistants: 999 }),
    expected: expectedOf(shapeOf({ messages: 2_000, assistants: 999, compactions: 1 }), {
      entries: 1_999,
      firstType: "user",
      retainedText: false,
      hydratedMedia: false,
      nativeCompaction: false,
    }),
    selectFromSeq: 0,
  },
  {
    id: "S6-mismatch",
    boundary: otherModel,
    seed: s6,
    shape: shapeOf({ messages: 2_000, assistants: 999, compactions: 1, selectedAssistants: 999 }),
    expected: expectedOf(shapeOf({ messages: 2_000, assistants: 999, compactions: 1 }), {
      entries: 1_999,
      firstType: "user",
      retainedText: false,
      hydratedMedia: false,
      nativeCompaction: false,
    }),
    selectFromSeq: 0,
  },
]

const scenarioByID = (id: string) => {
  const scenario = scenarios.find((candidate) => candidate.id === id)
  if (scenario === undefined) throw new Error(`Unknown scenario: ${id}`)
  return scenario
}

const sessionRow = (sessionID: SessionID) => ({
  id: sessionID,
  project_id: Project.ID.global,
  directory: worktree,
  slug: "bench",
  version: "bench",
  time_created: created(0),
  time_updated: created(0),
})

const seedScenario = (db: DatabaseService, seed: Seed) =>
  Effect.gen(function* () {
    yield* db.insert(SessionTable).values(sessionRow(seed.sessionID)).run()
    yield* db
      .insert(InstructionStateTable)
      .values({
        session_id: seed.sessionID,
        epoch_start: 0,
        through_seq: 0,
        initial_values: {},
        current_values: {},
      })
      .run()
    yield* Effect.forEach(chunk(seed.messages, 400), (batch) => db.insert(SessionMessageTable).values(batch).run(), {
      discard: true,
    })
    if (seed.parts.length > 0)
      yield* Effect.forEach(chunk(seed.parts, 200), (batch) => db.insert(SessionPartTable).values(batch).run(), {
        discard: true,
      })
    if (seed.blobs.length > 0) yield* db.insert(BlobTable).values([...seed.blobs]).run()
    if (seed.blobRefs.length > 0) yield* db.insert(BlobRefTable).values([...seed.blobRefs]).run()
  })

const seedAll = (db: DatabaseService) =>
  Effect.gen(function* () {
    yield* db
      .insert(ProjectTable)
      .values({ id: Project.ID.global, worktree: AbsolutePath.make(worktree), sandboxes: [] })
      .onConflictDoNothing()
      .run()
    const seeds = [...new Map(scenarios.map((scenario) => [scenario.seed.sessionID, scenario.seed])).values()]
    yield* Effect.forEach(seeds, (seed) => seedScenario(db, seed), { discard: true })
  })

const countRows = (db: DatabaseService, table: SQLiteTable, where: SQL | undefined) =>
  db
    .select({ value: sql<number>`count(*)` })
    .from(table)
    .where(where)
    .get()
    .pipe(Effect.map((row) => row?.value ?? 0))

const readCounts = (db: DatabaseService, sessionID: SessionID) =>
  Effect.gen(function* () {
    const session = eq(SessionMessageTable.session_id, sessionID)
    const messages = yield* countRows(db, SessionMessageTable, session)
    const assistants = yield* countRows(db, SessionMessageTable, and(session, eq(SessionMessageTable.type, "assistant")))
    const compactions = yield* countRows(db, SessionMessageTable, and(session, eq(SessionMessageTable.type, "compaction")))
    const parts = yield* countRows(db, SessionPartTable, eq(SessionPartTable.session_id, sessionID))
    const blobs = yield* countRows(db, BlobRefTable, eq(BlobRefTable.session_id, sessionID))
    return { messages, assistants, compactions, parts, blobs }
  })

type Counts = Effect.Success<ReturnType<typeof readCounts>>

const assertEqual = (scenarioID: string, field: string, expected: unknown, actual: unknown) => {
  if (expected !== actual)
    throw new Error(`${scenarioID}: ${field} expected ${String(expected)}, actual ${String(actual)}`)
}

const assertCounts = (scenario: Scenario, counts: Counts) => {
  assertEqual(scenario.id, "seeded message count", scenario.expected.messages, counts.messages)
  assertEqual(scenario.id, "seeded assistant count", scenario.expected.assistants, counts.assistants)
  assertEqual(scenario.id, "seeded part count", scenario.expected.parts, counts.parts)
  assertEqual(scenario.id, "seeded blob count", scenario.expected.blobs, counts.blobs)
  assertEqual(scenario.id, "seeded compaction count", scenario.expected.compactions, counts.compactions)
}

const runU1 = (db: DatabaseService, scenario: Scenario) =>
  SessionHistory.entriesForRunner(db, scenario.seed.sessionID, Instructions.empty, scenario.boundary)

const assertResult = (scenario: Scenario, result: Effect.Success<ReturnType<typeof runU1>>) => {
  assertEqual(scenario.id, "entry count", scenario.expected.entries, result.entries.length)
  assertEqual(scenario.id, "first entry type", scenario.expected.firstType, result.entries[0]?.message.type ?? "none")
  const retainedText = result.entries.some(
    (entry) =>
      entry.message.type === "compaction" &&
      typeof entry.message.metadata?.recent === "string" &&
      entry.message.metadata.recent.length > 0,
  )
  assertEqual(scenario.id, "retained-text presence", scenario.expected.retainedText, retainedText)
  const hydratedMedia = result.entries.some(
    (entry) => entry.message.type === "user" && entry.message.files?.some((file) => "data" in file) === true,
  )
  assertEqual(scenario.id, "hydrated media presence", scenario.expected.hydratedMedia, hydratedMedia)
  const nativeCompaction = result.entries.some((entry) => SessionHistory.isNativeCompaction(entry.message))
  assertEqual(scenario.id, "native compaction presence", scenario.expected.nativeCompaction, nativeCompaction)
}

const percentile = (sorted: ReadonlyArray<number>, p: number) =>
  sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))] ?? 0

const round = (value: number) => Math.round(value * 1_000) / 1_000

const summarize = (samples: ReadonlyArray<number>): Timing => {
  const sorted = [...samples].sort((left, right) => left - right)
  return {
    median: round(percentile(sorted, 50)),
    p95: round(percentile(sorted, 95)),
    mean: round(samples.reduce((total, value) => total + value, 0) / samples.length),
    min: round(sorted[0] ?? 0),
    max: round(sorted.at(-1) ?? 0),
    samples: samples.length,
  }
}

const measure = (effect: () => Effect.Effect<unknown, unknown>, warmupCount: number, iterationCount: number) =>
  Effect.gen(function* () {
    yield* Effect.forEach(Array.from({ length: warmupCount }), () => effect(), { discard: true })
    const samples = yield* Effect.forEach(
      Array.from({ length: iterationCount }),
      () =>
        Effect.gen(function* () {
          const start = performance.now()
          yield* effect()
          return performance.now() - start
        }),
      { concurrency: 1 },
    )
    return summarize(samples)
  })

const measureMemory = (effect: () => Effect.Effect<{ readonly entries: ReadonlyArray<unknown> }>) =>
  Effect.gen(function* () {
    Bun.gc(true)
    Bun.gc(true)
    const before = process.memoryUsage()
    const result = yield* effect()
    const entries = result.entries.length
    Bun.gc(true)
    Bun.gc(true)
    const after = process.memoryUsage()
    return {
      retainedHeapBytes: after.heapUsed - before.heapUsed,
      rssBytes: after.rss,
      rssDeltaBytes: after.rss - before.rss,
      entries,
    }
  })

const readRawRows = (db: DatabaseService, scenario: Scenario) =>
  db
    .select()
    .from(SessionMessageTable)
    .where(
      and(
        eq(SessionMessageTable.session_id, scenario.seed.sessionID),
        scenario.selectFromSeq === 0 ? undefined : gte(SessionMessageTable.seq, scenario.selectFromSeq),
      ),
    )
    .orderBy(asc(SessionMessageTable.seq))
    .all()
    .pipe(Effect.orDie)

const busStub: Bus.Interface = {
  publish: () => Effect.die(new Error("bus.publish is not expected in the phase benchmark")),
  publishAll: () => Effect.die(new Error("bus.publishAll is not expected in the phase benchmark")),
  subscribe: () => Stream.empty,
  log: () => Stream.empty,
  listen: () => Effect.die(new Error("bus.listen is not expected in the phase benchmark")),
  project: () => Effect.die(new Error("bus.project is not expected in the phase benchmark")),
  replay: () => Effect.die(new Error("bus.replay is not expected in the phase benchmark")),
  remove: () => Effect.die(new Error("bus.remove is not expected in the phase benchmark")),
  claim: () => Effect.die(new Error("bus.claim is not expected in the phase benchmark")),
}

interface PhaseResult {
  readonly u1: Timing
  readonly u2: Timing
  readonly u3: Timing
  readonly u4: Timing
  readonly u5: Timing
  readonly u6: Timing
  readonly u7: Timing
  readonly rows: number
}

const measurePhases = (db: DatabaseService, scenario: Scenario, u1: Timing): Effect.Effect<PhaseResult, unknown> =>
  Effect.gen(function* () {
    const rows = yield* readRawRows(db, scenario)
    const sessionID = scenario.seed.sessionID
    const u2 = yield* measure(() => SessionHistory.load(db, sessionID, scenario.boundary), warmups, iterations)
    const u3 = yield* measure(() => InstructionState.initial(db, sessionID, Instructions.empty), warmups, iterations)
    const u4 = yield* measure(() => SessionBlob.hydrate(db, rows), warmups, iterations)
    const u5 = yield* measure(() => withParts(db, rows), warmups, iterations)
    const u6 = yield* measure(() => readRawRows(db, scenario), warmups, iterations)
    const u7 = yield* measure(
      () => InstructionState.prepare(db, busStub, Instructions.empty, sessionID),
      warmups,
      iterations,
    )
    return { u1, u2, u3, u4, u5, u6, u7, rows: rows.length }
  })

const measureScenario = (db: DatabaseService, scenario: Scenario) =>
  Effect.gen(function* () {
    const counts = yield* readCounts(db, scenario.seed.sessionID)
    assertCounts(scenario, counts)
    const first = yield* runU1(db, scenario)
    assertResult(scenario, first)
    const timing = yield* measure(() => runU1(db, scenario), warmups, iterations)
    const memory = yield* measureMemory(() => runU1(db, scenario))
    return { id: scenario.id, shape: scenario.shape, queries: derivedQueries(scenario.shape), timing, memory }
  })

interface ProfileFrame {
  readonly sourceID: number
  readonly name: string
  readonly location: string
  readonly sourceURL?: string
  readonly line?: number
  readonly column?: number
  readonly category?: string
}

interface ProfileTrace {
  readonly timestamp: number
  readonly frames: ReadonlyArray<ProfileFrame>
}

interface Profile {
  readonly interval: number
  readonly traces: ReadonlyArray<ProfileTrace>
}

const profileTarget = (frame: ProfileFrame) => {
  const names = [
    "latestCompaction",
    "decodeMessageRow",
    "withRecentText",
    "withParts",
    "hydrate",
    "initial",
    "prepare",
    "entriesForRunner",
    "messageEntries",
    "load",
  ]
  const name = names.find((candidate) => frame.name === candidate || frame.name.endsWith(`.${candidate}`))
  if (name !== undefined) return name
  const source = frame.sourceURL?.replaceAll("\\", "/")
  if (source?.endsWith("session/history.ts") && frame.line !== undefined && frame.line >= 220 && frame.line <= 223)
    return "filter"
  if (source?.includes("effect-sqlite") || frame.name.toLowerCase().includes("transaction")) return "transaction"
  return undefined
}

const aggregateProfile = (profile: Profile) => {
  const intervalMs = profile.interval * 1_000
  const self = new Map<string, number>()
  const inclusive = new Map<string, number>()
  for (const trace of profile.traces) {
    const top = trace.frames[0]
    if (top !== undefined) {
      const key = top.name === "" ? "(anonymous)" : top.name
      self.set(key, (self.get(key) ?? 0) + intervalMs)
    }
    const seen = new Set<string>()
    for (const frame of trace.frames) {
      const target = profileTarget(frame)
      if (target === undefined || seen.has(target)) continue
      seen.add(target)
      inclusive.set(target, (inclusive.get(target) ?? 0) + intervalMs)
    }
  }
  const sort = (values: Map<string, number>) =>
    [...values].sort((left, right) => right[1] - left[1]).map(([name, ms]) => ({ name, ms: round(ms) }))
  return {
    samples: profile.traces.length,
    intervalMs,
    self: sort(self).slice(0, 15),
    inclusive: sort(inclusive),
  }
}

const profileProgram = Effect.gen(function* () {
  const { db } = yield* Database.Service
  yield* runU1(db, scenarioByID("S2"))
  yield* runU1(db, scenarioByID("S3"))
  startSamplingProfiler()
  yield* Effect.forEach(Array.from({ length: 30 }), () => runU1(db, scenarioByID("S2")), { discard: true })
  yield* Effect.forEach(Array.from({ length: 30 }), () => runU1(db, scenarioByID("S3")), { discard: true })
})

const run = <A, E>(program: Effect.Effect<A, E, Database.Service>) =>
  Effect.runPromise(program.pipe(Effect.provide(databaseLayer), Effect.provide(Logger.layer([]))))

const environment = {
  platform: process.platform,
  arch: process.arch,
  os: `${os.type()} ${os.release()}`,
  cpu: os.cpus()[0]?.model ?? "unknown",
  cpuCount: os.cpus().length,
  ramBytes: os.totalmem(),
  bun: Bun.version,
  commit: commit(),
  database: databasePath,
  tempRoot,
  iterations,
  warmups,
}

const main = async () => {
  console.log("session context benchmark")
  console.log(
    `  ${environment.os} | ${environment.cpu} | ${(environment.ramBytes / 1024 ** 3).toFixed(1)} GiB | Bun ${environment.bun}`,
  )
  console.log(`  commit ${environment.commit}`)
  console.log(`  database ${environment.database}`)
  console.log(`  warm-ups ${warmups}, measured iterations ${iterations}`)

  const measured = await run(
    Effect.gen(function* () {
      const { db } = yield* Database.Service
      yield* seedAll(db)
      const results = yield* Effect.forEach(scenarios, (scenario) => measureScenario(db, scenario), {
        concurrency: 1,
      })
      const phases = {
        S2: yield* measurePhases(db, scenarioByID("S2"), results.find((result) => result.id === "S2")!.timing),
        S3: yield* measurePhases(db, scenarioByID("S3"), results.find((result) => result.id === "S3")!.timing),
      }
      return { results, phases }
    }),
  )

  const cold = new Map<string, number>()
  for (const scenario of scenarios) {
    const result = await run(
      Effect.gen(function* () {
        const { db } = yield* Database.Service
        const start = performance.now()
        const value = yield* runU1(db, scenario)
        return { ms: performance.now() - start, entries: value.entries.length }
      }),
    )
    assertEqual(scenario.id, "cold entry count", scenario.expected.entries, result.entries)
    cold.set(scenario.id, round(result.ms))
  }

  const results: ScenarioResult[] = measured.results.map((result) => ({
    ...result,
    coldMs: cold.get(result.id) ?? 0,
  }))

  const byID = new Map(results.map((result) => [result.id, result]))
  const require = (id: string) => {
    const result = byID.get(id)
    if (result === undefined) throw new Error(`Missing scenario result: ${id}`)
    return result
  }
  const retainedTextDelta = {
    median: round(require("S5").timing.median - require("S5b").timing.median),
    p95: round(require("S5").timing.p95 - require("S5b").timing.p95),
  }
  const mediaDelta = {
    median: round(require("S4").timing.median - require("S4b").timing.median),
    p95: round(require("S4").timing.p95 - require("S4b").timing.p95),
  }
  const scalingRatio = round(require("S2").timing.p95 / Math.max(require("S2a").timing.p95, 0.001))

  const materialReasons: string[] = []
  if (require("S2").timing.p95 >= 100) materialReasons.push(`S2 U1 p95 ${require("S2").timing.p95} ms >= 100 ms`)
  if (require("S3").timing.p95 >= 100) materialReasons.push(`S3 U1 p95 ${require("S3").timing.p95} ms >= 100 ms`)
  if (scalingRatio > 4.5) materialReasons.push(`S2/S2a p95 ratio ${scalingRatio} > 4.5`)
  if (retainedTextDelta.p95 >= 50) materialReasons.push(`retained-text delta p95 ${retainedTextDelta.p95} ms >= 50 ms`)
  if (mediaDelta.p95 >= 50) materialReasons.push(`media delta p95 ${mediaDelta.p95} ms >= 50 ms`)
  const inconclusiveReasons = ["S2", "S3"].flatMap((id) => {
    const timing = require(id).timing
    const ratio = timing.median === 0 ? Number.POSITIVE_INFINITY : timing.p95 / timing.median
    return ratio > 2 ? [`${id} p95/median ${round(ratio)} > 2`] : []
  })
  const verdict =
    inconclusiveReasons.length > 0 ? "Inconclusive" : materialReasons.length > 0 ? "Material" : "Not material"

  const profile = profilePath === undefined ? undefined : await (async () => {
    await run(profileProgram)
    const raw = samplingProfilerStackTraces()
    const aggregated = aggregateProfile(raw)
    await Bun.write(profilePath, JSON.stringify({ ...aggregated, raw }, null, 2))
    return aggregated
  })()

  const mib = (bytes: number) => round(bytes / 1024 / 1024)
  console.log("")
  console.log(
    "scenario".padEnd(12) +
      "median".padStart(9) +
      "p95".padStart(9) +
      "mean".padStart(9) +
      "min".padStart(9) +
      "max".padStart(9) +
      "cold".padStart(9) +
      "heap MiB".padStart(11) +
      "rss MiB".padStart(10) +
      "queries".padStart(9),
  )
  for (const result of results) {
    console.log(
      result.id.padEnd(12) +
        result.timing.median.toFixed(2).padStart(9) +
        result.timing.p95.toFixed(2).padStart(9) +
        result.timing.mean.toFixed(2).padStart(9) +
        result.timing.min.toFixed(2).padStart(9) +
        result.timing.max.toFixed(2).padStart(9) +
        result.coldMs.toFixed(2).padStart(9) +
        mib(result.memory.retainedHeapBytes).toFixed(2).padStart(11) +
        mib(result.memory.rssBytes).toFixed(2).padStart(10) +
        String(result.queries.total).padStart(9),
    )
  }

  console.log("")
  console.log("phase breakdown (ms, p95)")
  console.log("scenario".padEnd(10) + "U1".padStart(9) + "U2".padStart(9) + "U3".padStart(9) + "U4".padStart(9) + "U5".padStart(9) + "U6".padStart(9) + "U7".padStart(9))
  for (const [id, phase] of Object.entries(measured.phases)) {
    console.log(
      id.padEnd(10) +
        phase.u1.p95.toFixed(2).padStart(9) +
        phase.u2.p95.toFixed(2).padStart(9) +
        phase.u3.p95.toFixed(2).padStart(9) +
        phase.u4.p95.toFixed(2).padStart(9) +
        phase.u5.p95.toFixed(2).padStart(9) +
        phase.u6.p95.toFixed(2).padStart(9) +
        phase.u7.p95.toFixed(2).padStart(9),
    )
  }
  console.log(`  U1 entriesForRunner, U2 SessionHistory.load, U3 InstructionState.initial, U4 SessionBlob.hydrate,`)
  console.log(`  U5 withParts, U6 raw message select (lower bound), U7 InstructionState.prepare`)
  console.log(`  derived transaction overhead (U1 - U2 - U3) S2 ${round(measured.phases.S2.u1.p95 - measured.phases.S2.u2.p95 - measured.phases.S2.u3.p95)} ms, S3 ${round(measured.phases.S3.u1.p95 - measured.phases.S3.u2.p95 - measured.phases.S3.u3.p95)} ms`)
  console.log(`  retained-text delta (S5 - S5b) median ${retainedTextDelta.median} ms, p95 ${retainedTextDelta.p95} ms`)
  console.log(`  media delta (S4 - S4b) median ${mediaDelta.median} ms, p95 ${mediaDelta.p95} ms`)
  console.log(`  scaling ratio S2/S2a p95 ${scalingRatio} for a 4x message increase`)

  if (profile !== undefined) {
    console.log("")
    console.log(`cpu profile: ${profile.samples} samples at ${profile.intervalMs} ms`)
    console.log("  inclusive attribution (ms)")
    for (const entry of profile.inclusive) console.log(`    ${entry.name.padEnd(20)} ${entry.ms.toFixed(2).padStart(9)}`)
    console.log("  top self time (ms)")
    for (const entry of profile.self) console.log(`    ${entry.name.padEnd(40)} ${entry.ms.toFixed(2).padStart(9)}`)
  }

  console.log("")
  console.log(`verdict: ${verdict}`)
  for (const reason of materialReasons) console.log(`  material: ${reason}`)
  for (const reason of inconclusiveReasons) console.log(`  inconclusive: ${reason}`)
  if (materialReasons.length === 0 && inconclusiveReasons.length === 0)
    console.log("  no materiality threshold was met")

  const output = {
    environment,
    scenarios: results.map((result) => ({
      id: result.id,
      shape: result.shape,
      queries: result.queries,
      timing: result.timing,
      memory: result.memory,
      coldMs: result.coldMs,
    })),
    phases: measured.phases,
    deltas: { retainedText: retainedTextDelta, media: mediaDelta },
    scalingRatio,
    verdict: { verdict, materialReasons, inconclusiveReasons },
    profile,
  }

  if (jsonPath !== undefined) {
    await Bun.write(jsonPath, JSON.stringify(output, null, 2))
    console.log(`json written to ${jsonPath}`)
  }

  if (keep) console.log(`kept ${tempRoot}`)
  else await rm(tempRoot, { recursive: true, force: true }).catch(() => undefined)
}

await main()
