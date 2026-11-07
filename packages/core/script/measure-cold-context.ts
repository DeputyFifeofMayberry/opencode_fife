import path from "path"
import { Message, SystemPart, ToolDefinition } from "@opencode/ai/effect"
import { OpenAIChat } from "@opencode/ai/protocols"
import { Agent } from "@opencode/schema/agent"
import { Money } from "@opencode/schema/money"
import { Session } from "@opencode/schema/session"
import { AppNodeBuilder } from "@opencode/core/effect/app-node-builder"
import { SkillFile } from "@opencode/core/config/plugin/skill-file"
import { Location } from "@opencode/core/location"
import { PluginHooks } from "@opencode/core/plugin/hooks"
import { Project } from "@opencode/core/project"
import { AbsolutePath } from "@opencode/core/schema"
import { SessionModelRequest } from "@opencode/core/session/model-request"
import { SessionModelTransport } from "@opencode/core/session/model-transport"
import { SessionRunnerModel } from "@opencode/core/session/runner/model"
import { Skill } from "@opencode/core/skill"
import { SkillInstructions } from "@opencode/core/skill/instructions"
import { DateTime, Effect, Layer } from "effect"
import { FetchHttpClient } from "effect/http"
import { readInitial } from "../test/lib/instructions"
import { PluginTestLayer } from "../test/plugin/fixture"
import { refuseNetwork } from "../test/lib/effect"

// Compare a committed baseline with the working tree; only fixed, non-private fixture text is emitted.
const root = path.resolve(import.meta.dir, "../../..")
const baseline = process.argv[2]
if (!baseline) throw new Error("Usage: bun run script/measure-cold-context.ts <baseline-git-ref>")

const files = (await Array.fromAsync(new Bun.Glob("*/SKILL.md").scan({ cwd: path.join(root, ".opencode/skills") }))).sort()
const content = async (file: string, ref?: string) => {
  if (!ref) return Bun.file(path.join(root, file)).text()
  const result = Bun.spawnSync(["git", "show", `${ref}:${file.replaceAll("\\", "/")}`], { cwd: root, stderr: "pipe" })
  if (result.exitCode !== 0) throw new Error(`Could not read baseline file ${file}`)
  return result.stdout.toString()
}

const skills = async (ref?: string) =>
  Promise.all(
    files.map(async (file) => {
      const directory = path.join(root, ".opencode/skills")
      const result = SkillFile.parse(directory, path.join(directory, file), await content(`.opencode/skills/${file}`, ref))
      if (result._tag !== "Parsed") throw new Error(`Invalid skill: ${file}`)
      return result.skill
    }),
  )

const catalog = async (ref?: string) => {
  const entries = await skills(ref)
  const layer = AppNodeBuilder.build(SkillInstructions.node, [
    Skill.node.replace(Layer.mock(Skill.Service, { list: () => Effect.succeed(entries) })),
  ])
  return Effect.runPromise(
    Effect.gen(function* () {
      const service = yield* SkillInstructions.Service
      return (yield* service.load([]).pipe(Effect.flatMap(readInitial))).text
    }).pipe(Effect.provide(layer)),
  )
}

const session = Session.Info.make({
  id: Session.ID.make("ses_cold_context_fixture"),
  projectID: Project.ID.global,
  cost: Money.USD.zero,
  tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
  time: { created: DateTime.makeUnsafe(0), updated: DateTime.makeUnsafe(0) },
  location: Location.Ref.make({ directory: AbsolutePath.make("/fixture") }),
})
const model = SessionRunnerModel.resolved(OpenAIChat.route.model({ id: "fixture", provider: "test" }), {
  capabilities: { tools: true, input: ["text"], output: ["text"] },
  cost: [],
  limit: { context: 200_000, output: 32_000 },
})
const transport = SessionModelTransport.Service.of({
  bind: () => ({ execute: () => Effect.die("unused") }),
  close: () => Effect.void,
  closeAll: Effect.void,
})
const tool = new ToolDefinition({ name: "fixture", description: "Fixed fixture tool", inputSchema: { type: "object" } })
const toolSnapshot = { definitions: [tool], execute: () => Effect.die("unused") }
const prompt = "Explain the fixture."
const pluginText = "Fixed fixture plugin instructions."

const violations: string[] = []
const measure = (instructions: string, skillCatalog: string) =>
  Effect.gen(function* () {
    const hooks = yield* PluginHooks.Service
    yield* hooks.register("session", "context", (event) =>
      Effect.sync(() => void event.system.push(SystemPart.make(pluginText))),
    )
    const requests = yield* SessionModelRequest.Service.pipe(Effect.provide(SessionModelRequest.layer))
    const prepared = yield* requests.primary({
      session,
      agent: Agent.ID.make("build"),
      model,
      system: [SystemPart.make(instructions), SystemPart.make(skillCatalog)],
      messages: [Message.user(prompt)],
      tools: toolSnapshot,
    })
    const request = prepared.request
    const wire = JSON.stringify({ system: request.system, messages: request.messages, tools: request.tools })
    return {
      projectInstructions: request.system[0]?.text.length,
      skillCatalog: request.system[1]?.text.length,
      fixturePlugin: request.system[2]?.text.length,
      messagesJson: JSON.stringify(request.messages).length,
      toolsJson: JSON.stringify(request.tools).length,
      fixtureRequestJsonCharacters: wire.length,
      fixtureRequestJsonBytes: Buffer.byteLength(wire),
    }
  }).pipe(
    Effect.provideService(SessionModelTransport.Service, transport),
    Effect.provide(PluginTestLayer),
    Effect.provideService(FetchHttpClient.Fetch, refuseNetwork(violations)),
    Effect.scoped,
  )

const [oldInstructions, newInstructions, oldCatalog, newCatalog] = await Promise.all([
  content("AGENTS.md", baseline),
  content("AGENTS.md"),
  catalog(baseline),
  catalog(),
])
const results = {
  baseline,
  fixture: "offline primary request; one synthetic tool and one synthetic context hook; no actual router, MCP, provider framing, or tokenization",
  before: await Effect.runPromise(measure(oldInstructions, oldCatalog)),
  after: await Effect.runPromise(measure(newInstructions, newCatalog)),
}
if (violations.length > 0) throw new Error("Fixture attempted an external network request")
console.log(JSON.stringify(results, null, 2))
