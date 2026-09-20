// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Eye } from 'lucide-react'
import {
  deleteNote,
  emptyTrash,
  getNote,
  listTrashedNotes,
  restoreNote,
  type TrashedNote,
} from '../../core/notes'
import type { Note } from '../../types'
import { NoteModal } from '../../ui/NoteModal'
import { useActiveVaultId } from '../../hooks/useVaults'
import { formatDate } from '../../core/dateFormat'
import { eventBus } from '../../lib/eventBus'
import { toast } from '../../lib/toast'
import { showConfirmDialog } from '../../lib/dialog'
import { log } from '../../lib/logger'
import styles from './TrashView.module.css'

export default function TrashView() {
  const [items, setItems] = useState<TrashedNote[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  /** True while a bulk action runs, so its buttons can't be double-fired. */
  const [busy, setBusy] = useState(false)
  /** The trashed note being previewed. Its body isn't in the list rows, so it's
   *  fetched on demand — `get_note` reads by id and doesn't filter out trash. */
  const [preview, setPreview] = useState<Note | null>(null)

  const openPreview = async (t: TrashedNote) => {
    try {
      setPreview(await getNote(t.id))
    } catch (e) {
      log.error('failed to load trashed note', e)
      toast.error('Could not open that note.')
    }
  }
  const vaultId = useActiveVaultId()
  const navigate = useNavigate()

  // Trash is a detour, so go back where they came from. A direct landing (deep
  // link, reload on /trash) has nothing to go back to — fall back to the notes
  // gallery rather than stepping out of the app.
  const goBack = () => {
    if (window.history.state?.idx > 0) navigate(-1)
    else navigate('/notes')
  }

  const refresh = () => {
    listTrashedNotes(vaultId)
      .then(setItems)
      .catch((e) => {
        log.error('Failed to load trash', e)
        toast.error('Could not load Trash.')
      })
      .finally(() => setLoading(false))
  }
  // Re-run when the active vault switches so Trash tracks it like every other view.
  useEffect(refresh, [vaultId])

  // A vault switch swaps the whole list — drop a selection that no longer applies.
  useEffect(() => setSelected(new Set()), [vaultId])

  const toggleOne = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const allSelected = items.length > 0 && selected.size === items.length
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(items.map((t) => t.id)))

  const restore = async (t: TrashedNote) => {
    try {
      const note = await restoreNote(t.id)
      eventBus.emit('note:saved', note) // re-surface it in the in-memory note list
      setItems((prev) => prev.filter((n) => n.id !== t.id))
      setPreview((p) => (p?.id === t.id ? null : p))
      toast.success(`Restored "${note.title || 'Untitled'}".`)
    } catch (e) {
      log.error('restore failed', e)
      toast.error('Could not restore that note.')
    }
  }

  const deleteForever = async (t: TrashedNote) => {
    const ok = await showConfirmDialog({
      title: 'Delete forever?',
      message: `"${t.title || 'Untitled'}" will be permanently deleted, along with its media. This cannot be undone.`,
      confirmLabel: 'Delete forever',
      danger: true,
    })
    if (!ok) return
    try {
      await deleteNote(t.id)
      setItems((prev) => prev.filter((n) => n.id !== t.id))
      setPreview((p) => (p?.id === t.id ? null : p))
    } catch (e) {
      log.error('delete forever failed', e)
      toast.error('Could not delete that note.')
    }
  }

  /** Restore many notes, reporting once rather than per note. */
  const restoreMany = async (targets: TrashedNote[]) => {
    if (targets.length === 0 || busy) return
    setBusy(true)
    const restored = new Set<string>()
    for (const t of targets) {
      try {
        const note = await restoreNote(t.id)
        eventBus.emit('note:saved', note) // re-surface it in the in-memory note list
        restored.add(t.id)
      } catch (e) {
        log.error('restore failed', e)
      }
    }
    // Only drop the rows that actually came back; a failure stays listed.
    setItems((prev) => prev.filter((n) => !restored.has(n.id)))
    setPreview((p) => (p && restored.has(p.id) ? null : p))
    setSelected(new Set())
    setBusy(false)
    const failed = targets.length - restored.size
    if (restored.size > 0) toast.success(`Restored ${restored.size} note${restored.size === 1 ? '' : 's'}.`)
    if (failed > 0) toast.error(`Could not restore ${failed} note${failed === 1 ? '' : 's'}.`)
  }

  const deleteSelectedForever = async () => {
    const targets = items.filter((t) => selected.has(t.id))
    if (targets.length === 0 || busy) return
    const ok = await showConfirmDialog({
      title: 'Delete forever?',
      message: `${targets.length} note${targets.length === 1 ? '' : 's'} will be permanently deleted, along with their media. This cannot be undone.`,
      confirmLabel: 'Delete forever',
      danger: true,
    })
    if (!ok) return
    setBusy(true)
    let done = 0
    for (const t of targets) {
      try {
        await deleteNote(t.id)
        done++
      } catch (e) {
        log.error('delete forever failed', e)
      }
    }
    const goneIds = new Set(targets.slice(0, done).map((t) => t.id))
    setItems((prev) => prev.filter((n) => !goneIds.has(n.id)))
    setPreview((p) => (p && goneIds.has(p.id) ? null : p))
    setSelected(new Set())
    setBusy(false)
    if (done < targets.length) toast.error(`Could not delete ${targets.length - done} note(s).`)
    else toast.success(`Deleted ${done} note${done === 1 ? '' : 's'}.`)
  }

  const empty = async () => {
    const ok = await showConfirmDialog({
      title: 'Empty Trash?',
      message: `Permanently delete all ${items.length} note${items.length === 1 ? '' : 's'} in Trash, including their media. This cannot be undone.`,
      confirmLabel: 'Empty Trash',
      danger: true,
    })
    if (!ok) return
    try {
      const n = await emptyTrash(vaultId)
      setItems([])
      setSelected(new Set())
      setPreview(null)
      toast.success(`Deleted ${n} note${n === 1 ? '' : 's'}.`)
    } catch (e) {
      log.error('empty trash failed', e)
      toast.error('Could not empty Trash.')
    }
  }

  return (
    <div className={styles.view}>
      <div className={styles.header}>
        <button className={styles.backBtn} onClick={goBack} title="Back" aria-label="Back">
          <ArrowLeft size={16} />
        </button>
        <span className={styles.title}>Trash</span>
        {items.length > 0 && (
          <>
            <button className={styles.btn} onClick={() => void restoreMany(items)} disabled={busy}>
              Restore all
            </button>
            <button className={`${styles.btn} ${styles.btnDanger}`} onClick={empty} disabled={busy}>
              Empty Trash
            </button>
          </>
        )}
      </div>

      {items.length > 0 && (
        <div className={styles.selectBar}>
          <label className={styles.selectAll}>
            <input
              type="checkbox"
              className={styles.checkbox}
              checked={allSelected}
              onChange={toggleAll}
              aria-label="Select all notes in Trash"
            />
            {selected.size > 0 ? `${selected.size} selected` : 'Select all'}
          </label>
          {selected.size > 0 && (
            <>
              <button
                className={styles.btn}
                onClick={() => void restoreMany(items.filter((t) => selected.has(t.id)))}
                disabled={busy}
              >
                Restore selected
              </button>
              <button
                className={`${styles.btn} ${styles.btnDanger}`}
                onClick={deleteSelectedForever}
                disabled={busy}
              >
                Delete forever
              </button>
            </>
          )}
        </div>
      )}

      {loading ? (
        <p className={styles.empty}>Loading…</p>
      ) : items.length === 0 ? (
        <p className={styles.empty}>Trash is empty. Deleted notes appear here and can be restored.</p>
      ) : (
        <div className={styles.list}>
          {items.map((t) => (
            <div key={t.id} className={`${styles.row} ${selected.has(t.id) ? styles.rowSelected : ''}`}>
              <input
                type="checkbox"
                className={styles.checkbox}
                checked={selected.has(t.id)}
                onChange={() => toggleOne(t.id)}
                aria-label={`Select "${t.title || 'Untitled'}"`}
              />
              <span className={styles.rowTitle}>{t.title || 'Untitled'}</span>
              <span className={styles.rowDate}>Deleted {formatDate(t.deletedAt)}</span>
              <button
                className={`${styles.btn} ${styles.iconBtn}`}
                onClick={() => void openPreview(t)}
                title="View note"
                aria-label={`View "${t.title || 'Untitled'}"`}
              >
                <Eye size={15} />
              </button>
              <button className={styles.btn} onClick={() => restore(t)}>
                Restore
              </button>
              <button className={`${styles.btn} ${styles.btnDanger}`} onClick={() => deleteForever(t)}>
                Delete forever
              </button>
            </div>
          ))}
        </div>
      )}

      {preview && (
        <NoteModal
          note={preview}
          isOpen
          onClose={() => setPreview(null)}
          trashActions={{
            onRestore: () => void restore({ id: preview.id, title: preview.title, deletedAt: 0 }),
            onDeleteForever: () =>
              void deleteForever({ id: preview.id, title: preview.title, deletedAt: 0 }),
          }}
        />
      )}
    </div>
  )
}
