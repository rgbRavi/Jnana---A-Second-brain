// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useNotesContext } from "../../context/NotesContext";
import { useEffect, useMemo, useState } from "react";
import { SearchDocs } from "../../ui/SearchDocs";
import { AiSearchDocs } from "../../ui/ai/AiSearchDocs";
import { ScopeBar } from "../../ui/ScopeBar";
import { NoteModal } from "../../ui/NoteModal";
import { useScopedNoteIds } from "../../hooks/useScopedNoteIds";
import { useActiveVaultId } from "../../hooks/useVaults";
import { useViewState } from "../../hooks/useViewState";
import { DEFAULT_VAULT_ID } from "../../types";
import { setRetrievalScope } from "../../core/ai";

type SearchMode = 'keyword' | 'ai'

function Search(){
    const { notes, update, updateTags } = useNotesContext()
    const { noteIds } = useScopedNoteIds()

    // Constrain semantic (AI-mode) retrieval to the active workspace scope so
    // retrieve() over-fetches/filters to it before slicing — mirrors Ai.tsx.
    useEffect(() => {
        setRetrievalScope(noteIds)
        return () => setRetrievalScope(null)
    }, [noteIds])

    const activeVaultId = useActiveVaultId()
    const [mode, setMode] = useViewState<SearchMode>('search:mode', 'keyword')
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

    const tab = (m: SearchMode, label: string) => (
        <button
            type="button"
            onClick={() => setMode(m)}
            aria-pressed={mode === m}
            style={{
                background: mode === m ? 'var(--surface-selected)' : 'transparent',
                color: mode === m ? 'var(--text-1)' : 'var(--text-2)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                padding: '0.4rem 0.8rem',
                cursor: 'pointer',
                fontFamily: 'var(--font-body)',
                fontSize: '0.82rem',
            }}
        >
            {label}
        </button>
    )

    return(
        <div className="search-view">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
            <p className="section-label">Search</p>
            <ScopeBar />
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', margin: '0.5rem 0 0.9rem' }}>
            {tab('keyword', 'Keyword')}
            {tab('ai', 'AI')}
          </div>
          {mode === 'keyword' ? (
            <SearchDocs
              notes={scopedNotes}
              onOpenNote={(noteId) => setExpandedNoteId(noteId)}
            />
          ) : (
            <AiSearchDocs
              notes={scopedNotes}
              onOpenNote={(noteId) => setExpandedNoteId(noteId)}
            />
          )}
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
