// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useNotesContext } from "../../context/NotesContext";
import { useMemo, useState } from "react";
import { SearchDocs } from "../../ui/SearchDocs";
import { ScopeBar } from "../../ui/ScopeBar";
import { NoteModal } from "../../ui/NoteModal";
import { useScopedNoteIds } from "../../hooks/useScopedNoteIds";
import { useActiveVaultId } from "../../hooks/useVaults";
import { DEFAULT_VAULT_ID } from "../../types";

function Search(){
    const { notes, update, updateTags } = useNotesContext()
    const { noteIds } = useScopedNoteIds()
    const activeVaultId = useActiveVaultId()
    const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null)
    const expandedNote = notes.find((note) => note.id === expandedNoteId)

    // Search is scoped to the active vault, then further to the chosen workspace
    // scope (if any) — both constraints apply.
    const scopedNotes = useMemo(
        () =>
            notes.filter(
                (n) =>
                    (n.vaultId ?? DEFAULT_VAULT_ID) === activeVaultId && (!noteIds || noteIds.has(n.id)),
            ),
        [notes, noteIds, activeVaultId],
    )

    return(
        <div className="search-view">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
            <p className="section-label">Search</p>
            <ScopeBar />
          </div>
          <SearchDocs
            notes={scopedNotes}
            onOpenNote={(noteId) => setExpandedNoteId(noteId)}
          />
          {expandedNote && (
            <NoteModal
              note={expandedNote}
              isOpen={!!expandedNoteId}
              onClose={() => setExpandedNoteId(null)}
              onUpdate={update}
              onUpdateTags={updateTags}
            />
          )}
        </div>
    )
}

export default Search
