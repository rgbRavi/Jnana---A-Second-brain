// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useEffect, useState } from 'react'
import { Palette, Pencil, Plus, Settings, Wrench, X } from 'lucide-react'
import { showConfirmDialog } from '../../lib/dialog'
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
    const ok = await showConfirmDialog({
      title: `Delete ${p.kind}`,
      message: `“${p.name}” will be deleted. This can't be undone.`,
      confirmLabel: 'Delete',
      danger: true,
    })
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
      style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'var(--scrim)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
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
          boxShadow: 'var(--shadow-xl)',
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
                style={{ ...pill, background: 'var(--accent)', color: 'var(--on-accent)', borderColor: 'var(--accent)' }}
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
