// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useEffect, useRef } from 'react'
import { GripVertical } from 'lucide-react'
import { useComposerToolbar, type ToolbarItem } from '../../hooks/useComposerToolbar'
import { SettingToggle } from '../settings/SettingControls'
import styles from './Ai.module.css'

const LABEL: Record<ToolbarItem, string> = {
  preset: 'Preset switcher', attach: 'Attach', capabilities: 'Capabilities', more: 'More', focused: 'Focused',
}

/** Show / hide / reorder the chat composer's toolbar controls. */
export function ToolbarSettings() {
  const [{ order, hidden }, { move, toggle, reset }] = useComposerToolbar()
  const rows = useRef<(HTMLDivElement | null)[]>([])
  const drag = useRef<{ index: number; pointerId: number } | null>(null) // row being dragged
  const handles = useRef<Partial<Record<ToolbarItem, HTMLButtonElement | null>>>({})
  const refocus = useRef<ToolbarItem | null>(null)
  // A moved row is re-inserted by the browser, which blurs it — restore focus for keyboard reordering.
  useEffect(() => {
    if (refocus.current) {
      handles.current[refocus.current]?.focus()
      refocus.current = null
    }
  }, [order])

  const onMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d || e.pointerId !== d.pointerId || !(e.buttons & 1)) return
    const from = d.index
    // Target = the row whose vertical span holds the pointer (clamped to the ends).
    let to = from
    rows.current.forEach((el, i) => {
      const r = el?.getBoundingClientRect()
      if (r && e.clientY >= r.top && e.clientY <= r.bottom) to = i
    })
    if (to !== from) {
      move(from, to)
      d.index = to
    }
  }

  return (
    <div className={`${styles.field} ${styles.fieldWide}`}>
      <span className={styles.label}>Composer toolbar</span>
      {order.map((item, i) => (
        <div
          key={item}
          ref={(el) => { rows.current[i] = el }}
          style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', padding: 'var(--space-2xs) 0' }}
        >
          <button
            type="button"
            title={`Reorder ${LABEL[item]}`}
            aria-label={`Reorder ${LABEL[item]}`}
            ref={(el) => { handles.current[item] = el }}
            onPointerDown={(e) => { e.currentTarget.setPointerCapture?.(e.pointerId); drag.current = { index: i, pointerId: e.pointerId } }}
            onPointerMove={onMove}
            onPointerUp={() => { drag.current = null }}
            onPointerCancel={() => { drag.current = null }}
            onLostPointerCapture={() => { drag.current = null }}
            onKeyDown={(e) => {
              if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
              e.preventDefault()
              refocus.current = item
              move(i, e.key === 'ArrowUp' ? i - 1 : i + 1)
            }}
            style={{
              display: 'inline-flex', background: 'none', border: 'none', padding: 0,
              color: 'var(--control-grip)', cursor: 'grab', touchAction: 'none',
            }}
          >
            <GripVertical size={16} />
          </button>
          <SettingToggle
            checked={!hidden.includes(item)}
            onChange={() => toggle(item)}
            label={LABEL[item]}
            ariaLabel={`Show ${LABEL[item]}`}
          />
        </div>
      ))}
      <div>
        <button type="button" className={styles.btn} onClick={reset}>Reset to default</button>
      </div>
    </div>
  )
}
