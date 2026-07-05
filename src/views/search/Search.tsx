import { useNotesContext } from "../../context/NotesContext";
import { useMemo, useState } from "react";
import { SearchDocs } from "../../ui/SearchDocs";
import { ScopeBar } from "../../ui/ScopeBar";
import { NoteModal } from "../../ui/NoteModal";
import { useScopedNoteIds } from "../../hooks/useScopedNoteIds";

function Search(){
    const { notes, update, updateTags } = useNotesContext()
    const { noteIds } = useScopedNoteIds()
    const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null)
    const expandedNote = notes.find((note) => note.id === expandedNoteId)

    // Narrow the searchable set to the chosen workspace scope (or the whole vault).
    const scopedNotes = useMemo(
        () => (noteIds ? notes.filter((n) => noteIds.has(n.id)) : notes),
        [notes, noteIds],
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
