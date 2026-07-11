// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useNotesContext } from '../../context/NotesContext'
import { useWorkspaces } from '../../hooks/useWorkspaces'
import { useWorkspaceNotes } from '../../hooks/useWorkspaceNotes'
import { useViewState } from '../../hooks/useViewState'
import {
  useActiveWorkspace,
  setActiveWorkspace,
  togglePinnedWorkspace,
} from '../../hooks/useActiveWorkspace'
import { deleteWorkspace, workspaceColor } from '../../core/workspaces'
import { exportNotes } from '../../core/export'
import { openComposer } from '../../ui/editor/NoteCreator'
import { GraphView } from '../../ui/graph/GraphView'
import { showConfirmDialog } from '../../lib/dialog'
import { toast } from '../../lib/toast'
import { WorkspaceNotes } from './WorkspaceNotes'
import { WorkspaceDashboard } from './WorkspaceDashboard'
import { WorkspaceInsights } from './WorkspaceInsights'
import { WorkspaceEditDialog } from './WorkspaceEditDialog'
import { CanvasBoard } from './canvas/CanvasBoard'
import styles from './Workspaces.module.css'

type Tab = 'dashboard' | 'notes' | 'graph' | 'canvas' | 'insights'

function Workspace() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { workspaces } = useWorkspaces()
  const { create, update, remove } = useNotesContext()
  const { notes: wsNotes } = useWorkspaceNotes(id)
  const { pinnedWorkspaceIds } = useActiveWorkspace()
  const [tab, setTab] = useViewState<Tab>('workspace.tab', 'dashboard')
  const [editing, setEditing] = useState(false)

  const workspace = workspaces.find((w) => w.id === id)
  const pinned = pinnedWorkspaceIds.includes(id)

  // Mark this workspace active while open (drives quick-note capture + AI scope).
  useEffect(() => {
    setActiveWorkspace(id)
    return () => setActiveWorkspace(null)
  }, [id])

  const scopeIds = useMemo(() => new Set(wsNotes.map((n) => n.id)), [wsNotes])

  const handleExport = async () => {
    try {
      const n = await exportNotes(wsNotes)
      if (n) toast.success(`Exported ${n} note${n !== 1 ? 's' : ''}.`)
    } catch (err) {
      toast.error('Export failed: ' + String(err))
    }
  }

  const handleDelete = async () => {
    if (!workspace) return
    const ok = await showConfirmDialog({
      title: `Delete "${workspace.name}"?`,
      message: 'This removes the workspace and its collections. Your notes stay in All Notes.',
      confirmLabel: 'Delete workspace',
      danger: true,
    })
    if (!ok) return
    await deleteWorkspace(id)
    navigate('/workspaces')
  }

  if (!workspace) {
    return (
      <div className={styles.page}>
        <button className={styles.backLink} onClick={() => navigate('/workspaces')}>
          ← Workspaces
        </button>
        <p className={styles.empty}>Workspace not found.</p>
      </div>
    )
  }

  const accent = workspaceColor(workspace)

  return (
    <div className={styles.page}>
      <button className={styles.backLink} onClick={() => navigate('/workspaces')}>
        ← Workspaces
      </button>

      <div className={styles.header}>
        <span className={styles.headerIcon}>{workspace.icon || '📁'}</span>
        <div className={styles.headerMain}>
          <h1 className={styles.headerTitle}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: accent, display: 'inline-block' }} />
            {workspace.name}
          </h1>
          {workspace.description && <p className={styles.headerDesc}>{workspace.description}</p>}
        </div>
        <div className={styles.headerActions}>
          <button
            className={styles.iconBtn}
            onClick={() => togglePinnedWorkspace(id)}
            title={pinned ? 'Unpin from sidebar' : 'Pin to sidebar'}
          >
            {pinned ? '📌' : '📍'}
          </button>
          <button className={styles.iconBtn} onClick={handleExport} title="Export workspace notes">
            ⤓
          </button>
          <button className={styles.iconBtn} onClick={() => setEditing(true)} title="Edit workspace">
            ✎
          </button>
          <button className={styles.iconBtn} onClick={handleDelete} title="Delete workspace">
            🗑
          </button>
        </div>
      </div>

      <div className={styles.tabs}>
        <button className={`${styles.tab} ${tab === 'dashboard' ? styles.tabActive : ''}`} onClick={() => setTab('dashboard')}>
          Dashboard
        </button>
        <button className={`${styles.tab} ${tab === 'notes' ? styles.tabActive : ''}`} onClick={() => setTab('notes')}>
          Notes
        </button>
        <button className={`${styles.tab} ${tab === 'graph' ? styles.tabActive : ''}`} onClick={() => setTab('graph')}>
          Graph
        </button>
        <button className={`${styles.tab} ${tab === 'canvas' ? styles.tabActive : ''}`} onClick={() => setTab('canvas')}>
          Canvas
        </button>
        <button className={`${styles.tab} ${tab === 'insights' ? styles.tabActive : ''}`} onClick={() => setTab('insights')}>
          Insights
        </button>
      </div>

      <div className={styles.tabBody}>
        {tab === 'dashboard' && <WorkspaceDashboard workspaceId={id} onGotoNotes={() => setTab('notes')} />}
        {tab === 'notes' && <WorkspaceNotes workspaceId={id} onNewNote={openComposer} />}
        {tab === 'graph' && (
          <GraphView onCreate={create} onUpdate={update} onRemove={remove} scopeIds={scopeIds} instanceKey={`ws:${id}`} />
        )}
        {tab === 'canvas' && <CanvasBoard workspaceId={id} />}
        {tab === 'insights' && <WorkspaceInsights workspaceId={id} />}
      </div>

      {editing && <WorkspaceEditDialog existing={workspace} onClose={() => setEditing(false)} />}
    </div>
  )
}

export default Workspace
