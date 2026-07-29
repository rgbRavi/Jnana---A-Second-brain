// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useEffect, useState } from 'react'
import { Palette, Pencil, Plus, Settings, Wrench, X } from 'lucide-react'
import { ask } from '@tauri-apps/plugin-dialog'
import type { AiPreset, PresetKind } from '../../types'
import { listPresets, savePreset, deletePreset, newPreset } from '../../core/aiWorkspace'
import styles from './Ai.module.css'

const pill: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '5px',
  background: 'var(--surface-2)',
  color: 'var(--text-2)',
  border: '1px solid var(--border)',
  borderRadius: '999px',
  padding: '0.3rem 0.7rem',
  fontSize: '0.75rem',
  cursor: 'pointer',
}

interface PickerProps {
  styles: AiPreset[]
  skills: AiPreset[]
  styleId: string
  onStyleId: (id: string) => void
  skillIds: string[]
  onSkillIds: (ids: string[]) => void
  /** Called after the manager creates/edits/deletes a preset, to refresh lists. */
  onChanged: () => void
}

// ─── Trigger-less bodies (reused by the composer's Capabilities menu) ────────

/** Single-select list of response styles (radio semantics: pick one, or none). */
export function StylesBody({
  styles: stylePresets,
  styleId,
  onStyleId,
}: {
  styles: AiPreset[]
  styleId: string
  onStyleId: (id: string) => void
}) {
  const rows: { id: string; name: string; description?: string }[] = [
    { id: '', name: 'None', description: 'Default assistant voice' },
    ...stylePresets.map((s) => ({ id: s.id, name: s.name, description: s.description })),
  ]
  return (
    <>
      {rows.map((s) => {
        const active = s.id === styleId || (!s.id && !stylePresets.some((x) => x.id === styleId))
        return (
          <label key={s.id || 'none'} className={styles.cCheck}>
            <input type="radio" name="ai-style" checked={active} onChange={() => onStyleId(s.id)} />
            <span style={{ flex: 1, minWidth: 0 }}>
              {s.name}
              {s.description && <small>{s.description}</small>}
            </span>
          </label>
        )
      })}
    </>
  )
}

/** Multi-select list of skills + a Manage entry (opens the preset manager). */
export function SkillsBody({
  skills,
  skillIds,
  onSkillIds,
  onChanged,
}: {
  skills: AiPreset[]
  skillIds: string[]
  onSkillIds: (ids: string[]) => void
  onChanged: () => void
}) {
  const [managing, setManaging] = useState(false)
  const toggle = (id: string) =>
    onSkillIds(skillIds.includes(id) ? skillIds.filter((x) => x !== id) : [...skillIds, id])

  return (
    <>
      {skills.length === 0 && <p className={styles.pickerEmpty}>No skills yet — use Manage to add one.</p>}
      {skills.map((s) => (
        <label key={s.id} className={styles.cCheck}>
          <input type="checkbox" checked={skillIds.includes(s.id)} onChange={() => toggle(s.id)} />
          <span style={{ flex: 1, minWidth: 0 }}>
            {s.name}
            {s.description && <small>{s.description}</small>}
          </span>
        </label>
      ))}
      <div className={styles.cDivider} />
      <button type="button" className={styles.cRow} onClick={() => setManaging(true)}>
        <Settings size={15} /> <span className={styles.cRowLabel}>Manage styles &amp; skills</span>
      </button>
      {managing && <PresetManager onClose={() => setManaging(false)} onChanged={onChanged} />}
    </>
  )
}

export function PresetPicker({ styles, skills, styleId, onStyleId, skillIds, onSkillIds, onChanged }: PickerProps) {
  const [skillsOpen, setSkillsOpen] = useState(false)
  const [managing, setManaging] = useState(false)
  const activeSkillCount = skillIds.filter((id) => skills.some((s) => s.id === id)).length

  const toggleSkill = (id: string) =>
    onSkillIds(skillIds.includes(id) ? skillIds.filter((x) => x !== id) : [...skillIds, id])

  return (
    <>
      {/* Style dropdown */}
      <select
        value={styles.some((s) => s.id === styleId) ? styleId : ''}
        onChange={(e) => onStyleId(e.target.value)}
        title="Response style"
        style={{
          ...pill,
          appearance: 'auto',
          color: styleId ? 'var(--accent)' : 'var(--text-2)',
          borderColor: styleId ? 'var(--accent)' : 'var(--border)',
        }}
      >
        <option value="">🎨 Style: none</option>
        {styles.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>

      {/* Skills multiselect */}
      <div style={{ position: 'relative' }}>
        <button
          onClick={() => setSkillsOpen((v) => !v)}
          title="Apply one or more skills"
          style={{
            ...pill,
            color: activeSkillCount ? 'var(--accent)' : 'var(--text-2)',
            borderColor: activeSkillCount ? 'var(--accent)' : 'var(--border)',
          }}
        >
          <Wrench size={14} /> Skills{activeSkillCount ? ` (${activeSkillCount})` : ''}
        </button>
        {skillsOpen && (
          <>
            <div onClick={() => setSkillsOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 39 }} />
            <div
              style={{
                position: 'absolute',
                bottom: 'calc(100% + 6px)',
                left: 0,
                zIndex: 40,
                width: '260px',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                boxShadow: '0 10px 28px rgba(0,0,0,0.4)',
                padding: '0.5rem',
              }}
            >
              {skills.length === 0 && (
                <p style={{ fontSize: '0.75rem', color: 'var(--text-3)', padding: '0.3rem' }}>
                  No skills yet — use Manage to add one.
                </p>
              )}
              <div style={{ maxHeight: '220px', overflowY: 'auto' }}>
                {skills.map((s) => (
                  <label
                    key={s.id}
                    style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', padding: '0.35rem 0.3rem', cursor: 'pointer', fontSize: '0.82rem' }}
                  >
                    <input type="checkbox" checked={skillIds.includes(s.id)} onChange={() => toggleSkill(s.id)} style={{ marginTop: '3px' }} />
                    <span>
                      <span style={{ color: 'var(--text-1)' }}>{s.name}</span>
                      {s.description && <span style={{ color: 'var(--text-3)', display: 'block', fontSize: '0.72rem' }}>{s.description}</span>}
                    </span>
                  </label>
                ))}
              </div>
              <button
                onClick={() => {
                  setSkillsOpen(false)
                  setManaging(true)
                }}
                style={{ ...pill, width: '100%', justifyContent: 'center', marginTop: '0.4rem' }}
              >
                <Settings size={14} /> Manage skills & styles
              </button>
            </div>
          </>
        )}
      </div>

      {managing && (
        <PresetManager
          onClose={() => setManaging(false)}
          onChanged={onChanged}
        />
      )}
    </>
  )
}

