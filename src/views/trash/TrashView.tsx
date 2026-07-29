// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useEffect, useState } from 'react'
import { deleteNote, emptyTrash, listTrashedNotes, restoreNote, type TrashedNote } from '../../core/notes'
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
  const vaultId = useActiveVaultId()

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

  const restore = async (t: TrashedNote) => {
    try {
      const note = await restoreNote(t.id)
      eventBus.emit('note:saved', note) // re-surface it in the in-memory note list
      setItems((prev) => prev.filter((n) => n.id !== t.id))
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
    } catch (e) {
      log.error('delete forever failed', e)
      toast.error('Could not delete that note.')
    }
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
      toast.success(`Deleted ${n} note${n === 1 ? '' : 's'}.`)
    } catch (e) {
      log.error('empty trash failed', e)
      toast.error('Could not empty Trash.')
    }
  }

  return (
    <div className={styles.view}>
      <div className={styles.header}>
        <span className={styles.title}>Trash</span>
        {items.length > 0 && (
          <button className={`${styles.btn} ${styles.btnDanger}`} onClick={empty}>
            Empty Trash
          </button>
        )}
      </div>

      {loading ? (
        <p className={styles.empty}>Loading…</p>
      ) : items.length === 0 ? (
        <p className={styles.empty}>Trash is empty. Deleted notes appear here and can be restored.</p>
      ) : (
        <div className={styles.list}>
          {items.map((t) => (
            <div key={t.id} className={styles.row}>
              <span className={styles.rowTitle}>{t.title || 'Untitled'}</span>
              <span className={styles.rowDate}>Deleted {formatDate(t.deletedAt)}</span>
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
    </div>
  )
}
