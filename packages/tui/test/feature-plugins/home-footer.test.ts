import { describe, expect, test } from "bun:test"
import { homeFooterVisibility } from "../../src/feature-plugins/home/footer"

describe("home footer visibility", () => {
  test("keeps failure labels readable at the minimum supported width", () => {
    expect(homeFooterVisibility(44)).toEqual({
      mcpCommand: false,
      pluginCommand: false,
      version: false,
      pricing: false,
    })
  })

  test("adds secondary hints as space becomes available", () => {
    expect(homeFooterVisibility(64)).toEqual({
      mcpCommand: true,
      pluginCommand: false,
      version: true,
      pricing: false,
    })
    expect(homeFooterVisibility(80)).toEqual({
      mcpCommand: true,
      pluginCommand: true,
      version: true,
      pricing: true,
    })
  })

  test("adds the pricing strip once the row has room for it", () => {
    expect(homeFooterVisibility(96)).toEqual({
      mcpCommand: true,
      pluginCommand: true,
      version: true,
      pricing: true,
    })
  })
})
