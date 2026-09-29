// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

export interface Box {
  left: number
  top: number
  width: number
  height: number
}

/** Translate offsets for a thrown arc, centre of `from` to centre of `to`.
 *  Parabola peaking `lift` px above the straight line at the midpoint. */
export function arcPoints(from: Box, to: Box, steps: number, lift: number): { x: number; y: number }[] {
  const dx = to.left + to.width / 2 - (from.left + from.width / 2)
  const dy = to.top + to.height / 2 - (from.top + from.height / 2)
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps
    return { x: dx * t, y: dy * t - lift * 4 * t * (1 - t) }
  })
}
