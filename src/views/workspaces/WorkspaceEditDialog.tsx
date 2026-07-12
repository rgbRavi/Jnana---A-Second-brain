// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useState } from 'react'
import {
  newWorkspace,
  saveWorkspace,
  newCollection,
  saveCollection,
} from '../../core/workspaces'
import { getActiveVaultId } from '../../hooks/useVaults'
import { toast } from '../../lib/toast'
import type { Workspace } from '../../types'
import styles from './Workspaces.module.css'

const PALETTE = ['#7c6af7', '#3fb950', '#e3b341', '#3ba7f7', '#f778ba', '#a371f7', '#56d4bc', '#ff8c42']

interface Template {
  key: string
  label: string
  icon: string
  description: string
  collections: string[]
}

const TEMPLATES: Template[] = [
  { key: 'blank', label: 'Blank', icon: '📁', description: '', collections: [] },
  { key: 'research', label: 'Research Project', icon: '🔬', description: 'Papers, notes and findings.', collections: ['Sources', 'Ideas', 'Drafts'] },
  { key: 'course', label: 'University Course', icon: '🎓', description: 'Lectures, readings and assignments.', collections: ['Lectures', 'Readings', 'Assignments'] },
  { key: 'writing', label: 'Writing Project', icon: '✍️', description: 'Outlines, scenes and revisions.', collections: ['Outline', 'Scenes', 'Revisions'] },
  { key: 'kb', label: 'Knowledge Base', icon: '📚', description: 'Reference notes and concepts.', collections: ['Concepts', 'References'] },
  { key: 'personal', label: 'Personal', icon: '🏠', description: 'Personal notes and journal.', collections: [] },
]

interface Props {
  existing?: Workspace
  onClose: () => void
  onSaved?: (ws: Workspace) => void
}

/** Create/edit a workspace. Templates (create-only) prefill icon/description and
 *  seed starter collections. */
export function WorkspaceEditDialog({ existing, onClose, onSaved }: Props) {
  const editing = !!existing
  const [name, setName] = useState(existing?.name ?? '')
  const [icon, setIcon] = useState(existing?.icon || '📁')
  const [color, setColor] = useState<string | undefined>(existing?.color)
  const [description, setDescription] = useState(existing?.description ?? '')
  const [template, setTemplate] = useState<Template>(TEMPLATES[0])
  const [saving, setSaving] = useState(false)

  const applyTemplate = (t: Template) => {
    setTemplate(t)
    setIcon(t.icon)
    if (!description.trim() || description === template.description) setDescription(t.description)
  }

  const handleSave = async () => {
    if (!name.trim() || saving) return
    setSaving(true)
    try {
      const base = existing ?? newWorkspace(getActiveVaultId())
      const ws: Workspace = {
        ...base,
        name: name.trim(),
        icon: icon || '📁',
        color,
        description: description.trim(),
        updatedAt: Date.now(),
      }
      await saveWorkspace(ws)
      if (!editing && template.collections.length) {
        for (const c of template.collections) {
          await saveCollection(newCollection(ws.id, c))
        }
      }
      onSaved?.(ws)
      onClose()
    } catch (err) {
      toast.error('Could not save workspace: ' + String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.modalTitle}>{editing ? 'Edit workspace' : 'New workspace'}</h2>

        {!editing && (
          <div className={styles.field}>
            <span className={styles.fieldLabel}>Template</span>
            <div className={styles.templateGrid}>
              {TEMPLATES.map((t) => (
                <button
                  key={t.key}
                  className={styles.templateBtn}
                  style={t.key === template.key ? { borderColor: 'var(--accent)' } : undefined}
                  onClick={() => applyTemplate(t)}
                >
                  {t.icon} {t.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className={styles.row}>
          <div className={styles.field} style={{ flex: '0 0 auto' }}>
            <span className={styles.fieldLabel}>Icon</span>
            <input
              className={`${styles.input} ${styles.iconInput}`}
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              maxLength={4}
              aria-label="Icon"
            />
          </div>
          <div className={styles.field} style={{ flex: 1 }}>
            <span className={styles.fieldLabel}>Name</span>
            <input
              className={styles.input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. AI Research"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleSave()
              }}
            />
          </div>
        </div>

        <div className={styles.field}>
          <span className={styles.fieldLabel}>Color</span>
          <div className={styles.colorRow}>
            <button
              className={`${styles.swatch} ${!color ? styles.swatchOn : ''}`}
              style={{ background: 'var(--surface-3)' }}
              onClick={() => setColor(undefined)}
              title="Auto"
              aria-label="Auto color"
            />
            {PALETTE.map((c) => (
              <button
                key={c}
                className={`${styles.swatch} ${color === c ? styles.swatchOn : ''}`}
                style={{ background: c }}
                onClick={() => setColor(c)}
                aria-label={`Color ${c}`}
              />
            ))}
          </div>
        </div>

        <div className={styles.field}>
          <span className={styles.fieldLabel}>Description</span>
          <textarea
            className={styles.textarea}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What's this workspace for?"
          />
        </div>

        <div className={styles.modalActions}>
          <button className={styles.cancelBtn} onClick={onClose}>
            Cancel
          </button>
          <button className={styles.primaryBtn} onClick={handleSave} disabled={!name.trim() || saving}>
            {saving ? 'Saving…' : editing ? 'Save' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}
