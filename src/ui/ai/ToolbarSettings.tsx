// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useEffect, useId, useRef, useState } from 'react'
import { GripVertical } from 'lucide-react'
import { useComposerToolbar, type ToolbarItem } from '../../hooks/useComposerToolbar'
import { SettingToggle } from '../settings/SettingControls'
import { SettingButton } from '../settings/SettingLayout'
import styles from './AiSettings.module.css'

const LABEL: Record<ToolbarItem, string> = {
  preset: 'Saved setup switcher', attach: 'Attach', capabilities: 'Capabilities', more: 'More', focused: 'Focused actions',
}

/** What each control holds — the chat shows these as icon menus, so the names alone don't say. */
const WHAT: Record<ToolbarItem, string> = {
  preset: 'switch between your saved chat setups',
  attach: 'add files or images to a message',
  capabilities: 'reply style, skills, Rules and this chat’s instructions',
  more: 'thinking, deep research, agent and web search',
  focused: 'Analyze, Ask or Quiz using only your notes',
}

/** Show / hide / reorder the chat composer's toolbar controls. */
export function ToolbarSettings() {
  const [{ order, hidden }, { move, toggle, reset }] = useComposerToolbar()
  const labelId = useId()
  const helpId = useId()
  const [announce, setAnnounce] = useState('')
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
    <div role="group" aria-labelledby={labelId}>
      <span id={labelId} className={styles.toolbarLabel}>Chat toolbar</span>
      <span id={helpId} className={styles.srOnly}>Press the up or down arrow key on a grip to move that control.</span>
      <span aria-live="polite" className={styles.srOnly}>{announce}</span>
      {order.map((item, i) => (
        <div
          key={item}
          ref={(el) => { rows.current[i] = el }}
          className={styles.toolbarRow}
        >
          <button
            type="button"
            title={`Reorder ${LABEL[item]}`}
            aria-label={`Reorder ${LABEL[item]}`}
            aria-describedby={helpId}
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
              const to = e.key === 'ArrowUp' ? i - 1 : i + 1
              move(i, to)
              if (to >= 0 && to < order.length) setAnnounce(`${LABEL[item]} moved to position ${to + 1} of ${order.length}`)
            }}
            className={styles.grip}
          >
            <GripVertical size={16} />
          </button>
          <SettingToggle
            checked={!hidden.includes(item)}
            onChange={() => toggle(item)}
            label={LABEL[item]}
            hint={WHAT[item]}
            ariaLabel={`Show ${LABEL[item]}`}
          />
        </div>
      ))}
      <div>
        <SettingButton onClick={reset}>Reset to default</SettingButton>
      </div>
    </div>
  )
}
