import type { BunPlugin } from "bun"
import path from "node:path"

export async function windowsOpenTui(arch: string) {
  const source = path.join(
    path.dirname(
      Bun.resolveSync(`@opentui/core-win32-${arch}`, path.dirname(Bun.resolveSync("@opentui/core", import.meta.dir))),
    ),
    "opentui.dll",
  )
  // A new DLL can be installed while Windows still has the previous version loaded.
  const name = `opentui-${new Bun.CryptoHasher("sha256")
    .update(await Bun.file(source).bytes())
    .digest("hex")
    .slice(0, 16)}.dll`
  const plugin: BunPlugin = {
    name: "opencode-windows-opentui",
    setup(build) {
      build.onLoad({ filter: new RegExp(`core-win32-${arch}[/\\\\]index\\.bun\\.js$`) }, () => ({
        loader: "js",
        contents: `import embedded from ${JSON.stringify(source.replaceAll("\\", "/"))} with { type: "file" }
import { existsSync } from "node:fs"
import path from "node:path"
const sidecar = path.join(path.dirname(process.execPath), ${JSON.stringify(name)})
export default existsSync(sidecar) ? sidecar : embedded`,
      }))
    },
  }
  return { source, name, plugin }
}
