// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Compact rows×cols picker for inserting a new table — a Google-Docs-style
// hover grid (drag your eye to the size, click to insert). A discrete one-shot
// action, so it's a small popover, not the full editing surface (editing is
// inline in the live editor). More rows/cols can always be added inline after.
//
// Portals to <body> like the editor's other popups: the docked composer panel
// has a CSS transform that would otherwise capture this fixed-position layer.

import { useState } from 'react'
import { createPortal } from 'react-dom'
import Styles from './TableSizePicker.module.css'

const GRID_ROWS = 8
const GRID_COLS = 8

interface Props {
  onInsert: (rows: number, cols: number) => void
  onClose: () => void
}

export function TableSizePicker({ onInsert, onClose }: Props) {
  // 1-based hovered size; 0 = nothing hovered yet.
  const [hover, setHover] = useState<{ r: number; c: number }>({ r: 1, c: 2 })

  return createPortal(
    <div className={Styles.overlay} onMouseDown={onClose}>
      <div className={Styles.popover} onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Insert table">
        <div className={Styles.grid} role="grid">
          {Array.from({ length: GRID_ROWS }, (_, r) =>
            Array.from({ length: GRID_COLS }, (_, c) => {
              const on = r < hover.r && c < hover.c
              return (
                <button
                  key={`${r}-${c}`}
                  className={on ? `${Styles.cell} ${Styles.cellOn}` : Styles.cell}
                  onMouseEnter={() => setHover({ r: r + 1, c: c + 1 })}
                  onFocus={() => setHover({ r: r + 1, c: c + 1 })}
                  onClick={() => onInsert(r + 1, c + 1)}
                  aria-label={`${r + 1} by ${c + 1} table`}
                />
              )
            }),
          )}
        </div>
        <div className={Styles.label}>{hover.r} × {hover.c}</div>
      </div>
    </div>,
    document.body,
  )
}
