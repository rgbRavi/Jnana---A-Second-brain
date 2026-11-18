// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Folder } from 'lucide-react'
import { useEscapeKey } from '../hooks/useEscapeKey'
import { useWorkspaces } from '../hooks/useWorkspaces'
import { getActiveWorkspaceId } from '../hooks/useActiveWorkspace'
import { useAiScope, setScopeMode, setScopeWorkspace, type AiScope } from '../hooks/useAiScope'
import type { Workspace } from '../types'
import styles from './ScopeBar.module.css'

/**
 * Compact "from: Entire vault ▾" scope picker for the AI composer: range over
 * the whole vault or a single workspace. Writes the persisted AI-scope store,
 * which the AI view reads via useScopedNoteIds.
 */
export function ScopeBar() {
  const scope = useAiScope()
  const { workspaces } = useWorkspaces()

  // Default the workspace selection when first switching to workspace scope.
  useEffect(() => {
    if (scope.mode === 'workspace' && !scope.workspaceId && workspaces.length > 0) {
      const preferred = getActiveWorkspaceId()
      const exists = preferred && workspaces.some((w) => w.id === preferred)
      setScopeWorkspace(exists ? preferred : workspaces[0].id)
    }
  }, [scope.mode, scope.workspaceId, workspaces])

  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)

  const current = scope.mode === 'workspace' ? workspaces.find((w) => w.id === scope.workspaceId) : null
  const label = scope.mode === 'vault' ? 'Entire vault' : current?.name ?? 'Workspace'

  const menu = open && (
    <ScopeMenu
      anchor={btnRef}
      workspaces={workspaces}
      scope={scope}
      onClose={() => setOpen(false)}
    />
  )

  return (
    <span className={styles.compact}>
      <button
        ref={btnRef}
        type="button"
        className={styles.compactBtn}
        title="Which notes grounded answers use"
        aria-label={`Notes source: ${label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        from: <span className={styles.compactValue}>{label}</span> <ChevronDown size={12} aria-hidden />
      </button>
      {menu}
    </span>
  )
}

/** Portaled menu listing the vault and each workspace; opens upward (the trigger sits above the composer). */
function ScopeMenu({
  anchor,
  workspaces,
  scope,
  onClose,
}: {
  anchor: RefObject<HTMLButtonElement | null>
  workspaces: Workspace[]
  scope: AiScope
  onClose: () => void
}) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; bottom: number } | null>(null)
  useEscapeKey(onClose)

  useLayoutEffect(() => {
    if (!anchor.current) return
    const r = anchor.current.getBoundingClientRect()
    // The trigger sits above the composer near the viewport bottom, so open upward.
    setPos({ left: r.left, bottom: window.innerHeight - r.top + 4 })
  }, [anchor])

  useEffect(() => {
    window.addEventListener('resize', onClose)
    return () => window.removeEventListener('resize', onClose)
  }, [onClose])

  // Focus the checked item (or first) on open; hand focus back to the trigger on close.
  useEffect(() => {
    if (!pos) return
    const items = menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitemradio"]')
    const target = menuRef.current?.querySelector<HTMLElement>('[aria-checked="true"]') ?? items?.[0]
    target?.focus()
  }, [pos])
  useEffect(() => {
    const trigger = anchor.current
    return () => trigger?.focus()
  }, [anchor])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitemradio"]') ?? [])
    if (items.length === 0) return
    e.preventDefault()
    const i = items.indexOf(document.activeElement as HTMLElement)
    const next = e.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length
    items[next].focus()
  }

  if (!pos) return null
  const vaultOn = scope.mode === 'vault'
  return createPortal(
    <>
      <div className={styles.backdrop} onMouseDown={onClose} />
      <div
        ref={menuRef}
        className={styles.menu}
        role="menu"
        onKeyDown={onKeyDown}
        style={{ left: pos.left, bottom: pos.bottom }}
      >
        <button
          type="button"
          role="menuitemradio"
          aria-checked={vaultOn}
          className={`${styles.menuItem} ${vaultOn ? styles.menuItemOn : ''}`}
          onClick={() => { setScopeMode('vault'); onClose() }}
        >
          Entire vault
        </button>
        {workspaces.length === 0 && <div className={styles.menuEmpty}>No workspaces yet</div>}
        {workspaces.map((w) => {
          const on = scope.mode === 'workspace' && scope.workspaceId === w.id
          return (
            <button
              key={w.id}
              type="button"
              role="menuitemradio"
              aria-checked={on}
              className={`${styles.menuItem} ${on ? styles.menuItemOn : ''}`}
              onClick={() => { setScopeWorkspace(w.id); setScopeMode('workspace'); onClose() }}
            >
              {w.icon ? <span aria-hidden>{w.icon}</span> : <Folder size={14} aria-hidden />}
              <span className={styles.menuText}>{w.name}</span>
            </button>
          )
        })}
      </div>
    </>,
    document.body,
  )
}
