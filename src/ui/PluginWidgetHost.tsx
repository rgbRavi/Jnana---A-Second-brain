// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useState, useSyncExternalStore } from 'react'
import { Puzzle, X } from 'lucide-react'
import { listWidgets, subscribeContributions, getContributionsVersion } from '../lib/pluginContributions'
import Styles from './PluginWidgetHost.module.css'

/**
 * The plugin widget tray — a floating launcher (bottom-right) that reveals the
 * panels plugins contribute via `ctx.ui.registerWidget` (e.g. a Pomodoro timer).
 * Reactive to the contributions registry, so widgets appear/vanish as plugins are
 * loaded/enabled. Renders nothing when no widgets are registered.
 */
export function PluginWidgetHost() {
  useSyncExternalStore(subscribeContributions, getContributionsVersion)
  const [open, setOpen] = useState(false)
  const widgets = listWidgets()

  if (widgets.length === 0) return null

  return (
    <div className={Styles.root}>
      {open && (
        <div className={Styles.panel} role="dialog" aria-label="Plugin widgets">
          <div className={Styles.panelHead}>
            <span>Widgets</span>
            <button className={Styles.close} onClick={() => setOpen(false)} aria-label="Close widgets">
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
                  <Component />
                </section>
              )
            })}
          </div>
        </div>
      )}

      <button
        className={Styles.launcher}
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? 'Hide plugin widgets' : 'Show plugin widgets'}
        aria-expanded={open}
        title="Plugin widgets"
      >
        <Puzzle size={18} />
        <span className={Styles.count}>{widgets.length}</span>
      </button>
    </div>
  )
}
