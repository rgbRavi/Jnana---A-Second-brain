import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import styles from '../Dashboard.module.css'
import type { GridItem } from '../types'

interface Props {
  /** Grid placement (units). Collapsed cards should already have their reduced h. */
  items: GridItem[]
  cols: number
  rowHeight: number
  margin: [number, number]
  isResizable?: (id: string) => boolean
  /** CSS selector for the move handle inside a card (e.g. ".dashboard-drag-handle"). */
  dragHandleSelector: string
  onChange: (items: GridItem[]) => void
  renderItem: (id: string) => ReactNode
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

function collides(a: GridItem, b: GridItem): boolean {
  if (a.i === b.i) return false
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

/** Vertical compaction with collision resolution: each item packs upward to
 *  fill gaps, then is pushed DOWN past anything it still overlaps — so growing
 *  or moving a card shifts its neighbours out of the way instead of overlapping.
 *  The moving item wins ties, so dragging it onto a row lands it above the row. */
function compact(items: GridItem[], movingId?: string): GridItem[] {
  const sorted = [...items].sort(
    (a, b) => a.y - b.y || (a.i === movingId ? -1 : b.i === movingId ? 1 : 0) || a.x - b.x,
  )
  const out: GridItem[] = []
  for (const it of sorted) {
    const item = { ...it }
    // Pack up as far as the space above is free.
    while (item.y > 0 && !out.some((p) => collides({ ...item, y: item.y - 1 }, p))) item.y--
    // Then drop below anything it still overlaps (resolve the collision).
    while (out.some((p) => collides(item, p))) item.y++
    out.push(item)
  }
  return out
}

/** A self-contained draggable + resizable grid (no external lib). Items are
 *  absolutely positioned; the layout auto-compacts vertically with no gaps. */
export function DashboardGrid({ items, cols, rowHeight, margin, isResizable, dragHandleSelector, onChange, renderItem }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [drag, setDrag] = useState<{ items: GridItem[]; movingId: string } | null>(null)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el)
    setWidth(el.clientWidth)
    return () => ro.disconnect()
  }, [])

  const [mx, my] = margin
  const colW = width > 0 ? (width - mx * (cols - 1)) / cols : 0
  const unitX = colW + mx
  const unitY = rowHeight + my

  const view = drag?.items ?? items
  const rows = view.reduce((m, it) => Math.max(m, it.y + it.h), 0)
  const height = rows > 0 ? rows * unitY - my : 0

  const pxLeft = (x: number) => x * unitX
  const pxTop = (y: number) => y * unitY
  const pxW = (w: number) => w * colW + (w - 1) * mx
  const pxH = (h: number) => h * rowHeight + (h - 1) * my

  const begin = (e: ReactPointerEvent, item: GridItem, kind: 'drag' | 'resize', axis?: string) => {
    if (colW <= 0) return
    e.preventDefault()
    const startX = e.clientX
    const startY = e.clientY
    const base = items.map((i) => ({ ...i }))
    document.body.style.userSelect = 'none'

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX
      const dy = ev.clientY - startY
      let candidate: GridItem[]
      if (kind === 'drag') {
        const nx = clamp(Math.round((pxLeft(item.x) + dx) / unitX), 0, cols - item.w)
        const ny = Math.max(0, Math.round((pxTop(item.y) + dy) / unitY))
        candidate = base.map((i) => (i.i === item.i ? { ...i, x: nx, y: ny } : i))
      } else {
        let w = item.w
        let h = item.h
        if (axis === 'e' || axis === 'se') {
          w = clamp(Math.round((pxW(item.w) + dx + mx) / unitX), item.minW ?? 1, cols - item.x)
        }
        if (axis === 's' || axis === 'se') {
          h = Math.max(item.minH ?? 1, Math.round((pxH(item.h) + dy + my) / unitY))
        }
        candidate = base.map((i) => (i.i === item.i ? { ...i, w, h } : i))
      }
      setDrag({ items: compact(candidate, item.i), movingId: item.i })
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      document.body.style.userSelect = ''
      setDrag((d) => {
        if (d) onChange(d.items)
        return null
      })
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const onItemPointerDown = (e: ReactPointerEvent, item: GridItem) => {
    const t = e.target as HTMLElement
    const handle = t.closest('[data-rg-handle]')
    if (handle) begin(e, item, 'resize', handle.getAttribute('data-rg-handle') ?? 'se')
    else if (t.closest(dragHandleSelector)) begin(e, item, 'drag')
  }

  return (
    <div ref={wrapRef} className={styles.grid} style={{ position: 'relative', width: '100%', height }}>
      {colW > 0 && view.map((item) => {
        const moving = drag?.movingId === item.i
        const resizable = isResizable ? isResizable(item.i) : true
        return (
          <div
            key={item.i}
            className={`${styles.gridItem} ${moving ? styles.gridItemMoving : ''}`}
            style={{ position: 'absolute', left: pxLeft(item.x), top: pxTop(item.y), width: pxW(item.w), height: pxH(item.h) }}
            onPointerDown={(e) => onItemPointerDown(e, item)}
          >
            {renderItem(item.i)}
            {resizable && (
              <>
                <span className={`${styles.rgHandle} ${styles.rgHandle_e}`} data-rg-handle="e" aria-hidden="true" />
                <span className={`${styles.rgHandle} ${styles.rgHandle_s}`} data-rg-handle="s" aria-hidden="true" />
                <span className={`${styles.rgHandle} ${styles.rgHandle_se}`} data-rg-handle="se" aria-hidden="true" />
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}
