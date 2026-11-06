// Measures withRegionEndings at fixed workloads. Run from packages/core:
//
//   bun run benchmark:edit
//
// The pre-change cost is a Uint32Array table sized (region lines + 1) * (replacement lines + 1).
// Bun 1.4.4 does not count `new Uint32Array` in process.memoryUsage().arrayBuffers, so the external
// delta is printed next to it; the analytical full-table column is the reliable allocation figure.
import { lineEnding, withRegionEndings } from "../src/tool/plugin/edit-endings"

const lines = (count: number, prefix: string) =>
  Array.from({ length: count }, (_, index) => `${prefix} ${index}`)

const joinWith = (values: string[], ending: (index: number) => string) =>
  values.map((line, index) => (index === values.length - 1 ? line : line + ending(index))).join("")

const uniform = (count: number, prefix: string, ending: string) => joinWith(lines(count, prefix), () => ending)

const mixed = (count: number, prefix: string) =>
  joinWith(lines(count, prefix), (index) => (index % 2 === 0 ? "\r\n" : "\n"))

const workload = (name: string, region: string, replacement: string) => ({
  name,
  region,
  replacement,
  fallback: lineEnding(region, "\n"),
})

const sizes = [1_000, 5_000, 10_000]
const mostlyUnchanged = () => {
  const before = lines(5_000, "line")
  const after = before.map((line, index) => (index === 2_500 ? "changed 2500" : line))
  return workload("mixed mostly unchanged 5000", mixed(5_000, "line"), after.join("\n"))
}
const heavilyChanged = () =>
  workload("mixed heavily changed 5000", mixed(5_000, "line"), lines(5_000, "changed").join("\n"))
const largeRegionSingleLine = () =>
  workload("large region one-line replacement 10000", mixed(10_000, "line"), "single line")

const workloads = [
  ...sizes.map((count) => workload(`uniform CRLF ${count}`, uniform(count, "line", "\r\n"), lines(count, "changed").join("\n"))),
  ...sizes.map((count) => workload(`uniform LF ${count}`, uniform(count, "line", "\n"), lines(count, "changed").join("\n"))),
  ...sizes.map((count) => workload(`mixed ${count}`, mixed(count, "line"), lines(count, "changed").join("\n"))),
  mostlyUnchanged(),
  heavilyChanged(),
  largeRegionSingleLine(),
]

const mib = (bytes: number) => (bytes / 1024 / 1024).toFixed(2)

const tableBytes = (region: string, replacement: string) =>
  (region.split(/\r?\n/).length + 1) * (replacement.split("\n").length + 1) * 4

const measure = (item: (typeof workloads)[number]) => {
  Bun.gc(true)
  Bun.gc(true)
  const before = process.memoryUsage()
  const start = performance.now()
  const output = withRegionEndings(item.region, item.replacement, item.fallback)
  const elapsed = performance.now() - start
  const after = process.memoryUsage()
  return {
    elapsed,
    arrayBuffers: after.arrayBuffers - before.arrayBuffers,
    external: after.external - before.external,
    output,
  }
}

console.log(
  "workload".padEnd(40) +
    "elapsed ms".padStart(12) +
    "arrayBuffers MiB".padStart(18) +
    "external MiB".padStart(15) +
    "full table MiB".padStart(16),
)
let checksum = 0
for (const item of workloads) {
  const result = measure(item)
  checksum += result.output.length
  console.log(
    item.name.padEnd(40) +
      result.elapsed.toFixed(2).padStart(12) +
      mib(result.arrayBuffers).padStart(18) +
      mib(result.external).padStart(15) +
      mib(tableBytes(item.region, item.replacement)).padStart(16),
  )
}
console.log(`output bytes: ${checksum}`)
