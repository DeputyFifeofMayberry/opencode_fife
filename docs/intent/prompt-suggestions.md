# Prompt suggestions

Confirmed decisions for the Tab-to-insert prompt suggestion feature (the "ghost text"
that proposes the next prompt after a finished exchange). Status: experiment behind
`config.experimental["prompt-suggestions"]`.

## Behavior

- After a session's execution succeeds, the server suggests the user's likely next
  prompt from the settled history of that session.
- The TUI shows the suggestion as the prompt placeholder while the input is empty and
  the prompt is focused and idle. `Tab` inserts it as real input. Typing, submitting,
  switching sessions, or turning the experiment off dismisses it.
- `Enter` never sends suggestion text. The suggestion only becomes input through `Tab`,
  and the user still submits deliberately.
- The home route (no session) and non-interactive surfaces get no suggestions.

## Server

- `SessionSuggestion` (`packages/core/src/session/suggestion.ts`), a location-scoped
  service like `SessionTitle`, exposed as `POST /api/session/:id/suggestion`.
- Guards before spending tokens: history must end with a completed assistant message,
  and a suggestion equal to the user's own last prompt is dropped.
- Request: the same agent, system prompt, tools, and instruction baseline as the
  session's normal steps, replayed from `SessionHistory.preview`, with the suggestion
  instruction appended as a trailing user message. This reuses the provider prompt
  cache, so a suggestion is mostly cache reads plus a few output tokens.
- Output is capped at 160 tokens via the `suggestion` request kind and sanitized
  (`packages/core/src/session/suggestion-text.ts`): one line, 2 to 12 words, no
  questions, markdown, meta replies, assistant voice, or evaluative praise. Unusable
  output returns no suggestion.
- Cost is metered: `session.usage.recorded` with `source: "suggestion"`.

## Client

- The TUI gates on the `prompt-suggestions` experiment (`dialog-experiments.tsx`),
  triggers on `session.execution.succeeded` for the focused session with a 400 ms
  debounce, cancels in-flight requests on new input, and degrades silently on failure.

## Reuse

Adapted from MIT-licensed implementations of the same feature for the `pi` agent;
provenance, commits, and license texts are in `THIRD_PARTY_NOTICES.md`. The transport
deliberately deviates from those sources: they send a compact digest with a separate
system prompt (no cache reuse); this implementation replays real history so the
provider cache absorbs the cost.

## Graduation / retirement

- Graduate when the experiment proves out: remove the registry entry and the
  `suggestionsEnabled` gate, making the behavior unconditional.
- Retire if cost or noise dominates: remove the registry entry, the TUI block, and the
  endpoint. The schema's `suggestion` usage source and recorded data can stay; old
  usage rows remain valid.
