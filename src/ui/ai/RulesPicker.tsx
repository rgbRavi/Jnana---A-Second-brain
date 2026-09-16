// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project
import { useEffect, useState } from 'react'
import { ScrollText, Plus, Trash2, Star } from 'lucide-react'
import type { AiRule } from '../../types'
import { saveRule, deleteRule, newRule, ensureDefaultRules } from '../../core/aiRules'
import { toast } from '../../lib/toast'
import styles from './Ai.module.css'

/**
 * The rules list + add-row, with no trigger of its own — reused both by the
 * standalone {@link RulesPicker} pill (Projects view) and by the composer's
 * Capabilities menu.
 */
export function RulesBody({
  vaultId,
  selectedIds,
  onSelectedIds,
}: {
  vaultId: string
  selectedIds: string[]
  onSelectedIds: (ids: string[]) => void
}) {
  const [rules, setRules] = useState<AiRule[]>([])
  const [draft, setDraft] = useState('')
  const [draftCritical, setDraftCritical] = useState(false)

  const refresh = () => ensureDefaultRules(vaultId).then(setRules).catch(() => setRules([]))
  useEffect(() => {
    void refresh()
  }, [vaultId])

  const toggle = (id: string) =>
    onSelectedIds(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id])

  const addRule = async () => {
    const text = draft.trim()
    if (!text) return
    const rule = { ...newRule(vaultId), text, critical: draftCritical, name: text.slice(0, 30) }
    try {
      await saveRule(rule)
      setDraft('')
      setDraftCritical(false)
      await refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    }
  }

  const remove = async (id: string) => {
    try {
      await deleteRule(id)
      onSelectedIds(selectedIds.filter((x) => x !== id))
      await refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <>
      {rules.length === 0 ? (
        <p className={styles.pickerEmpty}>No rules yet.</p>
      ) : (
        rules.map((rule) => (
          <label key={rule.id} className={styles.cCheck}>
            <input type="checkbox" checked={selectedIds.includes(rule.id)} onChange={() => toggle(rule.id)} />
            <span style={{ flex: 1, minWidth: 0 }}>
              {rule.critical && <Star size={11} fill="var(--star)" color="var(--star)" style={{ marginRight: 4, verticalAlign: 'middle' }} />}
              {rule.text}
            </span>
            <button type="button" className={styles.cIconBtn} onClick={(e) => { e.preventDefault(); void remove(rule.id) }} title="Delete rule">
              <Trash2 size={13} />
            </button>
          </label>
        ))
      )}
      <div className={styles.cDivider} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 0.2rem' }}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void addRule()}
          placeholder="Add a rule…"
          className={styles.cField}
          style={{ flex: 1 }}
        />
        <button type="button" className={styles.cIconBtn} onClick={() => setDraftCritical((c) => !c)} title="Critical (always kept)">
          <Star size={14} fill={draftCritical ? 'var(--star)' : 'none'} color="var(--star)" />
        </button>
        <button type="button" className={styles.cIconBtn} onClick={() => void addRule()} title="Add rule" style={{ color: 'var(--accent)' }}>
          <Plus size={16} />
        </button>
      </div>
    </>
  )
}

/** Standalone pill + upward popup (used by the Projects view). */
export function RulesPicker({
  vaultId,
  selectedIds,
  onSelectedIds,
}: {
  vaultId: string
  selectedIds: string[]
  onSelectedIds: (ids: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const activeCount = selectedIds.length

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Rules"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', color: 'var(--text-2)', cursor: 'pointer' }}
      >
        <ScrollText size={15} /> Rules{activeCount ? ` (${activeCount})` : ''}
      </button>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 44 }} onClick={() => setOpen(false)} />
          <div
            style={{
              position: 'absolute', bottom: '100%', left: 0, marginBottom: 6, zIndex: 45, width: 320,
              maxHeight: 340, overflowY: 'auto', background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)', padding: 8, boxShadow: 'var(--shadow-lg)',
            }}
          >
            <RulesBody vaultId={vaultId} selectedIds={selectedIds} onSelectedIds={onSelectedIds} />
          </div>
        </>
      )}
    </div>
  )
}
