// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
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
  /** Human name for an item, used in keyboard-move announcements (defaults to the id). */
  itemLabel?: (id: string) => string
}

/** Below this container width the grid is a derived single column (not stored). */
const NARROW_PX = 720

const byYX = (a: GridItem, b: GridItem) => a.y - b.y || a.x - b.x

/** Single-column layout in visual order, heights unchanged. */
function stack(items: GridItem[], cols: number): GridItem[] {
  let y = 0
  return [...items].sort(byYX).map((it) => {
    const out = { ...it, x: 0, w: cols, y }
    y += it.h
    return out
  })
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
export function compact(items: GridItem[], movingId?: string): GridItem[] {
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
export function DashboardGrid({ items, cols, rowHeight, margin, isResizable, dragHandleSelector, onChange, renderItem, itemLabel }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [live, setLive] = useState('')
  const focusId = useRef<string | null>(null)
  const [drag, setDrag] = useState<{
    items: GridItem[]
    movingId: string
    /** Pixel rect of the moving card while it tracks the cursor. */
    ghost: { left: number; top: number; width: number; height: number }
  } | null>(null)

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

  // Render each card's content once and reuse the elements — so dragging/resizing
  // (which only changes positions) never re-renders heavy widgets like the graph.
  const contents = useMemo(() => {
    const map: Record<string, ReactNode> = {}
    for (const it of items) map[it.i] = renderItem(it.i)
    return map
  }, [items, renderItem])

  const narrow = width > 0 && width < NARROW_PX
  const base = useMemo(() => (narrow ? stack(items, cols) : items), [narrow, items, cols])
  // DOM order = visual order (committed layout only, so a drag doesn't reshuffle nodes).
  const order = useMemo(() => [...base].sort(byYX), [base])
  const view = drag?.items ?? base
  const viewById = useMemo(() => new Map(view.map((it) => [it.i, it])), [view])

  // Re-assert focus on a keyboard-moved grip (a DOM reorder can blur it).
  useLayoutEffect(() => {
    const id = focusId.current
    if (!id) return
    focusId.current = null
    wrapRef.current?.querySelector<HTMLElement>(`[data-grid-id="${CSS.escape(id)}"] ${dragHandleSelector}`)?.focus()
  }, [items, dragHandleSelector])
  const rows = view.reduce((m, it) => Math.max(m, it.y + it.h), 0)
  const height = rows > 0 ? rows * unitY - my : 0

  const pxLeft = (x: number) => x * unitX
  const pxTop = (y: number) => y * unitY
  const pxW = (w: number) => w * colW + (w - 1) * mx
  const pxH = (h: number) => h * rowHeight + (h - 1) * my

  const begin = (e: ReactPointerEvent, item: GridItem, kind: 'drag' | 'resize', axis?: string) => {
    if (colW <= 0 || narrow) return
    e.preventDefault()
    const startX = e.clientX
    const startY = e.clientY
    const base = items.map((i) => ({ ...i }))
    document.body.style.userSelect = 'none'
    let lastKey = ''

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX
      const dy = ev.clientY - startY
      let key: string
      let target: Partial<GridItem>
      let ghost: { left: number; top: number; width: number; height: number }
      if (kind === 'drag') {
        const nx = clamp(Math.round((pxLeft(item.x) + dx) / unitX), 0, cols - item.w)
        const ny = Math.max(0, Math.round((pxTop(item.y) + dy) / unitY))
        key = `${nx},${ny}`
        target = { x: nx, y: ny }
        ghost = { left: pxLeft(item.x) + dx, top: pxTop(item.y) + dy, width: pxW(item.w), height: pxH(item.h) }
      } else {
        let x = item.x
        let y = item.y
        let w = item.w
        let h = item.h

        if (axis === 'e' || axis === 'ne' || axis === 'se') {
          w = clamp(Math.round((pxW(item.w) + dx + mx) / unitX), item.minW ?? 1, cols - item.x)
        }
        if (axis === 'w' || axis === 'nw' || axis === 'sw') {
          const minX = item.x + item.w - (item.minW ?? 1)
          const nextX = clamp(Math.round((pxLeft(item.x) + dx) / unitX), 0, minX)
          const deltaCols = item.x - nextX
          x = nextX
          w = item.w + deltaCols
        }
        if (axis === 's' || axis === 'se' || axis === 'sw') {
          h = Math.max(item.minH ?? 1, Math.round((pxH(item.h) + dy + my) / unitY))
        }
        if (axis === 'n' || axis === 'ne' || axis === 'nw') {
          const minY = item.y + item.h - (item.minH ?? 1)
          const nextY = clamp(Math.round((pxTop(item.y) + dy) / unitY), 0, minY)
          const deltaRows = item.y - nextY
          y = nextY
          h = item.h + deltaRows
        }

        key = `${x},${y} ${w}x${h}`
        target = { x, y, w, h }

        let left = pxLeft(item.x)
        let top = pxTop(item.y)
        let width = pxW(item.w)
        let height = pxH(item.h)

        // The ghost follows the pointer in raw pixels on every edge — snapping it
        // to whole cells on the w/n edges (as the grid target below does) made
        // those drags visibly step instead of glide.
        if (axis === 'e' || axis === 'ne' || axis === 'se') {
          width = Math.max(pxW(item.minW ?? 1), pxW(item.w) + dx)
        }
        if (axis === 'w' || axis === 'nw' || axis === 'sw') {
          const maxLeft = pxLeft(item.x) + pxW(item.w) - pxW(item.minW ?? 1)
          left = clamp(pxLeft(item.x) + dx, 0, maxLeft)
          width = pxW(item.w) + (pxLeft(item.x) - left)
        }
        if (axis === 's' || axis === 'se' || axis === 'sw') {
          height = Math.max(pxH(item.minH ?? 1), pxH(item.h) + dy)
        }
        if (axis === 'n' || axis === 'ne' || axis === 'nw') {
          const maxTop = pxTop(item.y) + pxH(item.h) - pxH(item.minH ?? 1)
          top = clamp(pxTop(item.y) + dy, 0, maxTop)
          height = pxH(item.h) + (pxTop(item.y) - top)
        }

        ghost = { left, top, width, height }
      }
      // The moving card tracks the cursor every frame (ghost); the rest only
      // re-flow when the target grid cell/size actually changes.
      const changed = key !== lastKey
      if (changed) lastKey = key
      setDrag((prev) => {
        const itemsNext =
          changed || !prev ? compact(base.map((i) => (i.i === item.i ? { ...i, ...target } : i)), item.i) : prev.items
        return { items: itemsNext, movingId: item.i, ghost }
      })
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

  const onItemKeyDown = (e: ReactKeyboardEvent, item: GridItem) => {
    if (narrow || e.target !== (e.target as HTMLElement).closest(dragHandleSelector)) return
    const dx = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    const dy = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0
    if (!dx && !dy) return
    e.preventDefault()
    const label = itemLabel ? itemLabel(item.i) : item.i
    let next: GridItem = item
    if (e.shiftKey) {
      if (isResizable && !isResizable(item.i)) return
      next = {
        ...item,
        w: clamp(item.w + dx, item.minW ?? 1, cols - item.x),
        h: Math.max(item.minH ?? 1, item.h + dy),
      }
    } else if (dx) {
      next = { ...item, x: clamp(item.x + dx, 0, cols - item.w) }
    } else {
      // Swap past the nearest card above/below in an overlapping column: a plain
      // y±1 would be pushed straight back by collision resolution.
      const cols_ = items.filter((o) => o.i !== item.i && o.x < item.x + item.w && o.x + o.w > item.x)
      if (dy < 0) {
        const above = cols_.filter((o) => o.y < item.y).sort((a, b) => b.y - a.y)[0]
        if (above) next = { ...item, y: above.y }
      } else {
        const below = cols_.filter((o) => o.y > item.y).sort((a, b) => a.y - b.y)[0]
        if (below) next = { ...item, y: below.y + 1 }
      }
    }
    const out = compact(items.map((i) => (i.i === item.i ? next : i)), item.i)
    const moved = out.find((i) => i.i === item.i)
    const before = items.find((i) => i.i === item.i)
    if (!moved || !before) return
    const same = out.every((o) => {
      const p = items.find((i) => i.i === o.i)
      return p && p.x === o.x && p.y === o.y && p.w === o.w && p.h === o.h
    })
    if (same) return setLive(`${label} can't move further`)
    focusId.current = item.i
    setLive(
      e.shiftKey
        ? `${label} resized to ${moved.w} by ${moved.h}`
        : `${label} moved to column ${moved.x + 1}, row ${moved.y + 1}`,
    )
    onChange(out)
  }

  return (
    <div ref={wrapRef} className={`${styles.grid} ${narrow ? styles.gridStacked : ''}`} style={{ position: 'relative', width: '100%', height }}>
      <div className={styles.gridLive} role="status" aria-live="polite">{live}</div>
      {colW > 0 && order.map((o) => {
        const item = viewById.get(o.i) ?? o
        const moving = drag?.movingId === item.i
        const resizable = isResizable ? isResizable(item.i) : true
        const rect =
          moving && drag
            ? drag.ghost
            : { left: pxLeft(item.x), top: pxTop(item.y), width: pxW(item.w), height: pxH(item.h) }
        return (
          <div
            key={item.i}
            data-grid-id={item.i}
            className={`${styles.gridItem} ${moving ? styles.gridItemMoving : ''}`}
            // Position via transform (not left/top) so the reflow animation runs
            // on the compositor instead of thrashing layout — matches the
            // transform-only transition in .gridItem.
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: rect.width,
              height: rect.height,
              transform: `translate(${rect.left}px, ${rect.top}px)`,
            }}
            onPointerDown={(e) => onItemPointerDown(e, item)}
            onKeyDown={(e) => onItemKeyDown(e, item)}
          >
            {contents[item.i]}
            {resizable && !narrow && (
              <>
                <span className={`${styles.rgHandle} ${styles.rgHandle_e}`} data-rg-handle="e" aria-hidden="true" />
                <span className={`${styles.rgHandle} ${styles.rgHandle_w}`} data-rg-handle="w" aria-hidden="true" />
                <span className={`${styles.rgHandle} ${styles.rgHandle_n}`} data-rg-handle="n" aria-hidden="true" />
                <span className={`${styles.rgHandle} ${styles.rgHandle_s}`} data-rg-handle="s" aria-hidden="true" />
                <span className={`${styles.rgHandle} ${styles.rgHandle_ne}`} data-rg-handle="ne" aria-hidden="true" />
                <span className={`${styles.rgHandle} ${styles.rgHandle_nw}`} data-rg-handle="nw" aria-hidden="true" />
                <span className={`${styles.rgHandle} ${styles.rgHandle_se}`} data-rg-handle="se" aria-hidden="true" />
                <span className={`${styles.rgHandle} ${styles.rgHandle_sw}`} data-rg-handle="sw" aria-hidden="true" />
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}
