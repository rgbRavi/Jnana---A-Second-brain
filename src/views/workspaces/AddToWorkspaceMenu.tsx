// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useEffect, useState } from 'react'
import { useWorkspaces } from '../../hooks/useWorkspaces'
import {
  addWorkspaceNote,
  removeWorkspaceNote,
  listNoteWorkspaceIds,
  workspaceColor,
} from '../../core/workspaces'
import { toast } from '../../lib/toast'
import styles from './Workspaces.module.css'

interface Props {
  noteId: string
  onClose: () => void
}

/** Toggle a single note's membership across workspaces (from the All-Notes view). */
export function AddToWorkspaceMenu({ noteId, onClose }: Props) {
  const { workspaces } = useWorkspaces()
  const [memberIds, setMemberIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    listNoteWorkspaceIds(noteId)
      .then((ids) => setMemberIds(new Set(ids)))
      .catch(() => {})
  }, [noteId])

  const toggle = async (wsId: string) => {
    const has = memberIds.has(wsId)
    setMemberIds((prev) => {
      const next = new Set(prev)
      if (has) next.delete(wsId)
      else next.add(wsId)
      return next
    })
    try {
      if (has) await removeWorkspaceNote(wsId, noteId)
      else await addWorkspaceNote(wsId, noteId)
    } catch (err) {
      toast.error('Could not update workspace: ' + String(err))
    }
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()} style={{ maxWidth: 380 }}>
        <h2 className={styles.modalTitle}>Add to workspace</h2>
        {workspaces.length === 0 && <p className={styles.empty}>No workspaces yet.</p>}
        <div className={styles.pickerList}>
          {workspaces.map((w) => (
            <label key={w.id} className={styles.pickRow}>
              <input type="checkbox" checked={memberIds.has(w.id)} onChange={() => toggle(w.id)} />
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: workspaceColor(w), flexShrink: 0 }} />
              <span className={styles.pickTitle}>
                {w.icon || '📁'} {w.name}
              </span>
            </label>
          ))}
        </div>
        <div className={styles.modalActions}>
          <button className={styles.primaryBtn} onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
