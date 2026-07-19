// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useEffect, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { useWorkspaces } from '../hooks/useWorkspaces'
import { getActiveWorkspaceId } from '../hooks/useActiveWorkspace'
import { useAiScope, setScopeMode, setScopeWorkspace } from '../hooks/useAiScope'
import styles from './ScopeBar.module.css'

/**
 * Scope selector shared by the AI and Search views: range over the whole vault
 * or a single workspace. Writes the persisted AI-scope store; each view reads it
 * (via useScopedNoteIds) and applies the scope in its own way.
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

  const [pickerOpen, setPickerOpen] = useState(false)
  const [modePickerOpen, setModePickerOpen] = useState(false)

  return (
    <div className={styles.bar}>
      <span className={styles.label}>Scope</span>
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
