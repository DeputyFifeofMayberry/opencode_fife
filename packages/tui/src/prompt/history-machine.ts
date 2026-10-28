// Pure state machine for prompt history navigation.
//
// The caller decides when a keypress may engage history (for example, the
// cursor sits on the first or last visual row of the editor) and invokes
// `movePromptHistory` only at that boundary. Recalled text always places the
// cursor at the end, and the first backward engage stashes the full current
// prompt so arrowing past the newest entry restores it.
import { measureEditText, type WidthMethod } from "@opentui/core"

const HISTORY_LIMIT = 200

export type PromptHistoryState<Item extends { text: string }> = {
  items: Item[]
  index: number | null
  stash: Item | null
}

export type PromptMove<Item extends { text: string }> = {
  state: PromptHistoryState<Item>
  // The entry the editor should show after an applied move: the recalled
  // history item, or the stashed draft when moving past the newest entry.
  prompt?: Item
  cursor?: number
  apply: boolean
}

export type PromptHistoryPolicy<Item> = {
  significant?: (item: Item) => boolean
  same?: (a: Item, b: Item) => boolean
}

// Key-order-sensitive: sufficient for the plain objects both surfaces store,
// but pass an explicit `same` when items carry identity fields (see mini's
// promptSame, which ignores messageID/delivery).
const jsonSame = <Item>(a: Item, b: Item) => JSON.stringify(a) === JSON.stringify(b)

export function createPromptHistory<Item extends { text: string }>(
  items?: Item[],
  policy: PromptHistoryPolicy<Item> = {},
): PromptHistoryState<Item> {
  const { significant = () => true, same = jsonSame } = policy
  const next: Item[] = []
  for (const item of items ?? []) {
    if (!significant(item)) continue
    const previous = next.at(-1)
    if (previous && same(previous, item)) continue
    next.push(structuredClone(item))
  }

  return { items: next.slice(-HISTORY_LIMIT), index: null, stash: null }
}

export function pushPromptHistory<Item extends { text: string }>(
  state: PromptHistoryState<Item>,
  item: Item,
  policy: PromptHistoryPolicy<Item> = {},
): PromptHistoryState<Item> {
  const { significant = () => true, same = jsonSame } = policy
  if (!significant(item)) return state

  const reset = { index: null, stash: null } as const
  const last = state.items.at(-1)
  if (last && same(last, item)) {
    return { ...state, ...reset }
  }

  return { ...state, items: [...state.items, structuredClone(item)].slice(-HISTORY_LIMIT), ...reset }
}

export function movePromptHistory<Item extends { text: string }>(
  state: PromptHistoryState<Item>,
  dir: -1 | 1,
  current: Item,
  widthMethod: WidthMethod,
): PromptMove<Item> {
  if (state.items.length === 0) {
    return { state, apply: false }
  }

  if (state.index === null) {
    if (dir === 1) {
      return { state, apply: false }
    }

    const idx = state.items.length - 1
    return recall(state.items[idx]!, { ...state, index: idx, stash: structuredClone(current) }, widthMethod)
  }

  const idx = state.index + dir
  if (idx < 0) {
    return { state, apply: false }
  }

  if (idx >= state.items.length) {
    // Browse state without a stash is externally mutated state; leaving it
    // unhandled lets the caller fall back to cursor handling.
    if (!state.stash) return { state, apply: false }
    return recall(state.stash, { ...state, index: null, stash: null }, widthMethod)
  }

  return recall(state.items[idx]!, { ...state, index: idx }, widthMethod)
}

function recall<Item extends { text: string }>(
  prompt: Item,
  state: PromptHistoryState<Item>,
  widthMethod: WidthMethod,
): PromptMove<Item> {
  return {
    state,
    prompt,
    cursor: measureEditText(prompt.text, { widthMethod }),
    apply: true,
  }
}