// ─── Manager modal ──────────────────────────────────────────

export function PresetManager({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const [kind, setKind] = useState<PresetKind>('style')
  const [items, setItems] = useState<AiPreset[]>([])
  const [editing, setEditing] = useState<AiPreset | null>(null)

  const refresh = (k: PresetKind) => {
    listPresets(k)
      .then(setItems)
      .catch((e) => console.error(e))
  }
  useEffect(() => {
    refresh(kind)
  }, [kind])

  const save = async () => {
    if (!editing) return
    if (!editing.name.trim() || !editing.body.trim()) return
    await savePreset({ ...editing, updatedAt: Date.now() }).catch((e) => console.error(e))
    setEditing(null)
    refresh(kind)
    onChanged()
  }

  const remove = async (p: AiPreset) => {
    const ok = await ask(`Delete ${p.kind} "${p.name}"?`, { title: 'Delete preset', kind: 'warning' })
    if (!ok) return
    await deletePreset(p.id).catch((e) => console.error(e))
    refresh(kind)
    onChanged()
  }

  const field: React.CSSProperties = {
    width: '100%',
    background: 'var(--bg)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--text-1)',
    padding: '0.5rem 0.6rem',
    fontSize: '0.875rem',
    fontFamily: 'var(--font-body)',
    outline: 'none',
  }
  const tab = (active: boolean): React.CSSProperties => ({
    ...pill,
    background: active ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'var(--surface-2)',
    color: active ? 'var(--accent)' : 'var(--text-2)',
    borderColor: active ? 'var(--accent)' : 'var(--border)',
  })

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(560px, 92vw)',
          maxHeight: '85vh',
          overflowY: 'auto',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: '0 18px 50px rgba(0,0,0,0.5)',
          padding: '1.1rem 1.25rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.85rem' }}>
          <strong style={{ color: 'var(--text-1)', fontSize: '0.9375rem' }}>Styles &amp; Skills</strong>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', color: 'var(--text-2)', cursor: 'pointer', display: 'inline-flex' }}>
            <X size={17} />
          </button>
        </div>

        <div style={{ display: 'flex', gap: '6px', marginBottom: '0.85rem' }}>
          <button style={tab(kind === 'style')} onClick={() => { setKind('style'); setEditing(null) }}>
            <Palette size={14} /> Styles
          </button>
          <button style={tab(kind === 'skill')} onClick={() => { setKind('skill'); setEditing(null) }}>
            <Wrench size={14} /> Skills
          </button>
        </div>

        {editing ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            <input style={field} placeholder="Name" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            <input style={field} placeholder="Short description (optional)" value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
            <textarea
              style={{ ...field, minHeight: '120px', resize: 'vertical', lineHeight: 1.5 }}
              placeholder={kind === 'style' ? 'How should the assistant write? (tone, length, format…)' : 'What should this skill make the assistant do?'}
              value={editing.body}
              onChange={(e) => setEditing({ ...editing, body: e.target.value })}
            />
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button style={pill} onClick={() => setEditing(null)}>Cancel</button>
              <button
                style={{ ...pill, background: 'var(--accent)', color: '#fff', borderColor: 'var(--accent)' }}
                disabled={!editing.name.trim() || !editing.body.trim()}
                onClick={save}
              >
                Save
              </button>
            </div>
          </div>
        ) : (
          <>
            <button style={{ ...pill, marginBottom: '0.6rem' }} onClick={() => setEditing(newPreset(kind))}>
              <Plus size={14} /> New {kind}
            </button>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {items.length === 0 && <p style={{ fontSize: '0.8rem', color: 'var(--text-3)' }}>None yet.</p>}
              {items.map((p) => (
                <div
                  key={p.id}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '0.5rem 0.6rem' }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: 'var(--text-1)', fontSize: '0.875rem' }}>{p.name}</div>
                    {p.description && <div style={{ color: 'var(--text-3)', fontSize: '0.75rem' }}>{p.description}</div>}
                  </div>
                  <button style={{ background: 'none', border: 'none', color: 'var(--text-2)', cursor: 'pointer', display: 'inline-flex' }} title="Edit" onClick={() => setEditing(p)}>
                    <Pencil size={14} />
                  </button>
                  <button style={{ background: 'none', border: 'none', color: 'var(--text-2)', cursor: 'pointer', display: 'inline-flex' }} title="Delete" onClick={() => remove(p)}>
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
