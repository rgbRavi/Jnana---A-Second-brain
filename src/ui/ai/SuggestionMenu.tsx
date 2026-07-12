// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import styles from './Suggestions.module.css'

interface Props<T> {
  /** Emoji/glyph shown on the collapsed button. */
  icon: string
  /** Hover-revealed label + accessible name (e.g. "Suggest tags"). */
  label: string
  /** Stable key per item — used for checkbox identity + the selection set. */
  keyOf: (item: T) => string
  /** Fetch suggestions (throws on error, e.g. "Enable AI …"). */
  run: () => Promise<T[]>
  /** Render one item's body (inside the checkbox row). */
  renderItem: (item: T) => ReactNode
  /** Apply the checked items. */
  onApply: (items: T[]) => void
  loadingText: string
  emptyText: string
  disabled?: boolean
}

/**
 * A compact AI-suggestion control: an icon button that reveals its label on
 * hover and, when clicked, runs `run()` and opens a checkbox dropdown of the
 * results with an **Apply** button. All results start checked; Apply commits the
 * ticked ones and drops them so a re-open shows only what's left. The dropdown is
 * portaled to `<body>` (fixed-positioned under the button) so a composer's scroll
 * container can't clip it.
 */
export function SuggestionMenu<T>({
  icon, label, keyOf, run, renderItem, onApply, loadingText, emptyText, disabled,
}: Props<T>) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [items, setItems] = useState<T[] | null>(null)
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [pos, setPos] = useState({ left: 0, top: 0, width: 240 })
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close on outside press / Escape — the button and the portaled menu both
  // count as "inside" (capture phase, like the editor's colour dropdown).
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', onDown, true)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // Position the portaled menu under the button, clamped to the viewport (flip
  // above if it would overflow the bottom). Re-run when contents change height.
  useLayoutEffect(() => {
    if (!open) return
    const b = btnRef.current?.getBoundingClientRect()
    if (!b) return
    const width = Math.max(240, b.width)
    const left = Math.max(8, Math.min(b.left, window.innerWidth - width - 8))
    const menuH = menuRef.current?.getBoundingClientRect().height ?? 0
    const below = b.bottom + 4
    const top = menuH && below + menuH > window.innerHeight - 8
      ? Math.max(8, b.top - menuH - 4)
      : below
    setPos({ left, top, width })
  }, [open, items, loading, error])

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await run()
      setItems(result)
      setChecked(new Set(result.map(keyOf)))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
      setItems(null)
    } finally {
      setLoading(false)
    }
  }

  const toggleOpen = () => {
    const next = !open
    setOpen(next)
    if (next && items === null && !loading) void load()
  }

  const toggleCheck = (k: string) => {
    setChecked((prev) => {
      const s = new Set(prev)
      if (s.has(k)) s.delete(k)
      else s.add(k)
      return s
    })
  }

  const apply = () => {
    if (!items) return
    const chosen = items.filter((it) => checked.has(keyOf(it)))
    if (chosen.length) onApply(chosen)
    setItems((prev) => (prev ? prev.filter((it) => !checked.has(keyOf(it))) : prev))
    setChecked(new Set())
    setOpen(false)
  }

  const allChecked = items != null && items.length > 0 && items.every((it) => checked.has(keyOf(it)))

  return (
    <div className={styles.anchor}>
      <button
        ref={btnRef}
        type="button"
        className={`${styles.iconBtn} ${open ? styles.open : ''}`}
        onClick={toggleOpen}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        title={label}
      >
        <span className={styles.icon} aria-hidden="true">{icon}</span>
        <span className={styles.label}>{label}</span>
      </button>

      {open && createPortal(
        <div
          ref={menuRef}
          className={styles.dropdown}
          style={{ left: pos.left, top: pos.top, width: pos.width }}
          role="menu"
        >
          {loading && <div className={styles.status}>{loadingText}</div>}
          {error && <div className={styles.error}>{error}</div>}
          {!loading && !error && items && items.length === 0 && (
            <div className={styles.status}>{emptyText}</div>
          )}
          {!loading && !error && items && items.length > 0 && (
            <>
              <div className={styles.scroll}>
                {items.map((it) => {
                  const k = keyOf(it)
                  return (
                    <label key={k} className={styles.check}>
                      <input type="checkbox" checked={checked.has(k)} onChange={() => toggleCheck(k)} />
                      <span className={styles.checkBody}>{renderItem(it)}</span>
                    </label>
                  )
                })}
              </div>
              <div className={styles.footer}>
                <button
                  type="button"
                  className={styles.selectAll}
                  onClick={() => setChecked(allChecked ? new Set() : new Set(items.map(keyOf)))}
                >
                  {allChecked ? 'Clear all' : 'Select all'}
                </button>
                <button
                  type="button"
                  className={styles.applyBtn}
                  onClick={apply}
                  disabled={checked.size === 0}
                >
                  Apply{checked.size ? ` (${checked.size})` : ''}
                </button>
              </div>
            </>
          )}
        </div>,
        document.body,
      )}
    </div>
  )
}
