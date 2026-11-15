// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useEffect, useState, useMemo } from 'react'
import { ArrowLeft, FileUp, Plus, Trash2, X, FolderKanban, MessageSquarePlus } from 'lucide-react'
import { showConfirmDialog } from '../../lib/dialog'
import { toast } from '../../lib/toast'
import { log } from '../../lib/logger'
import { useNotesContext } from '../../context/NotesContext'
import { useViewState } from '../../hooks/useViewState'
import { goToAiMode, backAiMode, useAiBackLabel } from '../../hooks/aiNav'
import { requestChatAction } from '../../hooks/useChatHistory'
import { useActiveVaultId } from '../../hooks/useVaults'
import { listConversations } from '../../core/chat'
import {
  listProjects,
  saveProject,
  deleteProject,
  newProject,
  listProjectKnowledge,
  addProjectKnowledge,
  removeProjectKnowledge,
  newKnowledge,
} from '../../core/aiWorkspace'
import { listProjectRules, setProjectRules } from '../../core/aiRules'
import { pickAttachments as pickFiles } from '../../core/ai'
import styles from './ProjectsView.module.css'
import { RulesPicker } from '../../ui/ai/RulesPicker'
import { DEFAULT_VAULT_ID, type AiProject, type Note, type ProjectKnowledge, type ConversationMeta } from '../../types'

const field: React.CSSProperties = {
  width: '100%',
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)',
  color: 'var(--text-1)',
  padding: '0.6rem 0.8rem',
  fontSize: '0.9rem',
  fontFamily: 'var(--font-body)',
  // No `outline: 'none'` — inline it beats the global :focus-visible ring.
  transition: 'border-color 0.2s',
}

/** Sentence-case field/section label (one style for the whole project form). */
const fieldLabel: React.CSSProperties = {
  display: 'block',
  margin: '0 0 0.5rem',
  fontSize: '0.82rem',
  fontWeight: 600,
  color: 'var(--text-2)',
}

const pill: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '5px',
  background: 'color-mix(in srgb, var(--surface-2) var(--fx-alpha-light), transparent)',
  backdropFilter: 'var(--fx-blur)',
  color: 'var(--text-2)',
  border: '1px solid var(--border)',
  borderRadius: '999px',
  padding: '0.4rem 0.9rem',
  fontSize: '0.85rem',
  cursor: 'pointer',
  transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
}

