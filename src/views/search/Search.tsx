import { useNotesContext } from "../../context/NotesContext";
import { useState } from "react";
import { SearchDocs } from "../../ui/SearchDocs";
import { NoteModal } from "../../ui/NoteModal";

function Search(){
    const { notes, update, updateTags } = useNotesContext()
    const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null)
    const expandedNote = notes.find((note) => note.id === expandedNoteId)

    return(
        <div className="search-view">
          <p className="section-label">Search</p>
          <SearchDocs
            notes={notes}
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