import { describe, expect, test } from "bun:test"
import { Config } from "@opencode/core/config"
import { Document, Info } from "@opencode/schema/config"
import { ConfigEffort } from "@opencode/schema/config/effort"

describe("effort policy configuration precedence", () => {
  test("inherits global adaptive mode while replacing project verifier list", () => {
    const global = new Document({ type: "document", info: new Info({ effort_policy: new ConfigEffort.Info({ mode: "adaptive", clean_passes: 3, verification_commands: ["global"] }) }) })
    const project = new Document({ type: "document", info: new Info({ effort_policy: new ConfigEffort.Info({ verification_commands: ["bun run check"] }) }) })
    expect(Config.effortPolicy([global, project])).toMatchObject({ mode: "adaptive", clean_passes: 3, verification_commands: ["bun run check"] })
    expect(Config.effortPolicy([global, project, new Document({ type: "document", info: new Info({ effort_policy: new ConfigEffort.Info({ mode: "static", verification_commands: [] }) }) })])).toMatchObject({ mode: "static", clean_passes: 3, verification_commands: [] })
    expect(Config.effortPolicy([])).toBeUndefined()
  })
})