export function ProjectsView() {
  const { notes } = useNotesContext()
  const vaultId = useActiveVaultId()
  const [projects, setProjects] = useState<AiProject[]>([])
  const [editing, setEditing] = useState<AiProject | null>(null)
  const [knowledge, setKnowledge] = useState<ProjectKnowledge[]>([])
  const [chats, setChats] = useState<ConversationMeta[]>([])
  const [noteQuery, setNoteQuery] = useState('')
  const [projectRuleIds, setProjectRuleIds] = useState<string[]>([])
  const backLabel = useAiBackLabel()
  const [, setActiveProjectId] = useViewState('ai.free.projectId', '')
  const [forceOpenProject, setForceOpenProject] = useViewState('ai.projects.openId', '')

  const refreshProjects = async () => {
    // Projects are vault-scoped like everything else; listing another vault's here let a chat
    // in this vault be tagged with a project the rest of the AI view can't see.
    const ps = (await listProjects()).filter((p) => (p.vaultId ?? DEFAULT_VAULT_ID) === vaultId)
    setProjects(ps)
    setEditing((e) => (e && ps.some((p) => p.id === e.id) ? e : null))
    return ps
  }

  useEffect(() => {
    refreshProjects().then(ps => {
      if (forceOpenProject) {
        const p = ps.find(p => p.id === forceOpenProject)
        if (p) {
          setEditing(p)
          setActiveProjectId(p.id)
          listProjectKnowledge(p.id).then(setKnowledge).catch(() => setKnowledge([]))
          listConversations('chat', vaultId).then(all => setChats(all.filter(c => c.projectId === p.id))).catch(() => setChats([]))
          setForceOpenProject('') // clear it
        }
      }
    })
  }, [vaultId, forceOpenProject])

  const openProject = async (p: AiProject) => {
    setEditing(p)
    setActiveProjectId(p.id)
    try {
      const k = await listProjectKnowledge(p.id)
      setKnowledge(k)
    } catch {
      setKnowledge([])
    }
    try {
      // Free chat namespace is 'chat'
      const allChats = await listConversations('chat', vaultId)
      setChats(allChats.filter(c => c.projectId === p.id))
    } catch {
      setChats([])
    }
  }

  useEffect(() => {
    if (!editing) return
    listProjectRules(editing.id).then(setProjectRuleIds).catch(() => setProjectRuleIds([]))
  }, [editing?.id])

  /** Returns false (after a toast) if the save didn't persist. */
  const persistProject = async (p: AiProject): Promise<boolean> => {
    let ok = true
    await saveProject({ ...p, updatedAt: Date.now() }).catch((e) => {
      ok = false
      log.error('Failed to save project', e)
      toast.error("Couldn't save the project.")
    })
    await refreshProjects()
    return ok
  }

  const createNew = async () => {
    const p = { ...newProject(vaultId), name: 'New Project' }
    await persistProject(p)
    openProject(p)
  }

  const removeProject = async (p: AiProject) => {
    const ok = await showConfirmDialog({
      title: 'Delete project',
      message: `“${p.name}” and its knowledge list will be deleted. Your notes and files are not touched.`,
      confirmLabel: 'Delete',
      danger: true,
    })
    if (!ok) return
    try {
      await deleteProject(p.id)
    } catch (e) {
      console.error(e)
      toast.error(`Couldn't delete “${p.name}”.`)
      return
    }
    if (editing?.id === p.id) setEditing(null)
    await refreshProjects()
  }

  const noteMatches = useMemo(() => {
    const q = noteQuery.trim().toLowerCase()
    if (!q) return []
    return notes
      .filter((n) => (n.vaultId ?? DEFAULT_VAULT_ID) === vaultId)
      .filter((n) => (n.title ?? '').toLowerCase().includes(q) || n.content.toLowerCase().includes(q))
      .slice(0, 8)
  }, [noteQuery, notes, vaultId])

  const addNoteKnowledge = async (note: Note) => {
    if (!editing) return
    if (knowledge.some((k) => k.kind === 'note' && k.refId === note.id)) return
    const item = newKnowledge(editing.id, 'note', note.id, note.title?.trim() || 'Untitled')
    try {
      await addProjectKnowledge(item)
    } catch (e) {
      console.error(e)
      toast.error("Couldn't add the note to this project.")
      return
    }
    setKnowledge((prev) => [...prev, item])
    setNoteQuery('')
  }

  const addFileKnowledge = async () => {
    if (!editing) return
    try {
      const picked = await pickFiles()
      for (const f of picked) {
        if (!f.filename) continue
        const item = newKnowledge(editing.id, 'file', f.filename, f.name)
        await addProjectKnowledge(item)
        setKnowledge((prev) => [...prev, item])
      }
    } catch (e) {
      console.error(e)
      toast.error("Couldn't add the file to this project.")
    }
  }

  const removeKnowledge = async (id: string) => {
    try {
      await removeProjectKnowledge(id)
    } catch (e) {
      console.error(e)
      toast.error("Couldn't remove the item from this project.")
      return
    }
    setKnowledge((prev) => prev.filter((k) => k.id !== id))
  }

  const startNewChatInProject = () => {
    if (!editing) return
    setActiveProjectId(editing.id)
    requestChatAction('chat', { type: 'new', projectId: editing.id })
    goToAiMode('chat')
  }

  const openChat = (chatId: string) => {
    if (!editing) return
    setActiveProjectId(editing.id)
    requestChatAction('chat', { type: 'load', id: chatId })
    goToAiMode('chat')
  }

  if (!editing) {
    return (
      <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--text-1)', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button onClick={backAiMode} style={{ ...pill, padding: '0.4rem', borderRadius: 'var(--radius-sm)' }} title={backLabel} aria-label={backLabel}>
              <ArrowLeft size={18} />
            </button>
            <FolderKanban size={24} color="var(--accent)" /> AI Projects
          </h1>
          <button style={{ ...pill, background: 'var(--accent)', color: 'var(--on-accent)', borderColor: 'var(--accent)' }} onClick={createNew}>
            <Plus size={16} /> New Project
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.5rem' }}>
          {projects.map((p) => (
            <div key={p.id} className={styles.card}>
              <button type="button" className={styles.cardMain} onClick={() => openProject(p)}>
                <h3 className={styles.cardTitle}>{p.name}</h3>
                <p className={styles.cardDesc}>{p.description || 'No description provided.'}</p>
              </button>
              <button
                type="button"
                className={styles.cardDelete}
                onClick={() => removeProject(p)}
                title="Delete project"
                aria-label={`Delete project ${p.name}`}
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
          {projects.length === 0 && (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '4rem 0', color: 'var(--text-3)' }}>
              <FolderKanban size={48} style={{ opacity: 0.2, marginBottom: '1rem' }} />
              <p>No projects yet. Create one to organize your context.</p>
            </div>
          )}
        </div>
      </div>
    )
  }

  // Compared with the last saved copy (the list refreshes after every save).
  const instructionsDirty = editing.instructions !== (projects.find((p) => p.id === editing.id)?.instructions ?? editing.instructions)

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border)' }}>
        <button onClick={() => setEditing(null)} style={{ ...pill, padding: '0.4rem', borderRadius: 'var(--radius-sm)' }} title="Back to Projects" aria-label="Back to Projects">
          <ArrowLeft size={18} />
        </button>
        <h2 style={{ margin: 0, fontSize: '1.25rem', color: 'var(--text-1)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{editing.name.trim() || 'Untitled project'}</h2>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem 0', display: 'flex', gap: '2rem' }}>
        {/* Left column: Settings */}
        <div style={{ flex: 2, display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div>
            <label htmlFor="project-name" style={fieldLabel}>Name</label>
            <input id="project-name" style={field} placeholder="Name" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} onBlur={() => persistProject(editing)} />
          </div>
          <div>
            <label htmlFor="project-description" style={fieldLabel}>Description</label>
            <input id="project-description" style={field} placeholder="Description (optional)" value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} onBlur={() => persistProject(editing)} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem', minHeight: 28 }}>
              <label htmlFor="project-instructions" style={{ ...fieldLabel, marginBottom: 0 }}>Custom instructions</label>
              {instructionsDirty && (
                <button
                  // Keep focus in the textarea so its blur doesn't save a second time.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={async () => { if (await persistProject(editing)) toast.success('Instructions saved.', 2000) }}
                  style={{ ...pill, padding: '0.3rem 0.85rem', background: 'var(--accent)', color: 'var(--on-accent)', borderColor: 'var(--accent)' }}
                >
                  Save
                </button>
              )}
            </div>
            <textarea
              id="project-instructions"
              style={{ ...field, minHeight: '160px', resize: 'vertical', lineHeight: 1.5 }}
              placeholder="How should the assistant behave in this project? (role, goals, constraints…)"
              value={editing.instructions}
              onChange={(e) => setEditing({ ...editing, instructions: e.target.value })}
              // Still saves on leaving the field, so navigating away never drops an edit.
              onBlur={() => { if (instructionsDirty) void persistProject(editing) }}
            />
          </div>

          <div>
            <h3 style={fieldLabel}>Rules (inherited by every chat in this project)</h3>
            <RulesPicker
              vaultId={editing.vaultId}
              selectedIds={projectRuleIds}
              onSelectedIds={(ids) => {
                setProjectRuleIds(ids)
                void setProjectRules(editing.id, ids)
              }}
            />
          </div>

          <div>
            <h3 style={fieldLabel}>Knowledge ({knowledge.length})</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '1rem' }}>
              {knowledge.map((k) => (
                <div key={k.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', border: '1px solid var(--border)', background: 'color-mix(in srgb, var(--surface) 40%, transparent)', borderRadius: 'var(--radius-sm)', padding: '0.5rem 0.75rem' }}>
                  <span aria-hidden>{k.kind === 'note' ? '📝' : '📄'}</span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: '0.9rem', color: 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{k.label || k.refId}</span>
                  <button onClick={() => removeKnowledge(k.id)} title="Remove" style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', display: 'inline-flex' }}>
                    <X size={16} />
                  </button>
                </div>
              ))}
              {knowledge.length === 0 && <p style={{ fontSize: '0.85rem', color: 'var(--text-3)', fontStyle: 'italic' }}>No knowledge yet — attach notes or files to ground this project.</p>}
            </div>

            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <button style={pill} onClick={addFileKnowledge}><FileUp size={16} /> Add file</button>
              <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
                <input style={{ ...field, padding: '0.4rem 0.8rem', borderRadius: '999px' }} placeholder="Search notes to add…" value={noteQuery} onChange={(e) => setNoteQuery(e.target.value)} />
                {noteMatches.length > 0 && (
                  <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 60, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', boxShadow: 'var(--shadow-lg)', maxHeight: '220px', overflowY: 'auto' }}>
                    {noteMatches.map((n) => (
                      <button key={n.id} onClick={() => addNoteKnowledge(n)} style={{ display: 'block', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', color: 'var(--text-1)', fontSize: '0.85rem', padding: '0.6rem 0.8rem', cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {n.title?.trim() || 'Untitled'}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right column: Recent Chats & Actions */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1.5rem', paddingLeft: '1.5rem', borderLeft: '1px solid var(--border)' }}>
          <div>
            <h3 style={fieldLabel}>Recent chats in this project</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {chats.length === 0 ? (
                <p style={{ fontSize: '0.85rem', color: 'var(--text-3)', fontStyle: 'italic' }}>No chats yet.</p>
              ) : (
                chats.slice(0, 10).map(c => (
                  <button key={c.id} type="button" className={styles.chatLink} onClick={() => openChat(c.id)}>
                    {c.title || 'Untitled Chat'}
                  </button>
                ))
              )}
            </div>
          </div>

          <div style={{ marginTop: 'auto' }}>
            <button type="button" className={styles.newChat} onClick={startNewChatInProject}>
              <MessageSquarePlus size={20} color="var(--accent)" /> Start New Chat
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
