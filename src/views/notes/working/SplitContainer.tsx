// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useRef, useState, type ReactNode } from 'react'
import type { SplitNode, PaneNode } from './layout'
import { setWorkingSplitSizes } from './useWorkingLayout'
import Styles from './WorkingNotes.module.css'

const MIN_FRACTION = 0.12

/**
 * Lays out a split node's children with flex `sizes` and a draggable divider
 * between each. Hand-rolled pointer events (not react-resizable — React 19
 * breaks its findDOMNode wiring), same gesture pattern as DashboardGrid / the
 * Canvas board. Sizes update locally during the drag and commit to the layout
 * store on release.
 */
export function SplitContainer({
  split,
  renderNode,
}: {
  split: SplitNode
  renderNode: (node: PaneNode) => ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [dragSizes, setDragSizes] = useState<number[] | null>(null)
  const sizes = dragSizes ?? split.sizes
  const horizontal = split.dir === 'row'

  const onDividerDown = (index: number) => (e: React.PointerEvent) => {
    e.preventDefault()
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    const rect = ref.current?.getBoundingClientRect()
    if (!rect) return
    const total = horizontal ? rect.width : rect.height
    const start = horizontal ? e.clientX : e.clientY
    const base = split.sizes.slice()

    const onMove = (ev: PointerEvent) => {
      const pos = horizontal ? ev.clientX : ev.clientY
      let delta = (pos - start) / total
      // Clamp so neither adjacent pane drops below MIN_FRACTION.
      delta = Math.max(delta, MIN_FRACTION - base[index])
      delta = Math.min(delta, base[index + 1] - MIN_FRACTION)
      const next = base.slice()
      next[index] = base[index] + delta
      next[index + 1] = base[index + 1] - delta
      setDragSizes(next)
    }
    const onUp = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      ;(e.target as HTMLElement).releasePointerCapture?.(ev.pointerId)
      setDragSizes((cur) => {
        if (cur) setWorkingSplitSizes(split.id, cur)
        return null
      })
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  // Keyboard resize: same clamp + commit as the pointer drag's release.
  const onDividerKey = (index: number) => (e: React.KeyboardEvent) => {
    const base = split.sizes
    const pair = base[index] + base[index + 1]
    const step = e.shiftKey ? 0.01 : 0.05
    const dec = horizontal ? 'ArrowLeft' : 'ArrowUp'
    const inc = horizontal ? 'ArrowRight' : 'ArrowDown'
    let first: number
    if (e.key === dec) first = base[index] - step * pair
    else if (e.key === inc) first = base[index] + step * pair
    else if (e.key === 'Home') first = MIN_FRACTION
    else if (e.key === 'End') first = pair - MIN_FRACTION
    else return
    e.preventDefault()
    first = Math.min(Math.max(first, MIN_FRACTION), pair - MIN_FRACTION)
    const next = base.slice()
    next[index] = first
    next[index + 1] = pair - first
    setWorkingSplitSizes(split.id, next)
  }

  return (
    <div
      ref={ref}
      className={horizontal ? Styles.splitRow : Styles.splitCol}
    >
      {split.children.map((child, i) => (
        <div className={Styles.splitChild} style={{ flexGrow: sizes[i] ?? 1, flexBasis: 0 }} key={child.id}>
          {renderNode(child)}
          {i < split.children.length - 1 && (
            <div
              className={horizontal ? Styles.dividerV : Styles.dividerH}
              onPointerDown={onDividerDown(i)}
              role="separator"
              tabIndex={0}
              aria-label="Resize panes"
              aria-orientation={horizontal ? 'vertical' : 'horizontal'}
              aria-valuenow={Math.round(((sizes[i] ?? 1) / ((sizes[i] ?? 1) + (sizes[i + 1] ?? 1))) * 100)}
              aria-valuemin={Math.round((MIN_FRACTION / ((sizes[i] ?? 1) + (sizes[i + 1] ?? 1))) * 100)}
              aria-valuemax={Math.round((1 - MIN_FRACTION / ((sizes[i] ?? 1) + (sizes[i + 1] ?? 1))) * 100)}
              onKeyDown={onDividerKey(i)}
            />
          )}
        </div>
      ))}
    </div>
  )
}
