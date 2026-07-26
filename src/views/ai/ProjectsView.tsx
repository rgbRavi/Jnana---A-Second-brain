// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useEffect, useState, useMemo } from 'react'
import { FileUp, Plus, X, FolderKanban, MessageSquarePlus } from 'lucide-react'
import { ask } from '@tauri-apps/plugin-dialog'
import { useNotesContext } from '../../context/NotesContext'
import { useViewState } from '../../hooks/useViewState'
import { useActiveVaultId } from '../../hooks/useVaults'
import { eventBus } from '../../lib/eventBus'
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
import { pickAttachments as pickFiles } from '../../core/ai'
import type { AiProject, Note, ProjectKnowledge, ConversationMeta } from '../../types'

const field: React.CSSProperties = {
  width: '100%',
  background: 'color-mix(in srgb, var(--surface) 60%, transparent)',
  backdropFilter: 'blur(12px)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)',
  color: 'var(--text-1)',
  padding: '0.6rem 0.8rem',
  fontSize: '0.9rem',
  fontFamily: 'var(--font-body)',
  outline: 'none',
  transition: 'border-color 0.2s',
}

const pill: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '5px',
  background: 'color-mix(in srgb, var(--surface-2) 90%, transparent)',
  backdropFilter: 'blur(8px)',
  color: 'var(--text-2)',
  border: '1px solid color-mix(in srgb, var(--border) 80%, transparent)',
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
  const [, setAiMode] = useViewState('ai.mode', 'focused')
  const [, setActiveProjectId] = useViewState('ai.free.projectId', '')
  const [forceOpenProject, setForceOpenProject] = useViewState('ai.projects.openId', '')

  const refreshProjects = async () => {
    const ps = await listProjects()
    setProjects(ps)
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

  const persistProject = async (p: AiProject) => {
    await saveProject({ ...p, updatedAt: Date.now() }).catch((e) => console.error(e))
    await refreshProjects()
  }

  const createNew = async () => {
    const p = { ...newProject(vaultId), name: 'New Project' }
    await persistProject(p)
    openProject(p)
  }

  const removeProject = async (p: AiProject) => {
    const ok = await ask(`Delete project "${p.name}" and its knowledge list? (Your notes/files are not deleted.)`, {
      title: 'Delete project',
      kind: 'warning',
    })
    if (!ok) return
    await deleteProject(p.id).catch((e) => console.error(e))
    if (editing?.id === p.id) setEditing(null)
    await refreshProjects()
  }

  const noteMatches = useMemo(() => {
    const q = noteQuery.trim().toLowerCase()
    if (!q) return []
    return notes
      .filter((n) => (n.title ?? '').toLowerCase().includes(q) || n.content.toLowerCase().includes(q))
      .slice(0, 8)
  }, [noteQuery, notes])

  const addNoteKnowledge = async (note: Note) => {
    if (!editing) return
    if (knowledge.some((k) => k.kind === 'note' && k.refId === note.id)) return
    const item = newKnowledge(editing.id, 'note', note.id, note.title?.trim() || 'Untitled')
    await addProjectKnowledge(item).catch((e) => console.error(e))
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
    }
  }

  const removeKnowledge = async (id: string) => {
    await removeProjectKnowledge(id).catch((e) => console.error(e))
    setKnowledge((prev) => prev.filter((k) => k.id !== id))
  }

  const startNewChatInProject = () => {
    if (!editing) return
    setActiveProjectId(editing.id)
    setAiMode('chat')
    eventBus.emit('ai:newChat', { mode: 'chat' })
  }

  const openChat = (chatId: string) => {
    if (!editing) return
    setActiveProjectId(editing.id)
    setAiMode('chat')
    eventBus.emit('ai:loadConversation', { mode: 'chat', id: chatId })
  }

  if (!editing) {
    return (
      <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--text-1)', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <FolderKanban size={24} color="var(--accent)" /> AI Projects
          </h1>
          <button style={{ ...pill, background: 'var(--accent)', color: '#fff', borderColor: 'var(--accent)' }} onClick={createNew}>
            <Plus size={16} /> New Project
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.5rem' }}>
          {projects.map((p) => (
            <div
              key={p.id}
              onClick={() => openProject(p)}
              style={{
                background: 'color-mix(in srgb, var(--surface) 50%, transparent)',
                backdropFilter: 'blur(20px)',
                border: '1px solid color-mix(in srgb, var(--border) 50%, transparent)',
                borderRadius: 'var(--radius-lg)',
                padding: '1.25rem',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem',
                boxShadow: '0 8px 24px rgba(0,0,0,0.1)',
                transition: 'transform 0.2s, box-shadow 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)'
                e.currentTarget.style.boxShadow = '0 12px 32px rgba(0,0,0,0.15)'
                e.currentTarget.style.border = '1px solid color-mix(in srgb, var(--accent) 40%, transparent)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'none'
                e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.1)'
                e.currentTarget.style.border = '1px solid color-mix(in srgb, var(--border) 50%, transparent)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</h3>
                <button
                  onClick={(e) => { e.stopPropagation(); removeProject(p) }}
                  title="Delete Project"
                  style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', padding: '4px' }}
                >
                  <X size={16} />
                </button>
              </div>
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-2)', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                {p.description || 'No description provided.'}
              </p>
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

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border)' }}>
        <button onClick={() => setEditing(null)} style={{ ...pill, padding: '0.4rem', borderRadius: '8px' }} title="Back to Projects">
          <X size={18} />
        </button>
        <h2 style={{ margin: 0, fontSize: '1.25rem', color: 'var(--text-1)' }}>Project Settings</h2>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem 0', display: 'flex', gap: '2rem' }}>
        {/* Left column: Settings */}
        <div style={{ flex: 2, display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-2)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Project Name</label>
            <input style={field} placeholder="Name" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} onBlur={() => persistProject(editing)} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-2)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Description</label>
            <input style={field} placeholder="Description (optional)" value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} onBlur={() => persistProject(editing)} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-2)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Custom Instructions</label>
            <textarea
              style={{ ...field, minHeight: '160px', resize: 'vertical', lineHeight: 1.5 }}
              placeholder="How should the assistant behave in this project? (role, goals, constraints…)"
              value={editing.instructions}
              onChange={(e) => setEditing({ ...editing, instructions: e.target.value })}
              onBlur={() => persistProject(editing)}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-2)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Knowledge ({knowledge.length})</label>
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
                  <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 60, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', boxShadow: '0 10px 28px rgba(0,0,0,0.4)', maxHeight: '220px', overflowY: 'auto' }}>
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
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-2)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Recent Chats in Project</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {chats.length === 0 ? (
                <p style={{ fontSize: '0.85rem', color: 'var(--text-3)', fontStyle: 'italic' }}>No chats yet.</p>
              ) : (
                chats.slice(0, 10).map(c => (
                  <button
                    key={c.id}
                    onClick={() => openChat(c.id)}
                    style={{
                      textAlign: 'left',
                      padding: '0.6rem 0.8rem',
                      background: 'color-mix(in srgb, var(--surface) 40%, transparent)',
                      border: '1px solid transparent',
                      borderRadius: 'var(--radius-sm)',
                      color: 'var(--text-1)',
                      fontSize: '0.85rem',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      transition: 'background 0.2s',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'color-mix(in srgb, var(--accent) 15%, transparent)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'color-mix(in srgb, var(--surface) 40%, transparent)'}
                  >
                    {c.title || 'Untitled Chat'}
                  </button>
                ))
              )}
            </div>
          </div>

          <div style={{ marginTop: 'auto' }}>
            <button
              onClick={startNewChatInProject}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                padding: '0.8rem',
                background: 'color-mix(in srgb, var(--surface) 35%, transparent)',
                backdropFilter: 'blur(20px) saturate(150%)',
                border: '1px solid color-mix(in srgb, var(--text-1) 12%, transparent)',
                borderRadius: '28px',
                color: 'var(--text-1)',
                fontSize: '1rem',
                fontWeight: 500,
                cursor: 'pointer',
                boxShadow: '0 12px 36px rgba(0,0,0,0.3), inset 0 1px 1px color-mix(in srgb, var(--text-1) 15%, transparent)',
                transition: 'transform 0.2s, box-shadow 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)'
                e.currentTarget.style.boxShadow = '0 16px 40px rgba(0,0,0,0.4), inset 0 1px 1px color-mix(in srgb, var(--text-1) 25%, transparent)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'none'
                e.currentTarget.style.boxShadow = '0 12px 36px rgba(0,0,0,0.3), inset 0 1px 1px color-mix(in srgb, var(--text-1) 15%, transparent)'
              }}
            >
              <MessageSquarePlus size={20} color="var(--accent)" /> Start New Chat
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
