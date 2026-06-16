import { useEffect, useState } from 'react'
import type { Note } from '../../types'
import type { useCollections } from '../../hooks/useCollections'
import { showConfirmDialog, showPromptDialog } from '../../lib/dialog'
import { CollectionNotesPicker } from './CollectionNotesPicker'
import styles from './Workspaces.module.css'

interface Props {
  /** Shared collections API (lifted to WorkspaceNotes so it can filter by membership). */
  api: ReturnType<typeof useCollections>
  /** Workspace notes — the "All" count + the manage-picker pool. */
  notes: Note[]
  activeId: string | null
  onSelect: (id: string | null) => void
}

/** Collection chips that sub-filter a workspace's Notes tab, with inline CRUD. */
export function CollectionsBar({ api, notes, activeId, onSelect }: Props) {
  const { collections, counts, members, create, rename, remove } = api
  const [managing, setManaging] = useState<string | null>(null)

  // If the active collection is deleted (here or elsewhere), fall back to "All".
  useEffect(() => {
    if (activeId && !collections.some((c) => c.id === activeId)) onSelect(null)
  }, [collections, activeId, onSelect])

  const handleCreate = async () => {
    const name = await showPromptDialog({
      title: 'New collection',
      placeholder: 'e.g. Week 1, Sources, Drafts',
      confirmLabel: 'Create',
    })
    if (name && name.trim()) {
      const c = await create(name)
      onSelect(c.id)
    }
  }

  const handleRename = async (id: string, current: string) => {
    const col = collections.find((c) => c.id === id)
    if (!col) return
    const name = await showPromptDialog({
      title: 'Rename collection',
      defaultValue: current,
      confirmLabel: 'Rename',
    })
    if (name && name.trim() && name.trim() !== current) await rename(col, name)
  }

  const handleDelete = async (id: string, name: string) => {
    const ok = await showConfirmDialog({
      title: `Delete “${name}”?`,
      message: 'The collection is removed. Its notes stay in the workspace.',
      confirmLabel: 'Delete',
      danger: true,
    })
    if (!ok) return
    if (activeId === id) onSelect(null)
    await remove(id)
  }

  const active = collections.find((c) => c.id === activeId) ?? null

  return (
    <div className={styles.collectionsWrap}>
      <div className={styles.collectionsBar}>
        <button
          className={`${styles.collChip} ${!activeId ? styles.collChipOn : ''}`}
          onClick={() => onSelect(null)}
        >
          All <span className={styles.collCount}>{notes.length}</span>
        </button>
        {collections.map((c) => (
          <button
            key={c.id}
            className={`${styles.collChip} ${activeId === c.id ? styles.collChipOn : ''}`}
            onClick={() => onSelect(c.id)}
          >
            {c.name} <span className={styles.collCount}>{counts.get(c.id) ?? 0}</span>
          </button>
        ))}
        <button className={styles.collChipNew} onClick={handleCreate} title="New collection">
          ＋
        </button>
      </div>

      {active && (
        <div className={styles.collActions}>
          <button className={styles.collActionBtn} onClick={() => setManaging(active.id)}>
            Manage notes
          </button>
          <button className={styles.collActionBtn} onClick={() => handleRename(active.id, active.name)}>
            Rename
          </button>
          <button className={styles.collActionBtn} onClick={() => handleDelete(active.id, active.name)}>
            Delete
          </button>
        </div>
      )}

      {managing && active && (
        <CollectionNotesPicker
          collectionId={active.id}
          collectionName={active.name}
          notes={notes}
          initialIds={members.get(active.id) ?? new Set()}
          onClose={() => setManaging(null)}
        />
      )}
    </div>
  )
}
