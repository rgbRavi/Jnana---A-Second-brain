// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import styles from './canvas.module.css'

export interface MenuItem {
  label: string
  onClick: () => void
  danger?: boolean
  /** Draw a divider above this item. */
  separator?: boolean
  disabled?: boolean
}

interface Props {
  /** Screen (client) coordinates of the right-click. */
  x: number
  y: number
  items: MenuItem[]
  onClose: () => void
}

/** A small screen-space right-click menu. Closes on action, Escape, or an
 *  outside press. Flips to stay within the viewport. Mirrors the canvas's other
 *  floating chrome (the edge menu). */
export function CanvasContextMenu({ x, y, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: x, top: y })

  // Keep the menu on-screen.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    const left = Math.min(x, window.innerWidth - width - 8)
    const top = Math.min(y, window.innerHeight - height - 8)
    setPos({ left: Math.max(8, left), top: Math.max(8, top) })
  }, [x, y])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose() }
    }
    // Pointerdown anywhere outside closes. Capture phase so it runs before the
    // board's own pointer handlers.
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onDown, true)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onDown, true)
    }
  }, [onClose])

  return (
    <div
      ref={ref}
      className={styles.contextMenu}
      style={{ left: pos.left, top: pos.top }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item, i) => (
        <button
          key={i}
          type="button"
          className={`${styles.contextItem} ${item.danger ? styles.contextItemDanger : ''} ${item.separator ? styles.contextSep : ''}`}
          disabled={item.disabled}
          onClick={() => { item.onClick(); onClose() }}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}
