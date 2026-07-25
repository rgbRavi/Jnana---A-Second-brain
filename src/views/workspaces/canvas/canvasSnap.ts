// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Pure snapping for a node drag: prefer alignment to another node's matching
// edge/center (left↔left, center↔center, right↔right, within `threshold`), else
// fall back to grid rounding. Returns the snapped top-left plus the guide lines
// to draw. World coordinates throughout.

import type { Rect } from './canvasSelect'

export interface SnapResult {
  x: number
  y: number
  guides: { axis: 'x' | 'y'; at: number }[]
}

// The three candidate lines a rect contributes on each axis (start, mid, end).
const xLines = (r: Rect) => [r.x, r.x + r.w / 2, r.x + r.w]
const yLines = (r: Rect) => [r.y, r.y + r.h / 2, r.y + r.h]

/** Snap `moving`'s position against `others`. `grid` (0 = off) is the fallback
 *  step when no alignment catches; `threshold` is the alignment catch distance. */
export function snapDrag(moving: Rect, others: Rect[], grid: number, threshold: number): SnapResult {
  const guides: SnapResult['guides'] = []

  const snapAxis = (
    movingLines: number[],
    otherLinesOf: (r: Rect) => number[],
    origin: number,
    axis: 'x' | 'y',
  ): number => {
    let best: { delta: number; at: number } | null = null
    for (const other of others) {
      const ol = otherLinesOf(other)
      // Pair like-with-like: start↔start, mid↔mid, end↔end.
      for (let i = 0; i < movingLines.length; i++) {
        const delta = ol[i] - movingLines[i]
        if (Math.abs(delta) <= threshold && (!best || Math.abs(delta) < Math.abs(best.delta))) {
          best = { delta, at: ol[i] }
        }
      }
    }
    if (best) {
      guides.push({ axis, at: best.at })
      return origin + best.delta
    }
    if (grid > 0) return Math.round(origin / grid) * grid
    return origin
  }

  const x = snapAxis(xLines(moving), xLines, moving.x, 'x')
  const y = snapAxis(yLines(moving), yLines, moving.y, 'y')
  return { x, y, guides }
}
