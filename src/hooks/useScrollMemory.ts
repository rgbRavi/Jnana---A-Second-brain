// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Remembers a scroll container's offset across route unmount/remount. Routes are
// unmounted by react-router on every view switch, so a view that scrolls inside
// its own element (Home's .homeContainer, say) comes back at the top unless its
// offset is parked outside the component — the same reason useViewState exists,
// and the same trick GraphView's savedViewports uses for zoom/pan.
//
// In-memory only: a full reload starts at the top again, deliberately.

import { useCallback, useEffect, useRef } from 'react'

const offsets = new Map<string, number>()

/** How long to keep re-applying the offset while late content lands. */
const RESTORE_WINDOW_MS = 1500

/** Forget a stored offset — e.g. when a view's content changes underneath it. */
export function clearScrollMemory(key: string): void {
  offsets.delete(key)
}

/**
 * Returns a ref for the scrolling element plus the `onScroll` handler to put on
 * it. Restores that element's last offset on mount and records it as the user
 * scrolls.
 *
 * `ready` gates the restore for views whose content arrives a tick after mount;
 * pass false until there's something to scroll.
 */
export function useScrollMemory<T extends HTMLElement>(key: string, ready = true) {
  const elRef = useRef<T | null>(null)
  const done = useRef(false)
  const saveFrame = useRef(0)
  /** The offset we last wrote ourselves — lets onScroll tell us from the user. */
  const applied = useRef<number | null>(null)

  useEffect(() => {
    const el = elRef.current
    const saved = offsets.get(key)
    if (!el || !ready || done.current || !saved) return

    // Setting scrollTop past the content clamps it, and these views grow after
    // mount as their data lands. Nothing useful fires on that growth — the
    // container's own box never changes size, only its scrollHeight — so poll
    // for a short window and stop the moment the offset sticks.
    let raf = 0
    const deadline = performance.now() + RESTORE_WINDOW_MS
    const tick = () => {
      const node = elRef.current
      if (!node || done.current) return
      node.scrollTop = saved
      applied.current = node.scrollTop
      if (node.scrollTop >= saved || performance.now() > deadline) {
        done.current = true
        return
      }
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [key, ready])

  useEffect(() => {
    return () => {
      cancelAnimationFrame(saveFrame.current)
      // Park the final position: the scroll handler is throttled, so the last
      // frame before navigating away may not have been recorded yet.
      const el = elRef.current
      if (el) offsets.set(key, el.scrollTop)
    }
  }, [key])

  const onScroll = useCallback(() => {
    const el = elRef.current
    if (!el) return
    // A scroll we didn't cause means the user took over — stop restoring, or
    // the next poll tick would yank them back.
    if (!done.current && el.scrollTop !== applied.current) done.current = true

    // Throttled to one write per frame — scroll fires far more often than that.
    cancelAnimationFrame(saveFrame.current)
    saveFrame.current = requestAnimationFrame(() => {
      const node = elRef.current
      if (node) offsets.set(key, node.scrollTop)
    })
  }, [key])

  return { ref: elRef, onScroll }
}
