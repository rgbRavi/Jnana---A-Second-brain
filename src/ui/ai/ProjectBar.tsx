// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useEffect, useMemo, useState } from 'react'
import { ask } from '@tauri-apps/plugin-dialog'
import type { AiProject, Note, ProjectKnowledge } from '../../types'
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

const pill: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '5px',
  background: 'var(--surface-2)',
  color: 'var(--text-2)',
  border: '1px solid var(--border)',
  borderRadius: '999px',
  padding: '0.3rem 0.7rem',
  fontSize: '0.78rem',
  cursor: 'pointer',
}

interface BarProps {
  projects: AiProject[]
  projectId: string
  onProjectId: (id: string) => void
  notes: Note[]
  onChanged: () => void
}

/** Project selector for the AI Chat header, with a Manage button. */
export function ProjectBar({ projects, projectId, onProjectId, notes, onChanged }: BarProps) {
  const [managing, setManaging] = useState(false)
  const active = projects.some((p) => p.id === projectId)

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <select
        value={active ? projectId : ''}
        onChange={(e) => onProjectId(e.target.value)}
        title="Ground this chat in a project"
        style={{
          ...pill,
          appearance: 'auto',
          color: active ? 'var(--accent)' : 'var(--text-2)',
          borderColor: active ? 'var(--accent)' : 'var(--border)',
        }}
      >
        <option value="">📁 No project</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <button style={pill} onClick={() => setManaging(true)} title="Create and edit projects">
        ⚙ Manage
      </button>

      {managing && (
        <ProjectManager
          notes={notes}
          initialId={active ? projectId : null}
          onClose={() => setManaging(false)}
          onChanged={onChanged}
          onSelect={onProjectId}
        />
      )}
    </div>
  )
}

// ─── Manager modal ──────────────────────────────────────────

const field: React.CSSProperties = {
  width: '100%',
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)',
  color: 'var(--text-1)',
  padding: '0.5rem 0.6rem',
  fontSize: '0.85rem',
  fontFamily: 'var(--font-body)',
  outline: 'none',
}

function ProjectManager({
  notes,
  initialId,
  onClose,
  onChanged,
  onSelect,
}: {
  notes: Note[]
  initialId: string | null
  onClose: () => void
  onChanged: () => void
  onSelect: (id: string) => void
}) {
  const [projects, setProjects] = useState<AiProject[]>([])
  const [editing, setEditing] = useState<AiProject | null>(null)
  const [knowledge, setKnowledge] = useState<ProjectKnowledge[]>([])
  const [noteQuery, setNoteQuery] = useState('')

  const refreshProjects = async () => {
    const ps = await listProjects()
    setProjects(ps)
    return ps
  }

  useEffect(() => {
    refreshProjects().then((ps) => {
      if (initialId) {
        const p = ps.find((x) => x.id === initialId)
        if (p) openProject(p)
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const openProject = (p: AiProject) => {
    setEditing(p)
    listProjectKnowledge(p.id).then(setKnowledge).catch(() => setKnowledge([]))
  }

  const persistProject = async (p: AiProject) => {
    await saveProject({ ...p, updatedAt: Date.now() }).catch((e) => console.error(e))
    await refreshProjects()
    onChanged()
  }

  const createNew = async () => {
    const p = { ...newProject(), name: 'New project' }
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
    onChanged()
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

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(720px, 94vw)',
          maxHeight: '88vh',
          overflowY: 'auto',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: '0 18px 50px rgba(0,0,0,0.5)',
          padding: '1.1rem 1.25rem',
          display: 'flex',
          gap: '1rem',
        }}
      >
        {/* Left: project list */}
        <div style={{ width: '200px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '6px', borderRight: '1px solid var(--border)', paddingRight: '0.85rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong style={{ color: 'var(--text-1)', fontSize: '0.9rem' }}>Projects</strong>
            <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', color: 'var(--text-2)', cursor: 'pointer', fontSize: '1rem' }}>
              ✕
            </button>
          </div>
          <button style={{ ...pill, justifyContent: 'center' }} onClick={createNew}>
            + New project
          </button>
          <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {projects.map((p) => (
              <div
                key={p.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  background: editing?.id === p.id ? 'rgba(124,106,247,0.15)' : 'transparent',
                  borderRadius: 'var(--radius-sm)',
                  padding: '0.35rem 0.4rem',
                }}
              >
                <button onClick={() => openProject(p)} style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none', color: 'var(--text-1)', cursor: 'pointer', fontSize: '0.82rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {p.name}
                </button>
                <button onClick={() => removeProject(p)} title="Delete" style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer' }}>
                  ✕
                </button>
              </div>
            ))}
            {projects.length === 0 && <p style={{ fontSize: '0.76rem', color: 'var(--text-3)' }}>No projects yet.</p>}
          </div>
        </div>

        {/* Right: editor */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {!editing ? (
            <p style={{ color: 'var(--text-3)', fontSize: '0.85rem' }}>Select a project, or create one.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
              <input style={field} placeholder="Project name" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} onBlur={() => persistProject(editing)} />
              <input style={field} placeholder="Description (optional)" value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} onBlur={() => persistProject(editing)} />
              <div>
                <label style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Custom instructions</label>
                <textarea
                  style={{ ...field, minHeight: '110px', resize: 'vertical', lineHeight: 1.5, marginTop: '4px' }}
                  placeholder="How should the assistant behave in this project? (role, goals, constraints…)"
                  value={editing.instructions}
                  onChange={(e) => setEditing({ ...editing, instructions: e.target.value })}
                  onBlur={() => persistProject(editing)}
                />
              </div>

              {/* Knowledge */}
              <div>
                <label style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Knowledge ({knowledge.length})</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', margin: '4px 0 0.5rem' }}>
                  {knowledge.map((k) => (
                    <div key={k.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '0.35rem 0.5rem' }}>
                      <span aria-hidden>{k.kind === 'note' ? '📝' : '📄'}</span>
                      <span style={{ flex: 1, minWidth: 0, fontSize: '0.82rem', color: 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{k.label || k.refId}</span>
                      <button onClick={() => removeKnowledge(k.id)} title="Remove" style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer' }}>
                        ✕
                      </button>
                    </div>
                  ))}
                  {knowledge.length === 0 && <p style={{ fontSize: '0.78rem', color: 'var(--text-3)' }}>No knowledge yet — attach notes or files to ground this project.</p>}
                </div>

                <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <button style={pill} onClick={addFileKnowledge}>📄 Add file</button>
                  <div style={{ position: 'relative', flex: 1, minWidth: '160px' }}>
                    <input style={field} placeholder="Search notes to add…" value={noteQuery} onChange={(e) => setNoteQuery(e.target.value)} />
                    {noteMatches.length > 0 && (
                      <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 60, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', boxShadow: '0 10px 28px rgba(0,0,0,0.4)', maxHeight: '220px', overflowY: 'auto' }}>
                        {noteMatches.map((n) => (
                          <button key={n.id} onClick={() => addNoteKnowledge(n)} style={{ display: 'block', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', color: 'var(--text-1)', fontSize: '0.82rem', padding: '0.4rem 0.5rem', cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {n.title?.trim() || 'Untitled'}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', borderTop: '1px solid var(--border)', paddingTop: '0.7rem' }}>
                <button style={{ ...pill, background: 'var(--accent)', color: '#fff', borderColor: 'var(--accent)' }} onClick={() => { onSelect(editing.id); onClose() }}>
                  Use this project
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
