import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWorkspaces } from '../../hooks/useWorkspaces'
import { deleteWorkspace, listWorkspaceCounts, workspaceColor } from '../../core/workspaces'
import { eventBus } from '../../lib/eventBus'
import { showConfirmDialog } from '../../lib/dialog'
import type { Workspace } from '../../types'
import { WorkspaceEditDialog } from './WorkspaceEditDialog'
import styles from './Workspaces.module.css'

function Workspaces() {
  const navigate = useNavigate()
  const { workspaces, loading } = useWorkspaces()
  const [counts, setCounts] = useState<Map<string, number>>(new Map())
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Workspace | null>(null)

  useEffect(() => {
    const load = () =>
      listWorkspaceCounts()
        .then((rows) => setCounts(new Map(rows.map((r) => [r.workspaceId, r.count]))))
        .catch(() => {})
    load()
    eventBus.on('workspace:changed', load)
    eventBus.on('note:deleted', load)
    return () => {
      eventBus.off('workspace:changed', load)
      eventBus.off('note:deleted', load)
    }
  }, [])

  const handleDelete = async (ws: Workspace) => {
    const ok = await showConfirmDialog({
      title: `Delete "${ws.name}"?`,
      message: 'This removes the workspace and its collections. Your notes stay in All Notes.',
      confirmLabel: 'Delete workspace',
      danger: true,
    })
    if (ok) await deleteWorkspace(ws.id)
  }

  return (
    <div className={styles.manager}>
      <div className={styles.managerHead}>
        <h1 className={styles.managerTitle}>Workspaces</h1>
        <button className={styles.createBtn} onClick={() => setCreating(true)}>
          ＋ New workspace
        </button>
      </div>

      {!loading && workspaces.length === 0 && (
        <p className={styles.empty}>
          No workspaces yet. Create one to group related notes — your notes stay in All Notes.
        </p>
      )}

      <div className={styles.grid}>
        {workspaces.map((ws) => (
          <div
            key={ws.id}
            className={styles.card}
            style={{ borderLeftColor: workspaceColor(ws) }}
            onClick={() => navigate(`/workspaces/${ws.id}`)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter') navigate(`/workspaces/${ws.id}`)
            }}
          >
            <div className={styles.cardActions} onClick={(e) => e.stopPropagation()}>
              <button className={styles.iconBtn} onClick={() => setEditing(ws)} title="Edit" aria-label="Edit workspace">
                ✎
              </button>
              <button className={styles.iconBtn} onClick={() => handleDelete(ws)} title="Delete" aria-label="Delete workspace">
                🗑
              </button>
            </div>
            <div className={styles.cardTop}>
              <span className={styles.cardIcon}>{ws.icon || '📁'}</span>
              <span className={styles.cardName}>{ws.name}</span>
            </div>
            <div className={styles.cardDesc}>{ws.description}</div>
            <div className={styles.cardMeta}>
              <span className={styles.cardCount}>
                {counts.get(ws.id) ?? 0} note{(counts.get(ws.id) ?? 0) !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
        ))}

        <button className={styles.addTile} onClick={() => setCreating(true)}>
          ＋ New workspace
        </button>
      </div>

      {creating && (
        <WorkspaceEditDialog
          onClose={() => setCreating(false)}
          onSaved={(ws) => navigate(`/workspaces/${ws.id}`)}
        />
      )}
      {editing && <WorkspaceEditDialog existing={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

export default Workspaces
