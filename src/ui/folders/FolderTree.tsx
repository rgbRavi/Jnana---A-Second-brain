// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// The virtual folder tree for one vault — the body of the file explorer. Groups
// the active vault's in-memory notes (from NotesContext) by their `folderId`, so
// no per-folder IPC is needed and drag-into-folder is instantly reactive.
// Folder/note names are edited INLINE (no dialogs) — double-click or the
// right-click menu swaps the label for an input. Everything draggable is POINTER
// events (the Tauri webview swallows native HTML5 DnD — same as Canvas / TabStrip),
// hit-testing rows via elementFromPoint + `data-folder-drop`.

import { useCallback, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNotesContext } from '../../context/NotesContext'
import {
  useFolders,
  useFolderExpansion,
  toggleFolderExpanded,
  setFolderExpanded,
  buildFolderTree,
  descendantFolderIds,
  type FolderNode,
} from '../../hooks/useFolders'
import { createFolder, saveFolder, deleteFolder, moveFolder, setNoteFolder } from '../../core/folders'
import { eventBus } from '../../lib/eventBus'
import { toast } from '../../lib/toast'
import { showChoiceDialog } from '../../lib/dialog'
import { log } from '../../lib/logger'
import { ContextMenu, type MenuItem } from '../ContextMenu'
import { DEFAULT_VAULT_ID, type Folder, type Note } from '../../types'
import { Folder as FolderIcon, FolderOpen, FileText, ChevronRight, Plus } from 'lucide-react'
import styles from './FolderTree.module.css'

interface DragState {
  kind: 'note' | 'folder'
  id: string
  label: string
  x: number
  y: number
  /** The `data-folder-drop` value under the pointer ('root' | folder id). */
  over: string | null
}

interface MenuState {
  x: number
  y: number
  items: MenuItem[]
}

/** Which row is being inline-renamed. */
interface EditState {
  kind: 'folder' | 'note'
  id: string
}

