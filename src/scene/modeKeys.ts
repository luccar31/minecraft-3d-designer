/** Resolves the two meanings of `Space`: a tap toggles, holding is transient. */

import type { Mode } from './gesture'

export const TRANSIENT_MS = 250

export type SpaceState = { modeAtPress: Mode; pressedAt: number }

export function spaceDown(mode: Mode, now: number): { mode: Mode; state: SpaceState } {
  return {
    mode: mode === 'build' ? 'navigate' : mode,
    state: { modeAtPress: mode, pressedAt: now },
  }
}

/**
 * The ambiguity is resolved on release: without `cameraMoved`, orbiting fast
 * would read as a tap and switch mode nobody asked for.
 */
export function spaceUp(
  state: SpaceState,
  now: number,
  cameraMoved: boolean,
): { mode: Mode } {
  const tap = now - state.pressedAt < TRANSIENT_MS && !cameraMoved
  if (!tap) return { mode: state.modeAtPress }
  return { mode: state.modeAtPress === 'build' ? 'navigate' : 'build' }
}
