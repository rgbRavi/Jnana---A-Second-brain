// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Styles from './Tooltip.module.css'

/**
 * A single global, themed replacement for the native OS `title` tooltip.
 *
 * Mounted once (in AppLayout), it delegates over the whole document: on hover of
 * any element carrying a `title`, it *removes* that attribute (suppressing the
 * stock grey OS box), stashes it, and renders a token-styled tooltip portaled to
 * `<body>` — restoring `title` on mouse-out so screen-reader semantics are kept.
 *
 * No per-button wiring: every existing `title="…"` in the app is upgraded, and so
 * is any added later. Positioned above the target (flipping below near the top
 * edge) and clamped to the viewport. Also shown on keyboard focus; Esc dismisses.
 */
interface Tip {
  text: string
  anchor: DOMRect
}

const SHOW_DELAY = 350
const FOCUS_DELAY = 80

export function Tooltip() {
  const [tip, setTip] = useState<Tip | null>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  // The element whose native title we've currently borrowed (removed to suppress
  // the OS box), plus the text to restore.
  const active = useRef<{ el: HTMLElement; title: string } | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const shownRef = useRef(false)
  shownRef.current = !!tip

  useEffect(() => {
    const restore = () => {
      const a = active.current
      if (a && a.el.isConnected) a.el.setAttribute('title', a.title)
      active.current = null
    }
    const clear = () => {
      window.clearTimeout(timer.current)
      restore()
      setTip(null)
      setPos(null)
    }
    const activate = (el: HTMLElement, delay = SHOW_DELAY) => {
      const title = el.getAttribute('title')
      if (!title) return
      el.removeAttribute('title') // suppress the native tooltip
      active.current = { el, title }
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => {
        if (active.current?.el === el) setTip({ text: title, anchor: el.getBoundingClientRect() })
      }, delay)
    }
    const onOver = (e: PointerEvent) => {
      const target = e.target as Element | null
      // Still hovering within the currently-tipped element (e.g. an icon inside
      // the button) — keep it.
      if (active.current && target && active.current.el.contains(target)) return
      const el = target?.closest?.('[title]') as HTMLElement | null
      if (!el || el.tagName === 'IFRAME') {
        if (active.current) clear()
        return
      }
      if (active.current) clear() // restore the previous one before switching
      activate(el)
    }
    const onOut = (e: PointerEvent) => {
      if (!active.current) return
      const related = e.relatedTarget as Node | null
      // Left the tipped element entirely (not just into one of its descendants).
      if (!related || !active.current.el.contains(related)) clear()
    }
    const onDismiss = () => clear()
    // Keyboard: show on keyboard focus (:focus-visible), hide on blur, Esc dismisses (WCAG 1.4.13).
    const onFocusIn = (e: FocusEvent) => {
      const el = (e.target as Element | null)?.closest?.('[title]') as HTMLElement | null
      if (!el || el.tagName === 'IFRAME') return
      let visible = true
      try {
        visible = el.matches(':focus-visible')
      } catch {
        /* engine without :focus-visible — treat as keyboard */
      }
      if (!visible) return
      if (active.current) clear()
      activate(el, FOCUS_DELAY)
    }
    const onFocusOut = (e: FocusEvent) => {
      if (active.current && active.current.el.contains(e.target as Node)) clear()
    }
    // Esc always dismisses. Other keys dismiss only a tip on the focused control (Enter /
    // Space may remove the trigger, which would strand the tip) — a hover tip stays, so
    // typing elsewhere doesn't hand the restored title back to the native OS tooltip.
    // Esc is swallowed only for the focused control's tip, never a hover tip's: that
    // Esc is meant for the modal/menu (useEscapeKey skips prevented keys).
    const onKey = (e: KeyboardEvent) => {
      const a = active.current
      if (!a) return
      const owned = a.el.contains(document.activeElement)
      if (e.key !== 'Escape' && !owned) return
      const shown = shownRef.current
      clear()
      if (e.key === 'Escape' && owned && shown) e.preventDefault()
    }

    document.addEventListener('pointerover', onOver, true)
    document.addEventListener('pointerout', onOut, true)
    document.addEventListener('pointerdown', onDismiss, true)
    document.addEventListener('focusin', onFocusIn, true)
    document.addEventListener('focusout', onFocusOut, true)
    document.addEventListener('keydown', onKey, true)
    window.addEventListener('scroll', onDismiss, true)
    window.addEventListener('resize', onDismiss)
    return () => {
      document.removeEventListener('pointerover', onOver, true)
      document.removeEventListener('pointerout', onOut, true)
      document.removeEventListener('pointerdown', onDismiss, true)
      document.removeEventListener('focusin', onFocusIn, true)
      document.removeEventListener('focusout', onFocusOut, true)
      document.removeEventListener('keydown', onKey, true)
      window.removeEventListener('scroll', onDismiss, true)
      window.removeEventListener('resize', onDismiss)
      window.clearTimeout(timer.current)
      restore()
    }
  }, [])

  // Measure the rendered tooltip and place it above the anchor (flip below near
  // the top edge), clamped to the viewport. Runs before paint, so no flash.
  useLayoutEffect(() => {
    if (!tip || !ref.current) return
    const t = ref.current.getBoundingClientRect()
    const a = tip.anchor
    const gap = 8
    const margin = 6
    const fitsAbove = a.top - t.height - gap >= margin
    let top = fitsAbove ? a.top - t.height - gap : a.bottom + gap
    let left = a.left + a.width / 2 - t.width / 2
    left = Math.max(margin, Math.min(left, window.innerWidth - t.width - margin))
    top = Math.max(margin, Math.min(top, window.innerHeight - t.height - margin))
    setPos({ left, top })
  }, [tip])

  if (!tip) return null
  return createPortal(
    <div
      ref={ref}
      className={Styles.tooltip}
      role="tooltip"
      style={{
        left: pos?.left ?? -9999,
        top: pos?.top ?? -9999,
        visibility: pos ? 'visible' : 'hidden',
      }}
    >
      {tip.text}
    </div>,
    document.body,
  )
}
