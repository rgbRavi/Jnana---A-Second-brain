// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// The workspace "Canvas" tab: a lens over the workspace's canvas-kind notes.
// Canvases are ordinary notes now (kind='canvas'), so this just lists the
// workspace's members with that kind + a "New canvas" action; opening one routes
// through note:navigate into the Working Notes desk (same as any note).

import { useMemo } from 'react'
import { Plus } from 'lucide-react'
import { useNotesContext } from '../../../context/NotesContext'
import { useWorkspaceNotes } from '../../../hooks/useWorkspaceNotes'
import { eventBus } from '../../../lib/eventBus'
import { toast } from '../../../lib/toast'
import type { Note } from '../../../types'
import { EMPTY_CANVAS_CONTENT } from '../../../plugins/canvas/canvasNote'
import { CANVAS_NOTE_KIND } from '../../../plugins/canvas'
import { CanvasStatic } from './CanvasStatic'
import styles from '../Workspaces.module.css'

export function WorkspaceCanvasList({ workspaceId }: { workspaceId: string }) {
  const { notes: allNotes, create } = useNotesContext()
  const { notes: wsNotes, addNotes, refresh } = useWorkspaceNotes(workspaceId)

  const canvases = useMemo(() => wsNotes.filter((n) => n.kind === CANVAS_NOTE_KIND), [wsNotes])

  const open = (note: Note) => eventBus.emit('note:navigate', note)

  const newCanvas = async () => {
    try {
      const note = await create('Canvas', EMPTY_CANVAS_CONTENT, undefined, [], CANVAS_NOTE_KIND)
      await addNotes([note.id])
      refresh()
      open(note)
    } catch (err) {
      toast.error('Could not create canvas: ' + String(err))
    }
  }

  return (
    <div className={styles.tabBody}>
      <div className={styles.tabHeaderRow}>
        <button className={styles.primaryBtn} onClick={() => void newCanvas()}>
          <Plus size={16} /> New canvas
        </button>
      </div>

      {canvases.length === 0 ? (
        <div className={styles.empty}>No canvases yet. Create one to start sketching.</div>
      ) : (
        <div className={styles.grid}>
          {canvases.map((note) => (
            <button key={note.id} className={styles.canvasCard} onClick={() => open(note)}>
              <CanvasStatic content={note.content} allNotes={allNotes} height={150} />
              <span className={styles.cardName}>{note.title || 'Untitled'}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
