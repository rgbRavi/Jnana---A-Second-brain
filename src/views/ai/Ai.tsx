// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useEffect, useState } from 'react'
import { Settings } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { useNotesContext } from '../../context/NotesContext'
import { useRag } from '../../hooks/useRag'
import { useViewState } from '../../hooks/useViewState'
import { useScopedNoteIds } from '../../hooks/useScopedNoteIds'
import { setRetrievalScope } from '../../core/ai'
import { FreeChat } from '../../ui/ai/FreeChat'
import { ChatHistory } from '../../ui/ai/ChatHistory'
import { ProjectsView } from './ProjectsView'
import { ScopeBar } from '../../ui/ScopeBar'
import { NoteModal } from '../../ui/NoteModal'
import styles from '../../ui/ai/Ai.module.css'

// 'focused' merged into 'chat' — grounded actions are now armed from the composer.
type AiMode = 'chat' | 'projects'

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
    <div style={{ flex: 1, minHeight: 0, height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg)', background: 'radial-gradient(circle at 15% 50%, color-mix(in srgb, var(--accent) 15%, transparent), transparent 50%), radial-gradient(circle at 85% 30%, color-mix(in srgb, var(--accent) 12%, transparent), transparent 50%), radial-gradient(circle at 50% 100%, color-mix(in srgb, var(--accent) 10%, transparent), transparent 60%)' }}>
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
          <ScopeBar />
        </div>
        <NavLink to="/settings" className={styles.settingsBtn} title="Settings">
          <Settings size={16} />
          <span className={styles.settingsText}>Settings</span>
        </NavLink>
      </div>

      {/* Body: history drawer + the active chat (each manages its own scroll) */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: '1rem', padding: '1rem 1.5rem', overflow: 'hidden' }}>
        <ChatHistory mode={mode} />
        <div style={{ flex: 1, minHeight: 0, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          {mode === 'projects' ? (
            <ProjectsView />
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
