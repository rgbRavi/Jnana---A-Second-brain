// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useMemo, useState } from 'react'
import { useNotesContext } from '../../context/NotesContext'
import { addWorkspaceNotes } from '../../core/workspaces'
import { toast } from '../../lib/toast'
import styles from './Workspaces.module.css'

interface Props {
  workspaceId: string
  /** Note ids already in the workspace (excluded from the picker). */
  existingIds: Set<string>
  onClose: () => void
  onAdded?: () => void
}

/** Pick existing notes (searchable, multi-select) and add them to a workspace. */
export function AddNotesPicker({ workspaceId, existingIds, onClose, onAdded }: Props) {
  const { notes } = useNotesContext()
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)

  const candidates = useMemo(() => {
    const s = q.trim().toLowerCase()
    return notes
      .filter((n) => !existingIds.has(n.id))
      .filter((n) => !s || `${n.title}\n${n.content}`.toLowerCase().includes(s))
      .slice(0, 200)
  }, [notes, existingIds, q])

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const handleAdd = async () => {
    if (selected.size === 0 || saving) return
    setSaving(true)
    try {
      await addWorkspaceNotes(workspaceId, [...selected])
      toast.success(`Added ${selected.size} note${selected.size !== 1 ? 's' : ''} to the workspace.`)
      onAdded?.()
      onClose()
    } catch (err) {
      toast.error('Could not add notes: ' + String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.modalTitle}>Add notes to workspace</h2>
        <input
          className={styles.input}
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search all notes…"
          autoFocus
        />
        <div className={styles.pickerList}>
          {candidates.length === 0 && <p className={styles.empty}>No matching notes.</p>}
          {candidates.map((n) => (
            <label key={n.id} className={styles.pickRow}>
              <input type="checkbox" checked={selected.has(n.id)} onChange={() => toggle(n.id)} />
              <span className={styles.pickTitle}>{n.title || 'Untitled'}</span>
            </label>
          ))}
        </div>
        <div className={styles.modalActions}>
          <button className={styles.cancelBtn} onClick={onClose}>
            Cancel
          </button>
          <button className={styles.primaryBtn} onClick={handleAdd} disabled={selected.size === 0 || saving}>
            {saving ? 'Adding…' : `Add ${selected.size || ''}`.trim()}
          </button>
        </div>
      </div>
    </div>
  )
}
