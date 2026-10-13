import fs from "fs/promises"
import path from "path"
import { describe, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { AppNodeBuilder } from "@opencode/core/effect/app-node-builder"
import { LayerNode } from "@opencode/util/effect/layer-node"
import { Environment } from "@opencode/core/environment/index"
import { FileMutation } from "@opencode/core/file-mutation"
import { FileStamp } from "@opencode/core/file-stamp"
import { Formatter } from "@opencode/core/formatter"
import { Location } from "@opencode/core/location"
import { FileAccess } from "@opencode/core/file-access"
import { Permission } from "@opencode/core/permission"
import { AbsolutePath } from "@opencode/core/schema"
import { Session } from "@opencode/core/session"
import { SessionInstructions } from "@opencode/core/session/instructions"
import { Tool } from "@opencode/core/tool"
import { EditTool } from "@opencode/core/tool/plugin/edit"
import { PatchTool } from "@opencode/core/tool/plugin/patch"
import { ReadTool } from "@opencode/core/tool/plugin/read"
import { WriteTool } from "@opencode/core/tool/plugin/write"
import { ReadToolFileSystem } from "@opencode/core/tool/read-filesystem"
import { transformEnvironmentFiles } from "./fixture/environment"
import { location } from "./fixture/location"
import { withTempDir } from "./fixture/tmpdir"
import { makeLocationNode } from "@opencode/util/effect/app-node"
import { FSUtil } from "@opencode/util/fs-util"
import { testEffect } from "./lib/effect"
import { permissionLayer } from "./lib/permission"
import { toolIdentity, executeTool, registerToolPlugin } from "./lib/tool"

const toolsNode = makeLocationNode({
  name: "test/stale-edit-tools",
  layer: Layer.effectDiscard(
    Effect.all(
      [
        registerToolPlugin(ReadTool.Plugin),
        registerToolPlugin(EditTool.Plugin),
        registerToolPlugin(WriteTool.Plugin),
        registerToolPlugin(PatchTool.Plugin),
      ],
      { discard: true },
    ),
  ),
  deps: [
    Tool.node,
    ReadToolFileSystem.node,
    FileAccess.node,
    FileMutation.node,
    FileStamp.node,
    Environment.node,
    Formatter.node,
    Location.node,
    Permission.node,
    SessionInstructions.node,
    FSUtil.node,
  ],
})

const sessionID = Session.ID.make("ses_stale_edit_test")

const sessionInstructions = Layer.succeed(
  SessionInstructions.Service,
  SessionInstructions.Service.of({ load: () => Effect.void }),
)

const withTool = <A, E, R>(
  directory: string,
  body: (registry: Tool.Interface) => Effect.Effect<A, E, R>,
  assert: Permission.Interface["assert"] = () => Effect.void,
) => {
  const activeLocation = Layer.succeed(
    Location.Service,
    Location.Service.of(location({ directory: AbsolutePath.make(directory) })),
  )
  return Effect.gen(function* () {
    const registry = yield* Tool.Service
    return yield* body(registry)
  }).pipe(
    Effect.provide(
      AppNodeBuilder.build(
        LayerNode.group([
          Tool.node,
          FileAccess.node,
          FileMutation.node,
          FileStamp.node,
          ReadToolFileSystem.node,
          FSUtil.node,
          toolsNode,
        ]),
        [
          Environment.node.replace(transformEnvironmentFiles()),
          Location.node.replace(activeLocation),
          Formatter.node.replace(Layer.mock(Formatter.Service, { file: () => Effect.succeed(false) })),
          Permission.node.replace(permissionLayer({ assert })),
          SessionInstructions.node.replace(sessionInstructions),
        ],
      ),
    ),
  )
}

const call = (name: string, input: Record<string, unknown>, id: string) => ({
  sessionID,
  ...toolIdentity,
  call: { type: "tool-call" as const, id, name, input },
})

const it = testEffect(Layer.empty)

describe("StaleEditGuard", () => {
  const readThroughTool = (registry: Tool.Interface, target: string) =>
    executeTool(registry, call("read", { path: target }, "call-read"))

  it.live("allows an edit right after a fresh read", () =>
    withTempDir((tmp) => {
      const target = path.join(tmp.path, "hello.txt")
      return Effect.promise(() => fs.writeFile(target, "before\n")).pipe(
        Effect.andThen(
          withTool(tmp.path, (registry) =>
            Effect.gen(function* () {
              expect((yield* readThroughTool(registry, "hello.txt")).status).toBe("completed")
              const settled = yield* executeTool(
                registry,
                call("edit", { path: "hello.txt", oldString: "before", newString: "after" }, "call-edit"),
              )
              expect(settled.status).toBe("completed")
              expect(yield* Effect.promise(() => fs.readFile(target, "utf8"))).toBe("after\n")
            }),
          ),
        ),
      )
    }),
  )

  it.live("refuses edit when the file changed externally after the read", () =>
    withTempDir((tmp) => {
      const target = path.join(tmp.path, "changed.txt")
      return Effect.promise(() => fs.writeFile(target, "before\n")).pipe(
        Effect.andThen(
          withTool(tmp.path, (registry) =>
            Effect.gen(function* () {
              expect((yield* readThroughTool(registry, "changed.txt")).status).toBe("completed")
              yield* Effect.promise(() => fs.writeFile(target, "external\n"))
              const settled = yield* executeTool(
                registry,
                call("edit", { path: "changed.txt", oldString: "before", newString: "after" }, "call-edit"),
              )
              expect(settled).toEqual({
                status: "error",
                error: {
                  type: "tool.execution",
                  message: "File changed.txt changed since you read it — re-read it and retry",
                },
              })
              expect(yield* Effect.promise(() => fs.readFile(target, "utf8"))).toBe("external\n")
            }),
          ),
        ),
      )
    }),
  )

  it.live("refuses write when the file changed externally after the read", () =>
    withTempDir((tmp) => {
      const target = path.join(tmp.path, "written.txt")
      return Effect.promise(() => fs.writeFile(target, "before\n")).pipe(
        Effect.andThen(
          withTool(tmp.path, (registry) =>
            Effect.gen(function* () {
              expect((yield* readThroughTool(registry, "written.txt")).status).toBe("completed")
              yield* Effect.promise(() => fs.writeFile(target, "external\n"))
              const settled = yield* executeTool(
                registry,
                call("write", { path: "written.txt", content: "after" }, "call-write"),
              )
              expect(settled).toEqual({
                status: "error",
                error: {
                  type: "tool.execution",
                  message: "File written.txt changed since you read it — re-read it and retry",
                },
              })
              expect(yield* Effect.promise(() => fs.readFile(target, "utf8"))).toBe("external\n")
            }),
          ),
        ),
      )
    }),
  )

  it.live("refuses patch when the file changed externally after the read", () =>
    withTempDir((tmp) => {
      const target = path.join(tmp.path, "patched.txt")
      return Effect.promise(() => fs.writeFile(target, "before\n")).pipe(
        Effect.andThen(
          withTool(tmp.path, (registry) =>
            Effect.gen(function* () {
              expect((yield* readThroughTool(registry, "patched.txt")).status).toBe("completed")
              yield* Effect.promise(() => fs.writeFile(target, "external\n"))
              const settled = yield* executeTool(
                registry,
                call(
                  "patch",
                  { patchText: "*** Begin Patch\n*** Update File: patched.txt\n@@\n-before\n+after\n*** End Patch" },
                  "call-patch",
                ),
              )
              expect(settled).toEqual({
                status: "error",
                error: {
                  type: "tool.execution",
                  message: "File patched.txt changed since you read it — re-read it and retry",
                },
              })
              expect(yield* Effect.promise(() => fs.readFile(target, "utf8"))).toBe("external\n")
            }),
          ),
        ),
      )
    }),
  )

  it.live("keeps current behavior when the session never read the path", () =>
    withTempDir((tmp) => {
      const target = path.join(tmp.path, "unread.txt")
      return Effect.promise(() => fs.writeFile(target, "before\n")).pipe(
        Effect.andThen(
          withTool(tmp.path, (registry) =>
            Effect.gen(function* () {
              const settled = yield* executeTool(
                registry,
                call("edit", { path: "unread.txt", oldString: "before", newString: "after" }, "call-edit"),
              )
              expect(settled.status).toBe("completed")
              expect(yield* Effect.promise(() => fs.readFile(target, "utf8"))).toBe("after\n")
            }),
          ),
        ),
      )
    }),
  )

  it.live("allows an edit after an external rewrite with identical bytes", () =>
    withTempDir((tmp) => {
      const target = path.join(tmp.path, "touched.txt")
      return Effect.promise(() => fs.writeFile(target, "same\n")).pipe(
        Effect.andThen(
          withTool(tmp.path, (registry) =>
            Effect.gen(function* () {
              expect((yield* readThroughTool(registry, "touched.txt")).status).toBe("completed")
              // Rewrite identical bytes and force a different mtime so only the
              // content hash can clear the guard.
              yield* Effect.promise(() => fs.writeFile(target, "same\n"))
              const later = new Date(Date.now() + 5000)
              yield* Effect.promise(() => fs.utimes(target, later, later))
              const settled = yield* executeTool(
                registry,
                call("edit", { path: "touched.txt", oldString: "same", newString: "after" }, "call-edit"),
              )
              expect(settled.status).toBe("completed")
              expect(yield* Effect.promise(() => fs.readFile(target, "utf8"))).toBe("after\n")
            }),
          ),
        ),
      )
    }),
  )

  it.live("records a stamp when write creates a new file", () =>
    withTempDir((tmp) => {
      const target = path.join(tmp.path, "created.txt")
      return withTool(tmp.path, (registry) =>
        Effect.gen(function* () {
          const created = yield* executeTool(
            registry,
            call("write", { path: "created.txt", content: "created" }, "call-write"),
          )
          expect(created.status).toBe("completed")
          // The fresh stamp matches the written bytes, so a second write succeeds.
          const again = yield* executeTool(
            registry,
            call("write", { path: "created.txt", content: "rewritten" }, "call-write-2"),
          )
          expect(again.status).toBe("completed")
          expect(yield* Effect.promise(() => fs.readFile(target, "utf8"))).toBe("rewritten")
        }),
      )
    }),
  )

  it.live("allows a second edit after a successful edit without a re-read", () =>
    withTempDir((tmp) => {
      const target = path.join(tmp.path, "twice.txt")
      return Effect.promise(() => fs.writeFile(target, "one two\n")).pipe(
        Effect.andThen(
          withTool(tmp.path, (registry) =>
            Effect.gen(function* () {
              expect((yield* readThroughTool(registry, "twice.txt")).status).toBe("completed")
              const first = yield* executeTool(
                registry,
                call("edit", { path: "twice.txt", oldString: "one", newString: "ONE" }, "call-edit-1"),
              )
              expect(first.status).toBe("completed")
              const second = yield* executeTool(
                registry,
                call("edit", { path: "twice.txt", oldString: "two", newString: "TWO" }, "call-edit-2"),
              )
              expect(second.status).toBe("completed")
              expect(yield* Effect.promise(() => fs.readFile(target, "utf8"))).toBe("ONE TWO\n")
            }),
          ),
        ),
      )
    }),
  )

  it.live("clears the guard after the model re-reads the changed file", () =>
    withTempDir((tmp) => {
      const target = path.join(tmp.path, "reread.txt")
      return Effect.promise(() => fs.writeFile(target, "before\n")).pipe(
        Effect.andThen(
          withTool(tmp.path, (registry) =>
            Effect.gen(function* () {
              expect((yield* readThroughTool(registry, "reread.txt")).status).toBe("completed")
              yield* Effect.promise(() => fs.writeFile(target, "external\n"))
              const refused = yield* executeTool(
                registry,
                call("edit", { path: "reread.txt", oldString: "external", newString: "after" }, "call-edit-stale"),
              )
              expect(refused.status).toBe("error")
              expect((yield* readThroughTool(registry, "reread.txt")).status).toBe("completed")
              const settled = yield* executeTool(
                registry,
                call("edit", { path: "reread.txt", oldString: "external", newString: "after" }, "call-edit-fresh"),
              )
              expect(settled.status).toBe("completed")
              expect(yield* Effect.promise(() => fs.readFile(target, "utf8"))).toBe("after\n")
            }),
          ),
        ),
      )
    }),
  )

  it.live("applies multiple hunks on the same file end to end", () =>
    withTempDir((tmp) => {
      const target = path.join(tmp.path, "multi.txt")
      return Effect.promise(() => fs.writeFile(target, "alpha\nbeta\n")).pipe(
        Effect.andThen(
          withTool(tmp.path, (registry) =>
            Effect.gen(function* () {
              expect((yield* readThroughTool(registry, "multi.txt")).status).toBe("completed")
              const settled = yield* executeTool(
                registry,
                call(
                  "patch",
                  {
                    patchText:
                      "*** Begin Patch\n*** Update File: multi.txt\n@@\n-alpha\n+ALPHA\n*** Update File: multi.txt\n@@\n-beta\n+BETA\n*** End Patch",
                  },
                  "call-patch-multi",
                ),
              )
              if (settled.status !== "completed") expect(settled.error?.message).toBe("(no error expected)")
              expect(settled.status).toBe("completed")
              expect(yield* Effect.promise(() => fs.readFile(target, "utf8"))).toBe("ALPHA\nBETA\n")
            }),
          ),
        ),
      )
    }),
  )

  it.live("applies a patch delete followed by an add of the same path", () =>
    withTempDir((tmp) => {
      const target = path.join(tmp.path, "recycle.txt")
      return Effect.promise(() => fs.writeFile(target, "before\n")).pipe(
        Effect.andThen(
          withTool(tmp.path, (registry) =>
            Effect.gen(function* () {
              expect((yield* readThroughTool(registry, "recycle.txt")).status).toBe("completed")
              const settled = yield* executeTool(
                registry,
                call(
                  "patch",
                  {
                    patchText:
                      "*** Begin Patch\n*** Delete File: recycle.txt\n*** Add File: recycle.txt\n+recreated\n*** End Patch",
                  },
                  "call-patch-recycle",
                ),
              )
              expect(settled.status).toBe("completed")
              expect(yield* Effect.promise(() => fs.readFile(target, "utf8"))).toBe("recreated\n")
            }),
          ),
        ),
      )
    }),
  )

  it.live("refuses a move onto a read-stamped destination that changed externally", () =>
    withTempDir((tmp) => {
      const source = path.join(tmp.path, "moving.txt")
      const destination = path.join(tmp.path, "occupied.txt")
      return Effect.promise(() => Promise.all([fs.writeFile(source, "before\n"), fs.writeFile(destination, "old\n")])).pipe(
        Effect.andThen(
          withTool(tmp.path, (registry) =>
            Effect.gen(function* () {
              expect((yield* readThroughTool(registry, "occupied.txt")).status).toBe("completed")
              yield* Effect.promise(() => fs.writeFile(destination, "external\n"))
              const settled = yield* executeTool(
                registry,
                call(
                  "patch",
                  {
                    patchText:
                      "*** Begin Patch\n*** Update File: moving.txt\n*** Move to: occupied.txt\n@@\n-before\n+after\n*** End Patch",
                  },
                  "call-patch-move-stale",
                ),
              )
              expect(settled).toEqual({
                status: "error",
                error: {
                  type: "tool.execution",
                  message: "File occupied.txt changed since you read it — re-read it and retry",
                },
              })
              expect(yield* Effect.promise(() => fs.readFile(destination, "utf8"))).toBe("external\n")
              expect(yield* Effect.promise(() => fs.readFile(source, "utf8"))).toBe("before\n")
            }),
          ),
        ),
      )
    }),
  )

  it.live("moves to a fresh destination without a stamp", () =>
    withTempDir((tmp) => {
      const source = path.join(tmp.path, "moving.txt")
      const destination = path.join(tmp.path, "renamed.txt")
      return Effect.promise(() => fs.writeFile(source, "before\n")).pipe(
        Effect.andThen(
          withTool(tmp.path, (registry) =>
            Effect.gen(function* () {
              expect((yield* readThroughTool(registry, "moving.txt")).status).toBe("completed")
              const settled = yield* executeTool(
                registry,
                call(
                  "patch",
                  {
                    patchText:
                      "*** Begin Patch\n*** Update File: moving.txt\n*** Move to: renamed.txt\n@@\n-before\n+after\n*** End Patch",
                  },
                  "call-patch-move",
                ),
              )
              expect(settled.status).toBe("completed")
              expect(yield* Effect.promise(() => fs.readFile(destination, "utf8"))).toBe("after\n")
              expect(
                yield* Effect.promise(() =>
                  fs.access(source).then(
                    () => true,
                    () => false,
                  ),
                ),
              ).toBe(false)
            }),
          ),
        ),
      )
    }),
  )

  it.live("re-checks the stamp after the permission prompt before an edit", () =>
    withTempDir((tmp) => {
      const target = path.join(tmp.path, "prompted.txt")
      return Effect.promise(() => fs.writeFile(target, "before\n")).pipe(
        Effect.andThen(
          withTool(
            tmp.path,
            (registry) =>
              Effect.gen(function* () {
                expect((yield* readThroughTool(registry, "prompted.txt")).status).toBe("completed")
                const settled = yield* executeTool(
                  registry,
                  call("edit", { path: "prompted.txt", oldString: "before", newString: "after" }, "call-edit-prompt"),
                )
                expect(settled).toEqual({
                  status: "error",
                  error: {
                    type: "tool.execution",
                    message: "File prompted.txt changed since you read it — re-read it and retry",
                  },
                })
                expect(yield* Effect.promise(() => fs.readFile(target, "utf8"))).toBe("external\n")
              }),
            // The rewrite simulates a file changing while the edit permission prompt sat open.
            (input) =>
              input.action === "edit"
                ? Effect.promise(() => fs.writeFile(target, "external\n")).pipe(Effect.asVoid)
                : Effect.void,
          ),
        ),
      )
    }),
  )

  it.live("re-checks the stamp after the permission prompt before a write", () =>
    withTempDir((tmp) => {
      const target = path.join(tmp.path, "prompted-write.txt")
      return Effect.promise(() => fs.writeFile(target, "before\n")).pipe(
        Effect.andThen(
          withTool(
            tmp.path,
            (registry) =>
              Effect.gen(function* () {
                expect((yield* readThroughTool(registry, "prompted-write.txt")).status).toBe("completed")
                const settled = yield* executeTool(
                  registry,
                  call("write", { path: "prompted-write.txt", content: "after" }, "call-write-prompt"),
                )
                expect(settled).toEqual({
                  status: "error",
                  error: {
                    type: "tool.execution",
                    message: "File prompted-write.txt changed since you read it — re-read it and retry",
                  },
                })
                expect(yield* Effect.promise(() => fs.readFile(target, "utf8"))).toBe("external\n")
              }),
            (input) =>
              input.action === "edit"
                ? Effect.promise(() => fs.writeFile(target, "external\n")).pipe(Effect.asVoid)
                : Effect.void,
          ),
        ),
      )
    }),
  )
})
