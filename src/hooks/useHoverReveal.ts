// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Show/hide state for an auto-hiding side panel (AI chat history, file explorer):
 * spread `bind` on the wrapper that holds the edge strip + panel.
 *
 * - Hover opens it; leaving hides it after a short grace period.
 * - Keyboard focus (Tab) or a text field inside keeps it open. A mouse click on a
 *   row doesn't, or the panel would never hide after you pick something.
 * - `hold` keeps it open while the panel is mid-task (a menu or rename box is open).
 * - `peek()` shows it for a moment without a hover (e.g. "Reveal in file explorer");
 *   hovering it during that time keeps it open as usual.
 *
 * React treats a portaled child (e.g. a ContextMenu) as inside for mouse enter/leave,
 * so moving onto a menu the panel opened doesn't hide it.
 */
export function useHoverReveal(hold: boolean) {
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])

  const peek = useCallback((ms = 2500) => {
    clearTimeout(timer.current)
    setHovered(true)
    timer.current = setTimeout(() => setHovered(false), ms)
  }, [])

  const bind = {
    onMouseEnter: () => { clearTimeout(timer.current); setHovered(true) },
    onMouseLeave: () => { timer.current = setTimeout(() => setHovered(false), 250) },
    onFocus: (e: React.FocusEvent) => {
      const t = e.target as HTMLElement
      if (t.matches('input, textarea') || t.matches(':focus-visible')) setFocused(true)
    },
    onBlur: (e: React.FocusEvent<HTMLElement>) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node)) setFocused(false)
    },
  }
  return { show: hovered || focused || hold, bind, peek }
}
