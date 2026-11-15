// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown } from 'lucide-react'
import { useEscapeKey } from '../hooks/useEscapeKey'
import { useWorkspaces } from '../hooks/useWorkspaces'
import { getActiveWorkspaceId } from '../hooks/useActiveWorkspace'
import { useAiScope, setScopeMode, setScopeWorkspace, type AiScope } from '../hooks/useAiScope'
import type { Workspace } from '../types'
import styles from './ScopeBar.module.css'

/**
 * Scope selector shared by the AI and Search views: range over the whole vault
 * or a single workspace. Writes the persisted AI-scope store; each view reads it
 * (via useScopedNoteIds) and applies the scope in its own way.
 */
export function ScopeBar({ compact = false }: { compact?: boolean } = {}) {
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

  const [pickerOpen, setPickerOpen] = useState(false)
  const [modePickerOpen, setModePickerOpen] = useState(false)

  if (compact) return <CompactScope workspaces={workspaces} scope={scope} />

  return (
    <div className={styles.bar}>
      <span className={styles.label}>Source</span>
      <div style={{ position: 'relative' }}>
        <button
          className={styles.select}
          onClick={() => setModePickerOpen(!modePickerOpen)}
        >
          {scope.mode === 'vault' ? 'Entire vault' : 'Workspace'} <ChevronDown size={14} style={{ opacity: 0.5, marginLeft: '4px' }} />
        </button>
        {modePickerOpen && (
          <div style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            zIndex: 60,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            boxShadow: '0 10px 28px rgba(0,0,0,0.4)',
            minWidth: '160px',
            display: 'flex',
            flexDirection: 'column',
          }}>
            <button
              style={{ padding: '0.5rem 0.7rem', textAlign: 'left', background: scope.mode === 'vault' ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'transparent', border: 'none', color: 'var(--text-1)', fontSize: '0.82rem', cursor: 'pointer' }}
              onClick={() => { setScopeMode('vault'); setModePickerOpen(false) }}
            >
              Entire vault
            </button>
            <button
              style={{ padding: '0.5rem 0.7rem', textAlign: 'left', background: scope.mode === 'workspace' ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'transparent', border: 'none', color: 'var(--text-1)', fontSize: '0.82rem', cursor: 'pointer' }}
              onClick={() => { setScopeMode('workspace'); setModePickerOpen(false) }}
              disabled={workspaces.length === 0}
              title={workspaces.length === 0 ? 'Create a workspace first' : 'Restrict to one workspace'}
            >
              Workspace
            </button>
          </div>
        )}
      </div>
      {scope.mode === 'workspace' && (
        <div style={{ position: 'relative' }}>
          <button
            className={styles.select}
            onClick={() => setPickerOpen(!pickerOpen)}
          >
            {workspaces.length === 0 ? 'No workspaces' : workspaces.find(w => w.id === scope.workspaceId)?.name || 'Workspace'} <ChevronDown size={14} style={{ opacity: 0.5, marginLeft: '4px' }} />
          </button>
          {pickerOpen && (
            <div style={{
              position: 'absolute',
              top: 'calc(100% + 4px)',
              left: 0,
              zIndex: 60,
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              boxShadow: '0 10px 28px rgba(0,0,0,0.4)',
              minWidth: '160px',
              maxHeight: '220px',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
            }}>
              {workspaces.map((w) => (
                <button
                  key={w.id}
                  style={{ padding: '0.5rem 0.7rem', textAlign: 'left', background: w.id === scope.workspaceId ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'transparent', border: 'none', color: 'var(--text-1)', fontSize: '0.82rem', cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                  onClick={() => { setScopeWorkspace(w.id); setPickerOpen(false) }}
                >
                  {(w.icon || '📁') + ' ' + w.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** One inline trigger ("from: Entire vault ▾") + a portaled menu listing the vault and each workspace. */
function CompactScope({ workspaces, scope }: { workspaces: Workspace[]; scope: AiScope }) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const [pos, setPos] = useState<{ left: number; bottom: number } | null>(null)
  const current = scope.mode === 'workspace' ? workspaces.find((w) => w.id === scope.workspaceId) : null
  const label = scope.mode === 'vault' ? 'Entire vault' : current?.name ?? 'Workspace'

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return
    const r = btnRef.current.getBoundingClientRect()
    // Open upward: the control sits above the composer, near the viewport bottom.
    setPos({ left: r.left, bottom: window.innerHeight - r.top + 4 })
  }, [open])

  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    window.addEventListener('resize', close)
    return () => window.removeEventListener('resize', close)
  }, [open])

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
      {open && pos && createPortal(
        <>
          <div className={styles.backdrop} onMouseDown={() => setOpen(false)} />
          <CompactMenu onClose={() => setOpen(false)}>
            <div className={styles.menu} role="menu" style={{ left: pos.left, bottom: pos.bottom }}>
              <button
                type="button"
                role="menuitemradio"
                aria-checked={scope.mode === 'vault'}
                className={`${styles.menuItem} ${scope.mode === 'vault' ? styles.menuItemOn : ''}`}
                onClick={() => { setScopeMode('vault'); setOpen(false) }}
              >
                Entire vault
              </button>
              {workspaces.map((w) => {
                const on = scope.mode === 'workspace' && scope.workspaceId === w.id
                return (
                  <button
                    key={w.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={on}
                    className={`${styles.menuItem} ${on ? styles.menuItemOn : ''}`}
                    onClick={() => { setScopeWorkspace(w.id); setScopeMode('workspace'); setOpen(false) }}
                  >
                    {(w.icon || '📁') + ' ' + w.name}
                  </button>
                )
              })}
            </div>
          </CompactMenu>
        </>,
        document.body,
      )}
    </span>
  )
}

function CompactMenu({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  useEscapeKey(onClose)
  return <>{children}</>
}
