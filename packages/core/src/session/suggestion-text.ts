export * as SessionSuggestionText from "./suggestion-text.js"

/**
 * Instruction appended to the conversation for a prompt suggestion, and the
 * validation applied to what comes back.
 *
 * Adapted from MIT-licensed implementations of the same feature for the `pi`
 * agent; see THIRD_PARTY_NOTICES.md. The framing exists because a coding model
 * answers a bare question instead of continuing the user's side of the input
 * box, and because a background call must fail closed: showing a wrong prompt
 * costs more than showing none.
 */
export const INSTRUCTION = [
  "[SUGGESTION MODE] The input box is empty.",
  "Predict the prompt the user is most likely to send next. Write it as the user would, in their voice.",
  'The test: would the user think "I was about to type that"?',
  "",
  "Good suggestions:",
  "- are 2 to 12 words, one line, imperative",
  "- continue the obvious workflow from the latest exchange",
  "- follow a next step the user already stated",
  "- match the user's phrasing and level of detail",
  "",
  "Never suggest:",
  "- thanks, praise, or evaluative replies",
  "- questions",
  "- new ideas the user did not raise",
  "- more than one sentence",
  "- unsafe or sensitive actions: credentials, secrets, destructive commands, or private data",
  "",
  "If the user said what they will ask next, suggest exactly that.",
  "If nothing is clearly expected, reply with exactly NONE.",
  "Reply with only the suggestion text.",
].join("\n")

const MAX_CHARS = 160
const MAX_WORDS = 12
const NONE = /^none$/i
const ALLOWED_SINGLE_WORD = new Set([
  "commit",
  "continue",
  "push",
  "retry",
  "revert",
  "stop",
  "test",
  "undo",
  "yes",
])

/** The suggestion in `raw`, or `undefined` when nothing safe and prompt-shaped is there. */
export function sanitize(raw: string): string | undefined {
  let text = raw.trim()
  if (!text || NONE.test(text)) return
  // One line, judged on the model's raw shape: a fenced or wrapped blob that
  // collapses to a single word after stripping is not a prompt.
  if (text.includes("\n")) return

  text = text
    // Single-line fences only; a fenced blob with a language tag has newlines and was rejected above.
    .replace(/^```\s*/, "")
    .replace(/\s*```$/, "")
    .trim()
    .replace(/^['"“”‘’`]+|['"“”‘’`]+$/g, "")
    .trim()
    .replace(/\.$/, "")
    .trim()
  if (!text || NONE.test(text)) return

  if (text.length > MAX_CHARS) return
  if (text.endsWith("?")) return
  // One sentence. The trailing period was stripped above, so any remaining
  // terminal punctuation followed by text starts another sentence.
  if (/[.!?]\s+\S/.test(text)) return
  if (/[*`]/.test(text)) return
  if (/^\w+:\s/.test(text)) return
  if (/^\d+[.)]\s/.test(text)) return
  if (/^\(.*\)$|^\[.*\]$/.test(text)) return

  const lower = text.toLowerCase()
  if (lower === "done") return
  if (isMeta(lower) || isError(lower)) return
  if (isEvaluative(lower)) return
  // Assistant voice describes the reply instead of continuing the user's side.
  if (
    /^(let me|i'll|i've|i'm|i can|i would|i think|i notice|here's|here is|here are|that's|this is|this will|you can|you should|you could|of course|certainly)\b/.test(
      lower,
    )
  )
    return
  if (/^sure[,!.]/.test(lower)) return

  const words = text.split(/\s+/)
  if (words.length > MAX_WORDS) return
  if (words.length < 2 && !text.startsWith("/") && !ALLOWED_SINGLE_WORD.has(lower)) return

  return text
}

function isMeta(lower: string) {
  return (
    lower.startsWith("nothing to suggest") ||
    lower.startsWith("no suggestion") ||
    /\bsilence is\b|\bstay(s|ing)? silent\b/.test(lower) ||
    /^\W*silence\W*$/.test(lower)
  )
}

function isError(lower: string) {
  return (
    lower.startsWith("api error:") ||
    lower.startsWith("prompt is too long") ||
    lower.startsWith("request timed out") ||
    lower.startsWith("invalid api key") ||
    lower.startsWith("image was too large")
  )
}

function isEvaluative(lower: string) {
  return /thanks|thank you|looks good|sounds good|that works|that worked|that's all|nice|great|perfect|makes sense|awesome|excellent/.test(
    lower,
  )
}
