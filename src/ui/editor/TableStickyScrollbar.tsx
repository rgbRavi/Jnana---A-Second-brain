// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// A horizontal scrollbar that rides the bottom edge of a wide table's clipping
// container (the notes list, the modal body, or the viewport) and proxies the
// table's own overflow-x scroll. It appears only while the table overflows
// horizontally AND its own (in-flow) bottom scrollbar is clipped out of view —
// so you can still scroll a long table sideways without scrolling to its bottom.
// When the table's bottom is on screen, its native scrollbar suffices and this
// hides. Portaled to <body> so `position: fixed` tracks the viewport.
//
// The "is the native bar reachable?" test is against the nearest *clipping*
// ancestor's bottom — not the viewport — so it works inside a scroll container
// (e.g. NoteModal's body, which clips above the viewport bottom).
//
// Sync is one-directional per source to avoid a feedback loop:
//   • proxy scrolls (user drags it) → write the real element's scrollLeft
//   • real element scrolls (native bar / proxy-driven) → write the proxy's scrollLeft
// The capture-phase listener only recomputes geometry and mirrors when the event
// target is the real element — never for a proxy-originated scroll (which fires
// in capture before onScroll runs, and would yank the proxy back to the stale
// position: the "resists and snaps left" bug).

import { useEffect, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import styles from './MarkdownLite.module.css'

type Geom = { left: number; width: number; bottom: number; scrollWidth: number }

const sameGeom = (a: Geom | null, b: Geom | null) =>
  a === b || (!!a && !!b && a.left === b.left && a.width === b.width && a.bottom === b.bottom && a.scrollWidth === b.scrollWidth)

/** Intersection of every clipping (overflow ≠ visible) ancestor's rect with the
 *  viewport — the region within which `el`'s own scrollbar is actually reachable. */
function clipRectFor(el: HTMLElement): { top: number; left: number; right: number; bottom: number } {
  let top = 0
  let left = 0
  let right = window.innerWidth
  let bottom = window.innerHeight
  for (let node = el.parentElement; node; node = node.parentElement) {
    const s = getComputedStyle(node)
    if (s.overflowX !== 'visible' || s.overflowY !== 'visible') {
      const r = node.getBoundingClientRect()
      top = Math.max(top, r.top)
      left = Math.max(left, r.left)
      right = Math.min(right, r.right)
      bottom = Math.min(bottom, r.bottom)
    }
  }
  return { top, left, right, bottom }
}

export function TableStickyScrollbar({ scrollRef }: { scrollRef: RefObject<HTMLElement | null> }) {
  const [geom, setGeom] = useState<Geom | null>(null)
  const geomRef = useRef<Geom | null>(null)
  const proxyRef = useRef<HTMLDivElement>(null)
  // Guards the two-way scrollLeft mirror from re-entering itself.
  const syncing = useRef(false)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    const recompute = () => {
      const overflowing = el.scrollWidth > el.clientWidth + 1
      const rect = el.getBoundingClientRect()
      const clip = clipRectFor(el)
      const visLeft = Math.max(rect.left, clip.left)
      const visRight = Math.min(rect.right, clip.right)
      const visibleWidth = visRight - visLeft
      const partlyVisible = rect.top < clip.bottom && rect.bottom > clip.top && visibleWidth > 0
      // The table's own scrollbar sits at rect.bottom; it's reachable only when
      // that's within the clip region. Below it → show our floating bar.
      const nativeReachable = rect.bottom <= clip.bottom + 1
      const show = overflowing && partlyVisible && !nativeReachable
      const next: Geom | null = show
        ? { left: visLeft, width: visibleWidth, bottom: window.innerHeight - clip.bottom, scrollWidth: el.scrollWidth }
        : null
      if (!sameGeom(geomRef.current, next)) {
        geomRef.current = next
        setGeom(next)
      }
    }
    // Mirror the real element's scroll position onto the proxy (real → proxy).
    const mirrorToProxy = () => {
      if (syncing.current || !proxyRef.current) return
      syncing.current = true
      proxyRef.current.scrollLeft = el.scrollLeft
      syncing.current = false
    }

    recompute()
    mirrorToProxy()

    const onAnyScroll = (e: Event) => {
      recompute()
      if (e.target === el) mirrorToProxy()
    }
    document.addEventListener('scroll', onAnyScroll, true)
    window.addEventListener('resize', recompute)
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(recompute) : null
    ro?.observe(el)
    return () => {
      document.removeEventListener('scroll', onAnyScroll, true)
      window.removeEventListener('resize', recompute)
      ro?.disconnect()
    }
  }, [scrollRef])

  if (!geom) return null
  return createPortal(
    <div
      ref={proxyRef}
      className={styles.tableStickyScroll}
      style={{ left: geom.left, width: geom.width, bottom: geom.bottom }}
      onScroll={() => {
        const el = scrollRef.current
        if (!el || syncing.current || !proxyRef.current) return
        syncing.current = true
        el.scrollLeft = proxyRef.current.scrollLeft
        syncing.current = false
      }}
    >
      <div className={styles.tableStickyScrollSpacer} style={{ width: geom.scrollWidth }} />
    </div>,
    document.body,
  )
}
