// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Puzzle, X } from 'lucide-react'
import { listWidgets, subscribeContributions, getContributionsVersion } from '../lib/pluginContributions'
import PluginErrorBoundary from './PluginErrorBoundary'
import { pluginRegistry } from '../lib/pluginRegistry'
import Styles from './PluginWidgetHost.module.css'
import { useEscapeKey } from '../hooks/useEscapeKey'
import { useGeneralSettings } from '../hooks/useGeneralSettings'
import { eventBus } from '../lib/eventBus'

/**
 * The plugin widget tray — a floating launcher (bottom-right) that reveals the
 * panels plugins contribute via `ctx.ui.registerWidget` (e.g. a Pomodoro timer).
 * Reactive to the contributions registry, so widgets appear/vanish as plugins are
 * loaded/enabled. Renders nothing when no widgets are registered.
 */
export function PluginWidgetHost() {
  const version = useSyncExternalStore(subscribeContributions, getContributionsVersion)
  const [open, setOpen] = useState(false)
  const [{ showWidgetButton, autoHideWidgetButton }] = useGeneralSettings()
  const typing = useEditingFocus(showWidgetButton && autoHideWidgetButton)
  const widgets = listWidgets()
  const rootRef = useRef<HTMLDivElement>(null)
  /** Set by a React pointerdown inside the host, incl. portaled widget content. */
  const insideReact = useRef(false)
  useEscapeKey(() => setOpen(false))

  // Click anywhere else to dismiss, like every other popover. Widgets keep their state
  // in module stores (e.g. the Pomodoro timer keeps running), so closing loses nothing.
  // A widget's own portaled menu lives outside the panel's DOM, but React's synthetic
  // tree still contains it — a native listener can't tell, so check the React path.
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node) && !insideReact.current) setOpen(false)
      insideReact.current = false
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open])

  // The command palette's "Show plugin widgets" — the way in when the button is off.
  useEffect(() => {
    const toggle = () => setOpen((o) => !o)
    eventBus.on('widgets:toggle', toggle)
    return () => eventBus.off('widgets:toggle', toggle)
  }, [])

  if (widgets.length === 0) return null

  return (
    <div className={Styles.root} ref={rootRef} onPointerDownCapture={() => { insideReact.current = true }}>
      {open && (
        <div className={Styles.panel} role="dialog" aria-label="Plugin widgets">
          <div className={Styles.panelHead}>
            <span>Widgets</span>
            <button className={Styles.close} onClick={() => setOpen(false)} title="Close widgets (Esc)" aria-label="Close widgets">
              <X size={15} />
            </button>
          </div>
          <div className={Styles.panelBody}>
            {widgets.map((w) => {
              const Icon = w.icon
              const Component = w.Component
              return (
                <section key={w.id} className={Styles.widget}>
                  <header className={Styles.widgetTitle}>
                    {Icon && <Icon size={14} />} {w.title}
                  </header>
                  <PluginErrorBoundary key={version} name={w.title} pluginId={pluginRegistry.pluginIdForWidget(w.id)}>
                    <Component />
                  </PluginErrorBoundary>
                </section>
              )
            })}
          </div>
        </div>
      )}

      {showWidgetButton && <button
        className={`${Styles.launcher} ${typing && !open ? Styles.launcherHidden : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? 'Hide plugin widgets' : 'Show plugin widgets'}
        aria-expanded={open}
        title="Plugin widgets"
      >
        <Puzzle size={18} />
        <span className={Styles.count}>{widgets.length}</span>
      </button>}
    </div>
  )
}

/** True while focus sits in something you type into (input, textarea, the CM6 editor or any
 *  contenteditable) — the auto-hide signal. Inert (always false) when `enabled` is off. */
function useEditingFocus(enabled: boolean): boolean {
  const [editing, setEditing] = useState(false)
  useEffect(() => {
    if (!enabled) { setEditing(false); return }
    const check = () => {
      const el = document.activeElement as HTMLElement | null
      setEditing(!!el && (el.isContentEditable || el.matches('input:not([type=checkbox]):not([type=radio]):not([type=button]), textarea, select')))
    }
    // focusout fires before the next element is focused; re-check once it has settled.
    let t: ReturnType<typeof setTimeout> | undefined
    const onOut = () => { clearTimeout(t); t = setTimeout(check) }
    check()
    document.addEventListener('focusin', check)
    document.addEventListener('focusout', onOut)
    return () => {
      clearTimeout(t)
      document.removeEventListener('focusin', check)
      document.removeEventListener('focusout', onOut)
    }
  }, [enabled])
  return editing
}
