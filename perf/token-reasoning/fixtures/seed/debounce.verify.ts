import { expect, test } from "bun:test"
// Fails until debounce honors `leading: true` (immediate call, then quiet for the window).
import { debounce } from "./debounce"

test("trailing call fires once after the window", async () => {
  let calls = 0
  const debounced = debounce(() => {
    calls++
  }, 20)
  debounced()
  debounced()
  debounced()
  await Bun.sleep(50)
  expect(calls).toBe(1)
})

test("leading fires immediately and suppresses the window", async () => {
  let calls = 0
  const debounced = debounce(
    () => {
      calls++
    },
    20,
    { leading: true },
  )
  debounced()
  expect(calls).toBe(1)
  debounced()
  debounced()
  expect(calls).toBe(1)
  await Bun.sleep(50)
  debounced()
  expect(calls).toBe(2)
})
