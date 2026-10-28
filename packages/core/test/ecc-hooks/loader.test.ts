import "./host-runtime"
import { expect, test } from "bun:test"
import { Host } from "@opencode/plugin/host"
import path from "node:path"
import { fixture } from "./fixture"
import { tmpdir } from "../fixture/tmpdir"

const plugin = (await import("../../../../.opencode/ecc/plugin/index")).default

test("the local directory resolves to one native plugin definition", async () => {
  const directory = path.resolve(import.meta.dir, "../../../../.opencode/ecc/plugin")
  const entry = Host.resolve({ directory }).server
  expect(entry).toBeDefined()
  const module = (await Host.load(entry!)) as { default: typeof plugin }
  expect(module.default.id).toBe("ecc.fife")
  expect(typeof module.default.setup).toBe("function")
})

test("missing or false enablement registers nothing", async () => {
  await using dir = await tmpdir()
  for (const options of [{}, { enabled: false }]) {
    await using app = await fixture(plugin, dir.path, options)
    expect(app.tool.size() + app.shell.size() + app.session.size()).toBe(0)
  }
})

test("enabled hooks register through the native Promise adapter and dispose on unload", async () => {
  await using dir = await tmpdir()
  const app = await fixture(plugin, dir.path)
  try {
    expect(app.tool.size()).toBe(2)
    expect(app.shell.size()).toBe(1)
    expect(app.session.size()).toBe(1)
  } finally {
    await app.close()
  }
  expect(app.tool.size() + app.shell.size() + app.session.size()).toBe(0)
})

test("a required registration failure awaits disposal of earlier registrations", async () => {
  await using dir = await tmpdir()
  const observed = { active: 0 }
  const failing = {
    id: plugin.id,
    setup: async (ctx: Parameters<typeof plugin.setup>[0]) =>
      plugin.setup({
        ...ctx,
        shell: {
          hook: async (name, callback) => {
            const registration = await ctx.shell.hook(name, callback)
            observed.active++
            return {
              dispose: async () => {
                await registration.dispose()
                observed.active--
              },
            }
          },
        },
        session: {
          ...ctx.session,
          hook: async () => {
            throw new Error("registration denied")
          },
        },
      }),
  }
  await expect(fixture(failing, dir.path)).rejects.toThrow("registration denied")
  expect(observed.active).toBe(0)
})
