// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useMemo } from 'react'
import { getStroke } from 'perfect-freehand'
import type { Drawing } from '../../../core/canvas'
import styles from './canvas.module.css'

interface Props {
  drawings: Drawing[]
  /** The stroke currently being drawn (world coords), if any. */
  live: { points: [number, number, number][]; color: string; size: number } | null
}

const STROKE_OPTS = { thinning: 0.6, smoothing: 0.5, streamline: 0.5, simulatePressure: true }

/** Turn a perfect-freehand outline into a filled SVG path. */
function toPath(outline: number[][]): string {
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

function strokePath(points: [number, number, number][], size: number): string {
  return toPath(getStroke(points, { ...STROKE_OPTS, size }))
}

/** Renders committed freehand strokes + the in-progress one, in world coordinates. */
export function DrawLayer({ drawings, live }: Props) {
  const committed = useMemo(
    () => drawings.map((d) => ({ id: d.id, color: d.color, path: strokePath(d.points, d.size) })),
    [drawings],
  )

  return (
    <svg className={styles.edgeSvg} aria-hidden="true">
      {committed.map((d) => (
        <path key={d.id} d={d.path} fill={d.color} />
      ))}
      {live && <path d={strokePath(live.points, live.size)} fill={live.color} />}
    </svg>
  )
}
