// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { SlashCommand } from '../../core/markdown/slashCommands'
import styles from './SlashMenu.module.css'

interface Props {
  /** Already-filtered commands (in registry/group order). */
  items: SlashCommand[]
  /** Highlighted row — owned by LiveEditor (keyboard nav lives on the CM6 side). */
  activeIndex: number
  /** Client coords to anchor the menu at (the `/`'s screen position). */
  coords: { x: number; y: number }
  onPick: (item: SlashCommand) => void
  onHover: (index: number) => void
  onClose: () => void
}

/**
 * The `/`-triggered command popup. Presentational + controlled: LiveEditor owns
 * the query, filtering, and the active index (so typing in the editor drives
 * selection). Mirrors ui/ContextMenu's look, viewport-clamp, and outside-press
 * close. Group headers come from consecutive items sharing a `group`.
 */
export function SlashMenu({ items, activeIndex, coords, onPick, onHover, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const rowRefs = useRef<(HTMLButtonElement | null)[]>([])
  const [pos, setPos] = useState({ left: coords.x, top: coords.y })

  // Keep the menu on-screen, and prefer opening below the caret; flip above if
  // it would overflow the bottom.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    const left = Math.max(8, Math.min(coords.x, window.innerWidth - width - 8))
    const below = coords.y + 22 // drop below the current text line
    const top = below + height > window.innerHeight - 8 ? Math.max(8, coords.y - height - 6) : below
    setPos({ left, top })
  }, [coords.x, coords.y, items.length])

  // Close on an outside press (capture, like ContextMenu).
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    window.addEventListener('pointerdown', onDown, true)
    return () => window.removeEventListener('pointerdown', onDown, true)
  }, [onClose])

  // Keep the highlighted row visible as the query narrows the list.
  useEffect(() => {
    rowRefs.current[activeIndex]?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  if (items.length === 0) return null

  let lastGroup: string | null = null

  // Portal to <body> so `position: fixed` resolves against the viewport, not a
  // transformed ancestor (the docked NoteCreator panel has one). See ContextMenu.
  return createPortal(
    <div ref={ref} className={styles.menu} style={{ left: pos.left, top: pos.top }} role="listbox">
      {items.map((item, i) => {
        const header = item.group !== lastGroup ? item.group : null
        lastGroup = item.group
        return (
          <div key={item.id}>
            {header && <div className={styles.groupHeader}>{header}</div>}
            <button
              type="button"
              role="option"
              aria-selected={i === activeIndex}
              ref={(el) => { rowRefs.current[i] = el }}
              className={`${styles.item} ${i === activeIndex ? styles.itemActive : ''}`}
              // Pointerdown (not click) so the editor never loses focus/selection
              // before we run the command.
              onPointerDown={(e) => { e.preventDefault(); onPick(item) }}
              onMouseEnter={() => onHover(i)}
            >
              <span className={styles.icon} aria-hidden="true">{item.icon}</span>
              <span className={styles.label}>{item.label}</span>
            </button>
          </div>
        )
      })}
    </div>,
    document.body,
  )
}
