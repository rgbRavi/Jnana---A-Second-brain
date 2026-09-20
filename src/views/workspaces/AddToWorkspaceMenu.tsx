// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useEffect, useState } from 'react'
import { useEscapeKey } from '../../hooks/useEscapeKey'
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
  /** One or more notes to file — a multi-selection files together. */
  noteIds: string[]
  onClose: () => void
}

/**
 * Toggle notes' membership across workspaces (from the All-Notes view). With
 * several notes, a workspace reads as a member only when *every* selected note
 * is in it, and toggling applies to the whole selection.
 */
export function AddToWorkspaceMenu({ noteIds, onClose }: Props) {
  useEscapeKey(onClose)
  const { workspaces } = useWorkspaces()
  const [memberIds, setMemberIds] = useState<Set<string>>(new Set())
  const key = noteIds.join(',')

  useEffect(() => {
    Promise.all(noteIds.map((id) => listNoteWorkspaceIds(id).catch(() => [] as string[])))
      .then((lists) => {
        if (lists.length === 0) return
        // Intersection: ticked means all of them are already in it.
        const [first, ...rest] = lists
        const shared = new Set(first)
        for (const ids of rest) {
          const other = new Set(ids)
          for (const id of [...shared]) if (!other.has(id)) shared.delete(id)
        }
        setMemberIds(shared)
      })
      .catch(() => {})
    // Keyed by the id list rather than the array identity.
  }, [key])

  const toggle = async (wsId: string) => {
    const has = memberIds.has(wsId)
    setMemberIds((prev) => {
      const next = new Set(prev)
      if (has) next.delete(wsId)
      else next.add(wsId)
      return next
    })
    try {
      // Sequential: these are small writes, and a burst of parallel invokes just
      // queues on the same DB lock anyway.
      for (const noteId of noteIds) {
        if (has) await removeWorkspaceNote(wsId, noteId)
        else await addWorkspaceNote(wsId, noteId)
      }
    } catch (err) {
      toast.error('Could not update workspace: ' + String(err))
    }
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()} style={{ maxWidth: 380 }}>
        <h2 className={styles.modalTitle}>
          {noteIds.length > 1 ? `Add ${noteIds.length} notes to workspace` : 'Add to workspace'}
        </h2>
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
