// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useEffect } from 'react'
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

  return (
    <div className={styles.bar}>
      <span className={styles.label}>Scope</span>
      <div className={styles.seg}>
        <button
          className={`${styles.segBtn} ${scope.mode === 'vault' ? styles.segOn : ''}`}
          onClick={() => setScopeMode('vault')}
        >
          Entire vault
        </button>
        <button
          className={`${styles.segBtn} ${scope.mode === 'workspace' ? styles.segOn : ''}`}
          onClick={() => setScopeMode('workspace')}
          disabled={workspaces.length === 0}
          title={workspaces.length === 0 ? 'Create a workspace first' : 'Restrict to one workspace'}
        >
          Workspace
        </button>
      </div>
      {scope.mode === 'workspace' && (
        <select
          className={styles.select}
          value={scope.workspaceId ?? ''}
          onChange={(e) => setScopeWorkspace(e.target.value || null)}
        >
          {workspaces.length === 0 && <option value="">No workspaces</option>}
          {workspaces.map((w) => (
            <option key={w.id} value={w.id}>
              {(w.icon || '📁') + ' ' + w.name}
            </option>
          ))}
        </select>
      )}
    </div>
  )
}
