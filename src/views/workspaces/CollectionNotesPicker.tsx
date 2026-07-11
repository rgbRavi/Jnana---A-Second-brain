// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useMemo, useState } from 'react'
import type { Note } from '../../types'
import { addCollectionNote, removeCollectionNote } from '../../core/workspaces'
import { toast } from '../../lib/toast'
import styles from './Workspaces.module.css'

interface Props {
  collectionId: string
  collectionName: string
  /** Candidate pool — the workspace's notes (collections are subsets of these). */
  notes: Note[]
  /** Note ids currently in the collection. */
  initialIds: Set<string>
  onClose: () => void
}

/** Choose which of a workspace's notes belong to a collection (diff applied on save). */
export function CollectionNotesPicker({ collectionId, collectionName, notes, initialIds, onClose }: Props) {
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initialIds))
  const [saving, setSaving] = useState(false)

  const candidates = useMemo(() => {
    const s = q.trim().toLowerCase()
    return notes
      .filter((n) => !s || `${n.title}\n${n.content}`.toLowerCase().includes(s))
      .slice(0, 300)
  }, [notes, q])

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const handleSave = async () => {
    if (saving) return
    setSaving(true)
    try {
      const toAdd = [...selected].filter((id) => !initialIds.has(id))
      const toRemove = [...initialIds].filter((id) => !selected.has(id))
      await Promise.all([
        ...toAdd.map((id) => addCollectionNote(collectionId, id)),
        ...toRemove.map((id) => removeCollectionNote(collectionId, id)),
      ])
      onClose()
    } catch (err) {
      toast.error('Could not update collection: ' + String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.modalTitle}>Notes in “{collectionName}”</h2>
        <input
          className={styles.input}
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search workspace notes…"
          autoFocus
        />
        <div className={styles.pickerList}>
          {notes.length === 0 && <p className={styles.empty}>This workspace has no notes yet.</p>}
          {notes.length > 0 && candidates.length === 0 && <p className={styles.empty}>No matching notes.</p>}
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
          <button className={styles.primaryBtn} onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
