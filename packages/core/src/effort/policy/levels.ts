/**
 * Level-to-effort resolution against one adapter-owned vocabulary. No host
 * types and no I/O: every input is plain data.
 * @module @mayberry/effort-policy-core/levels
 */

import type { EffortCapability, EffortLevel } from './types.js'

/** Level order, least to most expensive. */
const LEVEL_ORDER: readonly EffortLevel[] = ['low', 'standard', 'deep']

/**
 * Rank one level by cost.
 * @param level - the level to rank.
 * @returns its zero-based position in level order.
 */
function rank(level: EffortLevel): number {
  return LEVEL_ORDER.indexOf(level)
}

/**
 * Raise one level, capped at `deep`.
 * @param level - starting level.
 * @returns the next level, or the same level at the cap.
 */
export function higherLevel(level: EffortLevel): EffortLevel {
  switch (level) {
    case 'low':
      return 'standard'
    case 'standard':
    case 'deep':
      return 'deep'
  }
}

/**
 * Compare two levels by cost.
 * @param left - first level.
 * @param right - second level.
 * @returns the more expensive level.
 */
export function higherOf(left: EffortLevel, right: EffortLevel): EffortLevel {
  return rank(left) >= rank(right) ? left : right
}

/**
 * Resolve one level to an effort the route advertises.
 *
 * `low` prefers `low`, then the least advertised effort that is not `off`, then
 * `off`. `standard` is the adapter's default effort. `deep` prefers `max`, then
 * the most advertised effort. A route that advertises nothing cannot take an
 * effort and resolves to `undefined`.
 *
 * @param capability - the exact route's advertised efforts and default.
 * @param level - level to resolve.
 * @returns an effort the route advertises, or `undefined` to leave the request untouched.
 */
export function resolveLevelEffort(
  capability: EffortCapability,
  level: EffortLevel,
): string | undefined {
  const { efforts, defaultEffort } = capability
  if (efforts.length === 0) return undefined
  if (level === 'low') {
    if (efforts.includes('low')) return 'low'
    const leastThinking = efforts.find(effort => effort !== 'off')
    return leastThinking ?? efforts[0]
  }
  if (level === 'standard') {
    return defaultEffort !== undefined && efforts.includes(defaultEffort) ? defaultEffort : undefined
  }
  if (efforts.includes('max')) return 'max'
  return efforts[efforts.length - 1]
}
