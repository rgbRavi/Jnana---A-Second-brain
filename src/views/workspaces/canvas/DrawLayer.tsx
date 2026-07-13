// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useMemo } from 'react'
import { strokePath } from '../../../core/ink'
import type { Drawing } from '../../../core/canvas'
import styles from './canvas.module.css'

interface Props {
  drawings: Drawing[]
  /** The stroke currently being drawn (world coords), if any. */
  live: { points: [number, number, number][]; color: string; size: number } | null
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
