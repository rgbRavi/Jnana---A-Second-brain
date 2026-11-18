// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { ArrowDown, ArrowUp, X } from 'lucide-react'
import styles from './Dashboard.module.css'
import { SECTIONS } from './registry'
import { SettingToggle } from '../../../ui/settings/SettingControls'
import { useEscapeKey } from '../../../hooks/useEscapeKey'
import { showConfirmDialog } from '../../../lib/dialog'
import { useDashboardPrefs } from './useDashboardPrefs'
import { compact } from './components/DashboardGrid'
import { GRID_COLS, type GridItem, type SectionId } from './types'

const byYX = (a: GridItem, b: GridItem) => a.y - b.y || a.x - b.x
const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** Dashboard preferences dialog: show/hide sections and reorder them. Reorder
 *  here works at any window width (the grid's drag/arrow-key move is off in
 *  the narrow single-column view) and for screen-reader users. */
export function CustomizePanel({ onClose }: { onClose: () => void }) {
  const prefs = useDashboardPrefs()
  const [live, setLive] = useState('')

  const panelRef = useRef<HTMLDivElement>(null)
  useEscapeKey(onClose)

  // Focus the dialog on open; hand focus back to the opener on close.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    panelRef.current?.focus()
    return () => opener?.focus?.()
  }, [])

  // Keep Tab inside the modal.
  const trapTab = (e: KeyboardEvent) => {
    if (e.key !== 'Tab' || !panelRef.current) return
    const els = [...panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)]
    if (els.length === 0) return
    const first = els[0]
    const last = els[els.length - 1]
    if (e.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  const reset = async () => {
    const ok = await showConfirmDialog({
      title: 'Reset this layout?',
      message: 'Card positions, sizes and hidden cards go back to the defaults.',
      confirmLabel: 'Reset',
      danger: true,
    })
    if (ok) prefs.resetLayout()
  }

  const grid = prefs.active.grid
  // Shown cards in on-screen order, then hidden ones.
  const shown = grid.filter((g) => !prefs.isHidden(g.i)).sort(byYX)
  const hidden = grid.filter((g) => prefs.isHidden(g.i)).sort(byYX)

  /** Swap a shown card with its neighbour in reading order, then let the grid's
   *  own compaction settle any overlap from differing sizes. */
  const move = (id: SectionId, dir: -1 | 1) => {
    const idx = shown.findIndex((g) => g.i === id)
    const other = shown[idx + dir]
    if (!other) return
    const a = shown[idx]
    const place = (it: GridItem, to: GridItem) => ({ ...it, x: Math.min(to.x, GRID_COLS - it.w), y: to.y })
    const movedA = place(a, other)
    const movedB = place(other, a)
    const next = compact(grid.map((g) => (g.i === a.i ? movedA : g.i === other.i ? movedB : g)), a.i)
    prefs.setGrid(grid.map((g) => next.find((n) => n.i === g.i) ?? g))
    setLive(`${SECTIONS[id].title} moved ${dir < 0 ? 'up' : 'down'}`)
  }

  const row = (g: GridItem, i: number, list: GridItem[], canMove: boolean) => {
    const title = SECTIONS[g.i].title
    return (
      <div key={g.i} className={styles.customizeRow}>
        <SettingToggle checked={!prefs.isHidden(g.i)} onChange={() => prefs.toggleHidden(g.i)} label={title} />
        {canMove && (
          <span className={styles.customizeMove}>
            <button
              type="button"
              className={styles.cardBtn}
              onClick={() => move(g.i, -1)}
              disabled={i === 0}
              title="Move up"
              aria-label={`Move ${title} up`}
            >
              <ArrowUp size={15} aria-hidden="true" />
            </button>
            <button
              type="button"
              className={styles.cardBtn}
              onClick={() => move(g.i, 1)}
              disabled={i === list.length - 1}
              title="Move down"
              aria-label={`Move ${title} down`}
            >
              <ArrowDown size={15} aria-hidden="true" />
            </button>
          </span>
        )}
      </div>
    )
  }

  return (
    <div
      className={styles.customizeOverlay}
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className={styles.customizePanel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="customize-title"
        onKeyDown={trapTab}
      >
        <div className={styles.customizeHead}>
          <h2 className={styles.customizeTitle} id="customize-title">Customize dashboard</h2>
          <button type="button" className={styles.cardBtn} onClick={onClose} title="Close" aria-label="Close">
            <X size={15} aria-hidden="true" />
          </button>
        </div>
        <p className={styles.customizeHint}>
          Choose which cards appear and in what order. On the dashboard you can also drag a card by its grip, or focus
          the grip and use the arrow keys (Shift+arrows to resize). Nothing here touches your notes.
        </p>

        <div className={styles.customizeList}>
          {shown.map((g, i) => row(g, i, shown, true))}
          {hidden.map((g, i) => row(g, i, hidden, false))}
        </div>
        <div className={styles.gridLive} role="status" aria-live="polite">
          {live}
        </div>

        <div className={styles.customizeFooter}>
          <button type="button" className={styles.resetBtn} onClick={reset}>
            Reset to default
          </button>
          <span className={styles.customizeNote}>Save layouts from the Layouts menu.</span>
        </div>
      </div>
    </div>
  )
}
