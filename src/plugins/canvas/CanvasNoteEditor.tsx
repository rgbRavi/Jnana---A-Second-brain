// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Edit-mode surface for a canvas note. Bridges the note-type `value`/`onChange`
// (a serialized CanvasDoc string) to CanvasBoardCore's controlled doc/setDoc.

import { useCallback, useMemo } from 'react'
import { useNotesContext } from '../../context/NotesContext'
import { getActiveVaultId } from '../../hooks/useVaults'
import { parseDoc, serializeDoc, type CanvasDoc } from '../../core/canvas'
import { CanvasBoardCore } from '../../views/workspaces/canvas/CanvasBoardCore'
import type { NoteEditorProps } from '../../lib/noteTypes'

const DEFAULT_VAULT_ID = 'vault-default'

export function CanvasNoteEditor({ note, value, onChange }: NoteEditorProps) {
  const { notes: allNotes, update, updateTags } = useNotesContext()

  const doc = useMemo(() => parseDoc(value), [value])
  // ponytail: re-parse `value` per mutation (the host owns the string); add a
  // local doc ref if very large boards lag.
  const setDoc = useCallback(
    (updater: CanvasDoc | ((prev: CanvasDoc) => CanvasDoc)) => {
      const next = typeof updater === 'function' ? updater(parseDoc(value)) : updater
      onChange(serializeDoc(next))
    },
    [value, onChange],
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
    />
  )
}
