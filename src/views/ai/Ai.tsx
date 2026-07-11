// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useNotesContext } from '../../context/NotesContext'
import { useRag } from '../../hooks/useRag'
import { useViewState } from '../../hooks/useViewState'
import { useScopedNoteIds } from '../../hooks/useScopedNoteIds'
import { setRetrievalScope } from '../../core/ai'
import { AiChat } from '../../ui/ai/AiChat'
import { FreeChat } from '../../ui/ai/FreeChat'
import { ChatHistory } from '../../ui/ai/ChatHistory'
import { ScopeBar } from '../../ui/ScopeBar'
import { NoteModal } from '../../ui/NoteModal'
import styles from '../../ui/ai/Ai.module.css'

type AiMode = 'focused' | 'chat'

function Ai() {
  const { notes, update, updateTags } = useNotesContext()
  const { config } = useRag()
  const [mode, setMode] = useViewState<AiMode>('ai.mode', 'focused')
  const [openNoteId, setOpenNoteId] = useState<string | null>(null)
  const openNote = notes.find((n) => n.id === openNoteId)

  // Restrict RAG retrieval to the chosen scope while the AI view is mounted.
  const { noteIds } = useScopedNoteIds()
  useEffect(() => {
    setRetrievalScope(noteIds)
    return () => setRetrievalScope(null)
  }, [noteIds])

  return (
    <div style={{ flex: 1, minHeight: 0, height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header: mode toggle + settings link */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          padding: '1rem 1.5rem 0.75rem',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', flexWrap: 'wrap' }}>
          <div className={styles.scopeChips}>
            <button
              className={`${styles.btn} ${mode === 'focused' ? styles.btnActive : ''}`}
              onClick={() => setMode('focused')}
              title="Grounded analysis over your notes (topic / time / note scopes)"
            >
              Focused AI Assist
            </button>
            <button
              className={`${styles.btn} ${mode === 'chat' ? styles.btnActive : ''}`}
              onClick={() => setMode('chat')}
              title="A normal chatbot — multi-turn, file/media upload, thinking toggle"
            >
              AI Chat
            </button>
          </div>
          <ScopeBar />
        </div>
        <NavLink to="/settings" className={styles.settingsBtn}>
          <span className={`${styles.statusDot} ${config.enabled ? styles.statusOn : ''}`}>
            {config.enabled ? `● ${config.chatProvider}` : '○ disabled'}
          </span>
          ⚙ Settings
        </NavLink>
      </div>

      {/* Body: history drawer + the active chat (each manages its own scroll) */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: '1rem', padding: '1rem 1.5rem', overflow: 'hidden' }}>
        <ChatHistory mode={mode} />
        <div style={{ flex: 1, minHeight: 0, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          {mode === 'focused' ? (
            <AiChat config={config} notes={notes} onOpenNote={setOpenNoteId} />
          ) : (
            <FreeChat config={config} notes={notes} />
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
