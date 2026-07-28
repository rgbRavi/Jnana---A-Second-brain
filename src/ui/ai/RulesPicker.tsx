// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project
import { useEffect, useState } from 'react'
import { ScrollText, Plus, Trash2, Star } from 'lucide-react'
import type { AiRule } from '../../types'
import { saveRule, deleteRule, newRule, ensureDefaultRules } from '../../core/aiRules'
import { toast } from '../../lib/toast'

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
  const [rules, setRules] = useState<AiRule[]>([])
  const [draft, setDraft] = useState('')
  const [draftCritical, setDraftCritical] = useState(false)

  const refresh = () => ensureDefaultRules(vaultId).then(setRules).catch(() => setRules([]))
  useEffect(() => {
    if (open) void refresh()
  }, [open, vaultId])

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
          <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setOpen(false)} />
          <div
            style={{
              position: 'absolute', bottom: '100%', left: 0, marginBottom: 6, zIndex: 50, width: 320,
              maxHeight: 340, overflowY: 'auto', background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)', padding: 8, boxShadow: 'var(--shadow-lg)',
            }}
          >
            {rules.length === 0 ? (
              <p style={{ color: 'var(--text-3)', fontSize: '0.8rem', padding: 6 }}>No rules yet.</p>
            ) : (
              rules.map((rule) => (
                <div key={rule.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 2px' }}>
                  <input type="checkbox" checked={selectedIds.includes(rule.id)} onChange={() => toggle(rule.id)} />
                  <span style={{ flex: 1, fontSize: '0.82rem', color: 'var(--text-1)' }}>
                    {rule.critical && <Star size={11} fill="var(--star)" color="var(--star)" style={{ marginRight: 4 }} />}
                    {rule.text}
                  </span>
                  <button type="button" onClick={() => void remove(rule.id)} title="Delete rule" style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer' }}>
                    <Trash2 size={13} />
                  </button>
                </div>
              ))
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void addRule()}
                placeholder="Add a rule…"
                style={{ flex: 1, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-1)', padding: '0.3rem 0.4rem', fontSize: '0.8rem' }}
              />
              <button type="button" onClick={() => setDraftCritical((c) => !c)} title="Critical (always kept)" style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <Star size={14} fill={draftCritical ? 'var(--star)' : 'none'} color="var(--star)" />
              </button>
              <button type="button" onClick={() => void addRule()} title="Add" style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer' }}>
                <Plus size={16} />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
