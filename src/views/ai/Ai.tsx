// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useEffect, useState } from 'react'
import { useNotesContext } from '../../context/NotesContext'
import { useRag } from '../../hooks/useRag'
import { useViewState } from '../../hooks/useViewState'
import type { AiMode } from '../../hooks/aiNav'
import { useScopedNoteIds } from '../../hooks/useScopedNoteIds'
import { setRetrievalScope } from '../../core/ai'
import { FreeChat } from '../../ui/ai/FreeChat'
import { ChatHistory } from '../../ui/ai/ChatHistory'
import { ProjectsView } from './ProjectsView'
import { ChatsView } from './ChatsView'
import { NoteModal } from '../../ui/NoteModal'


function Ai() {
  const { notes, update, updateTags } = useNotesContext()
  const { config, reindexAll } = useRag()
  const [mode] = useViewState<AiMode>('ai.mode', 'chat')
  const [openNoteId, setOpenNoteId] = useState<string | null>(null)
  const openNote = notes.find((n) => n.id === openNoteId)

  // Restrict RAG retrieval to the chosen scope while the AI view is mounted.
  const { noteIds } = useScopedNoteIds()
  useEffect(() => {
    setRetrievalScope(noteIds)
    return () => setRetrievalScope(null)
  }, [noteIds])

  return (
    <div style={{ flex: 1, minHeight: 0, height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--fx-view-bg)' }}>
      {/* Body: history drawer + the active chat (each manages its own scroll) */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: '1rem', padding: '1rem 1.5rem', overflow: 'hidden' }}>
        <ChatHistory mode="chat" />
        <div style={{ flex: 1, minHeight: 0, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          {mode === 'projects' ? (
            <ProjectsView />
          ) : mode === 'chats' ? (
            <ChatsView />
          ) : (
            <FreeChat config={config} notes={notes} onOpenNote={setOpenNoteId} onReindexAll={reindexAll} />
          )}
        </div>
      </div>

      {openNote && (
        <NoteModal
          note={openNote}
          isOpen={!!openNoteId}
          onClose={() => setOpenNoteId(null)}
          onUpdate={update}
          onUpdateTags={updateTags}
        />
      )}
    </div>
  )
}

export default Ai