export function FolderTree({ vaultId }: { vaultId: string }) {
  const { notes, create, update, remove } = useNotesContext()
  const { folders: allFolders } = useFolders()
  const expanded = useFolderExpansion()

  const [drag, setDrag] = useState<DragState | null>(null)
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [editing, setEditing] = useState<EditState | null>(null)
  const [draft, setDraft] = useState('')
  const dragRef = useRef<DragState | null>(null)
  dragRef.current = drag

  // Scope to the active vault.
  const folders = useMemo(() => allFolders.filter((f) => f.vaultId === vaultId), [allFolders, vaultId])
  const tree = useMemo(() => buildFolderTree(folders), [folders])

  const notesByFolder = useMemo(() => {
    const map = new Map<string | null, Note[]>()
    for (const n of notes) {
      if ((n.vaultId ?? DEFAULT_VAULT_ID) !== vaultId) continue
      const key = n.folderId ?? null
      const arr = map.get(key) ?? []
      arr.push(n)
      map.set(key, arr)
    }
    for (const arr of map.values()) arr.sort((a, b) => a.title.localeCompare(b.title))
    return map
  }, [notes, vaultId])

  const openNote = useCallback((note: Note) => {
    eventBus.emit('note:navigate', note)
  }, [])

  // ─── Inline rename ────────────────────────────────────

  const beginEdit = useCallback((kind: 'folder' | 'note', id: string, current: string) => {
    setEditing({ kind, id })
    setDraft(current)
  }, [])

  const commitEdit = useCallback(async () => {
    const target = editing
    if (!target) return
    const name = draft.trim()
    setEditing(null)
    if (!name) return
    try {
      if (target.kind === 'folder') {
        const folder = allFolders.find((f) => f.id === target.id)
        if (folder && name !== folder.name) {
          await saveFolder({ ...folder, name, updatedAt: Date.now() })
        }
      } else {
        const note = notes.find((n) => n.id === target.id)
        if (note && name !== note.title) {
          await update(note.id, name, note.content)
        }
      }
    } catch (e) {
      log.error('Inline rename failed', e)
      toast.error('Could not rename')
    }
  }, [editing, draft, allFolders, notes, update])

  const cancelEdit = useCallback(() => setEditing(null), [])

  // ─── Folder actions ───────────────────────────────────

  const handleNewFolder = useCallback(
    async (parentId: string | null) => {
      // Create immediately with a default name, then drop straight into inline
      // edit — no dialog. The row appears on the folder:changed refresh.
      const folder = createFolder(vaultId, 'New Folder', parentId)
      try {
        await saveFolder(folder)
        if (parentId) setFolderExpanded(parentId, true)
        beginEdit('folder', folder.id, folder.name)
      } catch (e) {
        log.error('Failed to create folder', e)
        toast.error('Could not create folder')
      }
    },
    [vaultId, beginEdit],
  )

  const handleDelete = useCallback(
    async (folder: Folder) => {
      const affectedFolders = [folder.id, ...descendantFolderIds(folders, folder.id)]
      const affectedSet = new Set(affectedFolders)
      const containedNotes = notes.filter((n) => n.folderId && affectedSet.has(n.folderId))

      const choice = await showChoiceDialog({
        title: `Delete "${folder.name}"?`,
        message:
          containedNotes.length > 0
            ? `This folder holds ${containedNotes.length} note(s)${
                affectedFolders.length > 1 ? ` across ${affectedFolders.length} folders` : ''
              }.`
            : 'This folder is empty.',
        options: [
          {
            value: 'folder',
            label: 'Delete folder only',
            description: 'Notes move to Unfiled — nothing is lost.',
            primary: true,
          },
          {
            value: 'folder-notes',
            label: 'Delete folder + notes',
            description: 'Permanently deletes the folder and every note inside it.',
            icon: '⚠️',
          },
        ],
      })
      if (!choice) return
      try {
        if (choice === 'folder-notes') {
          for (const n of containedNotes) await remove(n.id)
        }
        await deleteFolder(folder.id)
      } catch (e) {
        log.error('Failed to delete folder', e)
        toast.error('Could not delete folder')
      }
    },
    [folders, notes, remove],
  )

  const handleNewNote = useCallback(
    async (folderId: string) => {
      try {
        const note = await create('Untitled', '')
        await setNoteFolder(note.id, folderId, vaultId)
        setFolderExpanded(folderId, true)
        beginEdit('note', note.id, note.title)
      } catch (e) {
        log.error('Failed to create note in folder', e)
        toast.error('Could not create note')
      }
    },
    [create, vaultId, beginEdit],
  )

  const folderMenu = useCallback(
    (folder: Folder): MenuItem[] => [
      { label: 'New note here', onClick: () => void handleNewNote(folder.id) },
      { label: 'New sub-folder', onClick: () => void handleNewFolder(folder.id) },
      { label: 'Rename', onClick: () => beginEdit('folder', folder.id, folder.name) },
      { label: 'Delete', danger: true, separator: true, onClick: () => void handleDelete(folder) },
    ],
    [handleNewNote, handleNewFolder, handleDelete, beginEdit],
  )

  const noteMenu = useCallback(
    (note: Note): MenuItem[] => [
      { label: 'Open', onClick: () => openNote(note) },
      { label: 'Rename', onClick: () => beginEdit('note', note.id, note.title) },
      {
        label: 'Remove from folder',
        onClick: () => void setNoteFolder(note.id, null, vaultId).catch(() => {}),
      },
      { label: 'Delete note', danger: true, separator: true, onClick: () => void remove(note.id) },
    ],
    [openNote, beginEdit, remove, vaultId],
  )

  // ─── Pointer drag (note→folder, folder→folder) ────────

  const startDrag = useCallback(
    (kind: 'note' | 'folder', id: string, label: string, e: React.PointerEvent) => {
      if (e.button !== 0 || editing) return
      const startX = e.clientX
      const startY = e.clientY
      let armed = false

      const move = (ev: PointerEvent) => {
        if (!armed) {
          if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < 5) return
          armed = true
        }
        const el = document.elementFromPoint(ev.clientX, ev.clientY)
        const dropEl = el?.closest('[data-folder-drop]') as HTMLElement | null
        setDrag({ kind, id, label, x: ev.clientX, y: ev.clientY, over: dropEl?.dataset.folderDrop ?? null })
      }
      const up = async () => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        const state = dragRef.current
        setDrag(null)
        if (state && armed) await performDrop(state)
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
    },
    [editing],
  )

  const performDrop = useCallback(
    async (state: DragState) => {
      if (state.over === null) return
      const targetFolder = state.over === 'root' ? null : state.over
      try {
        if (state.kind === 'note') {
          if ((notes.find((n) => n.id === state.id)?.folderId ?? null) === targetFolder) return
          await setNoteFolder(state.id, targetFolder, vaultId)
        } else {
          if (state.id === targetFolder) return
          await moveFolder(state.id, targetFolder)
          if (targetFolder) setFolderExpanded(targetFolder, true)
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : String(e))
      }
    },
    [notes, vaultId],
  )

  // ─── Render ───────────────────────────────────────────

  const nameCell = (kind: 'folder' | 'note', id: string, label: string) =>
    editing?.kind === kind && editing.id === id ? (
      <input
        className={styles.editInput}
        value={draft}
        autoFocus
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setDraft(e.target.value)}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void commitEdit()
          else if (e.key === 'Escape') cancelEdit()
        }}
        onBlur={() => void commitEdit()}
      />
    ) : (
      <span className={styles.name}>{label}</span>
    )

  const renderFolder = (node: FolderNode, depth: number) => {
    const isOpen = expanded.has(node.id)
    const childNotes = notesByFolder.get(node.id) ?? []
    return (
      <div key={node.id}>
        <div
          className={`${styles.row} ${styles.folderRow} ${drag?.over === node.id ? styles.dropTarget : ''}`}
          style={{ paddingLeft: 8 + depth * 12 }}
          data-folder-drop={node.id}
          onPointerDown={(e) => startDrag('folder', node.id, node.name, e)}
          onClick={() => toggleFolderExpanded(node.id)}
          onDoubleClick={(e) => {
            e.stopPropagation()
            beginEdit('folder', node.id, node.name)
          }}
          onContextMenu={(e) => {
            e.preventDefault()
            setMenu({ x: e.clientX, y: e.clientY, items: folderMenu(node) })
          }}
          title={node.name}
        >
          <span className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ''}`} aria-hidden>
            <ChevronRight size={14} strokeWidth={2.5} />
          </span>
          <span className={styles.icon} aria-hidden>
            {isOpen ? <FolderOpen size={16} /> : <FolderIcon size={16} />}
          </span>
          {nameCell('folder', node.id, node.name)}
        </div>
        {isOpen && (
          <>
            {node.children.map((c) => renderFolder(c, depth + 1))}
            {childNotes.map((n) => renderNote(n, depth + 1))}
          </>
        )}
      </div>
    )
  }

  const renderNote = (note: Note, depth: number) => (
    <div
      key={note.id}
      className={`${styles.row} ${styles.noteRow}`}
      style={{ paddingLeft: 8 + depth * 12 }}
      onPointerDown={(e) => startDrag('note', note.id, note.title || 'Untitled', e)}
      onClick={() => openNote(note)}
      onContextMenu={(e) => {
        e.preventDefault()
        setMenu({ x: e.clientX, y: e.clientY, items: noteMenu(note) })
      }}
      title={note.title || 'Untitled'}
    >
      <span className={styles.icon} aria-hidden>
        <FileText size={16} />
      </span>
      {nameCell('note', note.id, note.title || 'Untitled')}
    </div>
  )

  const unfiled = notesByFolder.get(null) ?? []

  return (
    <div className={styles.tree}>
      <div className={styles.header}>
        <span className={styles.headerLabel}>Files</span>
        <button
          type="button"
          className={styles.headerBtn}
          onClick={() => void handleNewFolder(null)}
          title="New folder"
          aria-label="New folder"
        >
          <Plus size={16} strokeWidth={2.5} />
        </button>
      </div>

      <div
        className={`${styles.rootDrop} ${drag?.over === 'root' ? styles.dropTarget : ''}`}
        data-folder-drop="root"
      >
        {tree.map((node) => renderFolder(node, 0))}

        {unfiled.length > 0 && (
          <>
            <div className={styles.unfiledLabel}>Unfiled</div>
            {unfiled.map((n) => renderNote(n, 0))}
          </>
        )}

        {tree.length === 0 && unfiled.length === 0 && (
          <div className={styles.empty}>This vault is empty. Right-click or ＋ to add a folder.</div>
        )}
      </div>

      {drag &&
        createPortal(
          <div className={styles.dragGhost} style={{ left: drag.x + 12, top: drag.y + 8 }}>
            {drag.kind === 'folder' ? <FolderIcon size={14} /> : <FileText size={14} />} <span>{drag.label}</span>
          </div>,
          document.body,
        )}

      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
    </div>
  )
}
