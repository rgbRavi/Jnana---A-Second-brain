// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// The app-global right toolbar rail — a second sidebar on the far right of the
// flex appShell (so opening it shrinks `main`: composer + list, no width math).
// It's an extensible dock: panels come from the rightRailPanels registry (the
// Table tools are the first built-in; plugins/core can add more). A thin icon
// strip shows one icon per *available* panel; clicking one opens its body to the
// strip's left. When no panel is available the rail renders nothing (zero width →
// composer full). Mirrors the FileExplorer second-sidebar + persisted-store pattern.

import { useCallback, useEffect, useState, useSyncExternalStore, type ComponentType } from 'react'
import { PanelRightClose, Table } from 'lucide-react'
import {
  getRailPanelsVersion,
  listRailPanels,
  registerRailPanel,
  subscribeRailPanels,
  type RailPanel,
} from '../../lib/rightRailPanels'
import { useActiveTable } from '../../lib/activeTable'
import { TableToolPanel } from './TableToolPanel'
import styles from './RightRail.module.css'

// ── Which panel is open (persisted module store; '' = collapsed to icon strip) ──
const OPEN_KEY = 'jnana.rightrail.open.v1'
let openId = (() => {
  try {
    return localStorage.getItem(OPEN_KEY) ?? ''
  } catch {
    return ''
  }
})()
const openListeners = new Set<() => void>()
function setOpenPanel(id: string): void {
  openId = id
  try {
    localStorage.setItem(OPEN_KEY, id)
  } catch {
    /* storage unavailable */
  }
  openListeners.forEach((l) => l())
}
function useOpenPanel(): string {
  return useSyncExternalStore(
    (l) => {
      openListeners.add(l)
      return () => openListeners.delete(l)
    },
    () => openId,
    () => openId,
  )
}

function useRailPanels(): RailPanel[] {
  useSyncExternalStore(subscribeRailPanels, getRailPanelsVersion, getRailPanelsVersion)
  return listRailPanels()
}

// One invisible probe per registered panel calls that panel's availability hook
// exactly once (stable hook count) and lifts the boolean up — so the rail can
// decide whether to render at all without calling hooks in a dynamic loop.
function RailProbe({ panel, onChange }: { panel: RailPanel; onChange: (id: string, avail: boolean) => void }) {
  const avail = panel.useAvailable?.() ?? true
  useEffect(() => {
    onChange(panel.id, avail)
  }, [avail, panel.id, onChange])
  useEffect(() => () => onChange(panel.id, false), [panel.id, onChange])
  return null
}

export function RightRail() {
  const panels = useRailPanels()
  const openPanelId = useOpenPanel()
  const [avail, setAvail] = useState<Record<string, boolean>>({})
  const reportAvail = useCallback(
    (id: string, a: boolean) => setAvail((prev) => (prev[id] === a ? prev : { ...prev, [id]: a })),
    [],
  )

  const probes = panels.map((p) => <RailProbe key={p.id} panel={p} onChange={reportAvail} />)
  const available = panels.filter((p) => avail[p.id])
  if (available.length === 0) return <>{probes}</>

  const open = available.find((p) => p.id === openPanelId) ?? null
  const Body: ComponentType | null = open ? open.Component : null

  return (
    <>
      {probes}
      <div className={styles.rail}>
        {open && Body && (
          <div className={styles.body}>
            <div className={styles.bodyHeader}>
              <span className={styles.bodyTitle}>{open.title}</span>
              <button className={styles.bodyClose} title="Collapse panel" aria-label="Collapse panel" onClick={() => setOpenPanel('')}>
                <PanelRightClose size={16} />
              </button>
            </div>
            <div className={styles.bodyScroll}>
              <Body />
            </div>
          </div>
        )}
        <div className={styles.strip}>
          {available.map((p) => (
            <button
              key={p.id}
              className={p.id === openPanelId ? `${styles.iconBtn} ${styles.iconBtnActive}` : styles.iconBtn}
              title={p.title}
              aria-label={p.title}
              aria-pressed={p.id === openPanelId}
              onClick={() => setOpenPanel(openPanelId === p.id ? '' : p.id)}
            >
              <p.icon size={18} />
            </button>
          ))}
        </div>
      </div>
    </>
  )
}

/** Register the built-in rail panels. Called once at boot from main.tsx (next to
 *  registerBuiltinPlugins). Kept here so the lib registry stays UI-free. */
export function registerBuiltinRailPanels(): void {
  registerRailPanel({
    id: 'table-tools',
    title: 'Table tools',
    icon: Table,
    order: 10,
    useAvailable: () => useActiveTable().present,
    Component: TableToolPanel,
  })
}
