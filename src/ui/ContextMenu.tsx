// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { createPortal } from 'react-dom'
import styles from './ContextMenu.module.css'

export interface MenuItem {
  label: string
  onClick?: () => void
  danger?: boolean
  /** Draw a divider above this item. */
  separator?: boolean
  disabled?: boolean
  /** One level of flyout — hovering, clicking or ArrowRight opens it instead of firing onClick. */
  children?: MenuItem[]
}

interface Props {
  /** Screen (client) coordinates of the right-click (or of the button that opened it). */
  x: number
  y: number
  items: MenuItem[]
  onClose: () => void
}

/** Enabled menu buttons inside `root`, in DOM order (excluding a nested submenu's). */
const itemsIn = (root: HTMLElement | null, level: 'top' | 'sub') =>
  Array.from(
    root?.querySelectorAll<HTMLButtonElement>(level === 'top' ? ':scope > div > button' : ':scope > button') ?? [],
  ).filter((b) => !b.disabled)

/** A small screen-space menu with one level of submenu. Closes on action,
 *  Escape, or an outside press. Flips to stay within the viewport. Keyboard:
 *  focus lands on the first item, ↑/↓/Home/End move, → or Enter opens a
 *  submenu, ← closes it, and focus returns to whatever opened the menu.
 *  Generalized from the canvas's CanvasContextMenu for reuse in the note editor. */
export function ContextMenu({ x, y, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const subRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: x, top: y })
  const [openSubmenu, setOpenSubmenu] = useState<number | null>(null)
  /** Set when a submenu was opened from the keyboard, so its first item takes focus. */
  const focusSubOnOpen = useRef(false)

  // Keep the menu on-screen.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    const left = Math.min(x, window.innerWidth - width - 8)
    const top = Math.min(y, window.innerHeight - height - 8)
    setPos({ left: Math.max(8, left), top: Math.max(8, top) })
  }, [x, y])

  // Move focus into the menu, and hand it back to the opener on close so a
  // keyboard user isn't dropped at <body>.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    itemsIn(ref.current, 'top')[0]?.focus({ preventScroll: true })
    return () => {
      if (opener && opener.isConnected && typeof opener.focus === 'function') opener.focus({ preventScroll: true })
    }
  }, [])

  useEffect(() => {
    if (openSubmenu === null || !focusSubOnOpen.current) return
    focusSubOnOpen.current = false
    itemsIn(subRef.current, 'sub')[0]?.focus({ preventScroll: true })
  }, [openSubmenu])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose() }
    }
    // Pointerdown anywhere outside closes. Capture phase so it runs before
    // whatever the host page's own pointer handlers would do.
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

  const onMenuKeyDown = (e: React.KeyboardEvent) => {
    const inSub = !!subRef.current?.contains(document.activeElement)
    const list = inSub ? itemsIn(subRef.current, 'sub') : itemsIn(ref.current, 'top')
    const at = list.indexOf(document.activeElement as HTMLButtonElement)
    const move = (i: number) => {
      e.preventDefault()
      list[(i + list.length) % list.length]?.focus({ preventScroll: true })
    }
    switch (e.key) {
      case 'ArrowDown': return move(at + 1)
      case 'ArrowUp': return move(at < 0 ? list.length - 1 : at - 1)
      case 'Home': return move(0)
      case 'End': return move(list.length - 1)
      case 'ArrowRight': {
        if (inSub) return
        const index = Number((document.activeElement as HTMLElement | null)?.dataset.index)
        if (Number.isInteger(index) && items[index]?.children) {
          e.preventDefault()
          focusSubOnOpen.current = true
          setOpenSubmenu(index)
        }
        return
      }
      case 'ArrowLeft': {
        if (!inSub || openSubmenu === null) return
        e.preventDefault()
        const parent = openSubmenu
        setOpenSubmenu(null)
        ref.current?.querySelector<HTMLButtonElement>(`button[data-index="${parent}"]`)?.focus({ preventScroll: true })
        return
      }
      case 'Tab':
        // A menu is a single stop — Tab leaves it rather than cycling hidden rows.
        onClose()
        return
    }
  }

  // Portal to the document body so the menu's `position: fixed` is resolved
  // against the viewport, not a transformed ancestor. The docked NoteCreator
  // panel has a `transform`, which otherwise establishes a containing block and
  // pushes the fixed menu off-screen (right-click appears to do nothing there).
  return createPortal(
    <div
      ref={ref}
      role="menu"
      className={styles.contextMenu}
      style={{ left: pos.left, top: pos.top }}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={onMenuKeyDown}
    >
      {items.map((item, i) => (
        <div
          key={i}
          className={styles.itemWrap}
          onMouseEnter={() => setOpenSubmenu(item.children ? i : null)}
        >
          <button
            type="button"
            role="menuitem"
            data-index={i}
            aria-haspopup={item.children ? 'menu' : undefined}
            aria-expanded={item.children ? openSubmenu === i : undefined}
            className={`${styles.contextItem} ${item.danger ? styles.contextItemDanger : ''} ${item.separator ? styles.contextSep : ''}`}
            disabled={item.disabled}
            onClick={() => {
              if (item.children) {
                // Click (or Enter/Space) opens the flyout — it isn't hover-only.
                focusSubOnOpen.current = true
                setOpenSubmenu(i)
                return
              }
              item.onClick?.()
              onClose()
            }}
          >
            <span className={styles.itemLabel}>{item.label}</span>
            {item.children && <span className={styles.submenuArrow} aria-hidden="true"><ChevronRight size={14} /></span>}
          </button>
          {item.children && openSubmenu === i && (
            <div ref={subRef} role="menu" className={styles.submenu}>
              {item.children.map((sub, j) => (
                <button
                  key={j}
                  type="button"
                  role="menuitem"
                  className={`${styles.contextItem} ${sub.danger ? styles.contextItemDanger : ''} ${sub.separator ? styles.contextSep : ''}`}
                  disabled={sub.disabled}
                  onClick={() => { sub.onClick?.(); onClose() }}
                >
                  {sub.label}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>,
    document.body,
  )
}
