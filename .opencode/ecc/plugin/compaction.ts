import type { SessionCompaction } from "@opencode/plugin/promise/session"
import type { Runtime } from "./state.ts"

const HEADER = "# ECC local context\n"

export function compaction(state: Runtime, event: SessionCompaction) {
  if (state.controller.signal.aborted || !state.options.allows("compaction:context", "minimal")) return
  const current = state.sessions.get(event.sessionID)
  const lines = [
    HEADER,
    "Follow AGENTS.md and the affected package's checks.",
    "Preserve task progress, decisions, remaining work, and unresolved diagnostics across compaction.",
    "",
    "Recently changed files:",
  ]
  const files = [...(current?.files ?? [])].slice(-100)
  files.forEach(([file, change]) => lines.push(`- ${JSON.stringify(file)} (${change.type})`))
  if (!files.length) lines.push("- No changes tracked by this plugin in this session.")
  const block = lines.join("\n").slice(0, 6000)
  event.system = [...event.system.filter((part) => !part.text.startsWith(HEADER)), { type: "text", text: block }]
}
