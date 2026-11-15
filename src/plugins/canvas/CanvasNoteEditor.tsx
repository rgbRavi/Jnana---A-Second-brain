// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Edit-mode surface for a canvas note. Bridges the note-type `value`/`onChange`
// (a serialized CanvasDoc string) to CanvasBoardCore's controlled doc/setDoc.

import { useCallback, useEffect, useMemo } from 'react'
import { useNotesContext } from '../../context/NotesContext'
import { getActiveVaultId } from '../../hooks/useVaults'
import { parseDoc, serializeDoc, type CanvasDoc } from '../../core/canvas'
import { CanvasBoardCore } from '../../views/workspaces/canvas/CanvasBoardCore'
import type { NoteEditorProps } from '../../lib/noteTypes'
import { canvasLog, checkCanvasContent } from './log'

/** A single board update slower than this is worth a perf note. */
const SLOW_UPDATE_MS = 50

const DEFAULT_VAULT_ID = 'vault-default'

export function CanvasNoteEditor({ note, value, onChange }: NoteEditorProps) {
  const { notes: allNotes, update, updateTags } = useNotesContext()

  const doc = useMemo(() => parseDoc(value), [value])

  // Once per opened note: flag unreadable content, and record the board's size.
  useEffect(() => {
    checkCanvasContent(note.id, value)
    const d = parseDoc(value)
    canvasLog.debug('Opened canvas', { noteId: note.id, nodes: d.nodes.length, edges: d.edges.length, strokes: d.drawings.length })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.id])
  // ponytail: re-parse `value` per mutation (the host owns the string); add a
  // local doc ref if very large boards lag.
  const setDoc = useCallback(
    (updater: CanvasDoc | ((prev: CanvasDoc) => CanvasDoc)) => {
      const t0 = performance.now()
      const next = typeof updater === 'function' ? updater(parseDoc(value)) : updater
      const serialized = serializeDoc(next)
      onChange(serialized)
      const ms = performance.now() - t0
      if (ms > SLOW_UPDATE_MS) {
        canvasLog.debug('Slow canvas update', { noteId: note.id, ms: Math.round(ms), nodes: next.nodes.length, chars: serialized.length })
      }
    },
    [value, onChange, note.id],
  )

  // Standalone canvas note: candidate pool = notes in the active vault, minus
  // canvas notes themselves (you don't drop a canvas onto a canvas).
  const vault = getActiveVaultId()
  const notesPool = useMemo(
    () => allNotes.filter((n) => (n.vaultId ?? DEFAULT_VAULT_ID) === vault && n.kind !== 'canvas'),
    [allNotes, vault],
  )

  return (
    <CanvasBoardCore
      doc={doc}
      setDoc={setDoc}
      notesPool={notesPool}
      allNotes={allNotes}
      update={update}
      updateTags={updateTags}
      resetKey={note.id}
      log={canvasLog}
    />
  )
}
