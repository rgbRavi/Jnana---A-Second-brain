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
              aria-orientation={horizontal ? 'vertical' : 'horizontal'}
            />
          )}
        </div>
      ))}
    </div>
  )
}
