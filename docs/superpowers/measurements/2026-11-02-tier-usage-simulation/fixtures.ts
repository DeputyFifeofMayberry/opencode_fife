import { mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"

const root = path.join(import.meta.dir, "data", "sandbox")

const files: Record<string, string> = {
  "2/guard.ts": `export const first = (input: unknown) => (input as string[])[0]\n`,
  "3/target.ts": `export const target = (x: number) => x * 2\n`,
  "4/rename.ts": `const tmp = (n: number) => n + 1\nexport const use = () => tmp(2)\n`,
  "5/doc.ts": `export const documented = (x: string) => x.trim()\n`,
  "6/config.ts": `export const config = { retries: 3 }\n`,
  "7/broken.ts": `export const broken = (x: number): string => x\n`,
  "8/schema.ts": `export type Shape = { width: number; height: number }\n`,
}

for (const [file, content] of Object.entries(files)) {
  const full = path.join(root, file)
  mkdirSync(path.dirname(full), { recursive: true })
  writeFileSync(full, content)
}
mkdirSync(path.join(root, "1"), { recursive: true })
console.log(JSON.stringify({ created: Object.keys(files).length, root }, null, 2))
