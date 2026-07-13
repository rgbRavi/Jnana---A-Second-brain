// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Transform-agnostic freehand-ink helpers shared by the workspace canvas board
// (DrawLayer) and the PDF markup layer (PdfViewer). Given [x, y, pressure]
// points in *some* pixel space, perfect-freehand produces a filled outline
// polygon; `strokePath` turns that into an SVG path string. The caller owns the
// coordinate space — the canvas passes world coords, the PDF passes points
// already converted into current-viewport pixels.

import { getStroke } from 'perfect-freehand'

export const STROKE_OPTS = { thinning: 0.6, smoothing: 0.5, streamline: 0.5, simulatePressure: true }

/** Turn a perfect-freehand outline into a filled SVG path (`fill`, not `stroke`). */
export function toPath(outline: number[][]): string {
  if (!outline.length) return ''
  const d = outline.reduce(
    (acc, [x0, y0], i, arr) => {
      const [x1, y1] = arr[(i + 1) % arr.length]
      acc.push(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2)
      return acc
    },
    ['M', ...outline[0], 'Q'] as (string | number)[],
  )
  d.push('Z')
  return d.join(' ')
}

/** Filled SVG path for a stroke. `size` is merged over STROKE_OPTS per-call. */
export function strokePath(points: [number, number, number][], size: number): string {
  return toPath(getStroke(points, { ...STROKE_OPTS, size }))
}
