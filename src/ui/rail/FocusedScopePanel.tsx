// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// The right-rail panel that configures a grounded ("Focused") action's scope —
// the docked replacement for the old floating flyout. It reads/writes the shared
// `ai.free.focus` view-state (same store the composer uses) and arms focused mode
// on confirm. Availability is gated by lib/activeFocus (openFocusPanel).

import { useEffect, useMemo, useState } from 'react'
import { Hash, CalendarRange, NotebookPen } from 'lucide-react'
import type { Note } from '../../types'
import { toInputDate, emptyFocus, type FocusState, type ScopeKind } from '../../core/ai/focusedScope'
import { useViewState } from '../../hooks/useViewState'
import { useActiveVaultId } from '../../hooks/useVaults'
import { useNotesContext } from '../../context/NotesContext'
import { closeFocusPanel } from '../../lib/activeFocus'
import { actionMeta } from '../ai/FocusedMenu'
import { MenuRow } from '../ai/ComposerMenu'
import { QuizSettingsBody } from '../ai/QuizControls'
import styles from '../ai/Ai.module.css'

const DAY = 24 * 60 * 60 * 1000

export function FocusedScopePanel() {
  const [focus, setFocus] = useViewState<FocusState>('ai.free.focus', emptyFocus)
  const { notes } = useNotesContext()
  const vaultId = useActiveVaultId()
  const action = focus.action

  // Disarmed elsewhere (chip ✕) — collapse the panel.
  useEffect(() => {
    if (!action) closeFocusPanel()
  }, [action])

  if (!action) return null
  const patch = (p: Partial<FocusState>) => setFocus((f) => ({ ...f, ...p }))

  return (
    <div className={styles.focusPanel}>
      <div className={styles.focusHeader}>
        {actionMeta[action].icon}
        <span className={styles.cRowLabel}>
          {actionMeta[action].label}
          <small>{actionMeta[action].hint}</small>
        </span>
      </div>

      <div>
        <div className={styles.cSectionLabel}>Scope</div>
        <ScopeKindTabs value={focus.scopeKind} onChange={(k) => patch({ scopeKind: k })} />
      </div>

      {focus.scopeKind === 'topic' && (
        <input
          autoFocus
          className={styles.cField}
          placeholder="Topic to ground on… (e.g. neural networks)"
          value={focus.topicPhrase}
          onChange={(e) => patch({ topicPhrase: e.target.value })}
        />
      )}
      {focus.scopeKind === 'time' && <TimeScope focus={focus} patch={patch} />}
      {focus.scopeKind === 'note' && (
        <NoteScope
          notes={notes}
          selectedId={focus.selectedNoteId}
          onPick={(n) => patch({ selectedNoteId: n.id, selectedNoteTitle: n.title?.trim() || 'Untitled' })}
        />
      )}

      {action === 'quiz' && (
        <div className={styles.focusQuiz}>
          <span className={styles.cSectionLabel} style={{ padding: 0 }}>Quiz settings</span>
          <QuizSettingsBody vaultId={vaultId} />
        </div>
      )}

      <p className={styles.focusHint}>Press <strong>{action === 'ask' ? 'Send' : actionMeta[action].label}</strong> in the composer to run this.</p>
    </div>
  )
}

function ScopeKindTabs({ value, onChange }: { value: ScopeKind; onChange: (k: ScopeKind) => void }) {
  const tabs: [ScopeKind, string, React.ReactNode][] = [
    ['topic', 'Topic', <Hash size={13} key="t" />],
    ['time', 'Time', <CalendarRange size={13} key="w" />],
    ['note', 'Note', <NotebookPen size={13} key="n" />],
  ]
  return (
    <div className={styles.cSeg}>
      {tabs.map(([k, label, icon]) => (
        <button
          key={k}
          type="button"
          className={`${styles.cSegBtn} ${value === k ? styles.cSegBtnActive : ''}`}
          onClick={() => onChange(k)}
        >
          {icon} {label}
        </button>
      ))}
    </div>
  )
}

function TimeScope({ focus, patch }: { focus: FocusState; patch: (p: Partial<FocusState>) => void }) {
  const today = toInputDate(new Date())
  const setRange = (days: number) => {
    const now = Date.now()
    patch({ toStr: toInputDate(new Date(now)), fromStr: toInputDate(new Date(now - (days - 1) * DAY)) })
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        <button type="button" className={styles.cChipBtn} onClick={() => patch({ fromStr: today, toStr: today })}>Today</button>
        <button type="button" className={styles.cChipBtn} onClick={() => { const y = toInputDate(new Date(Date.now() - DAY)); patch({ fromStr: y, toStr: y }) }}>Yesterday</button>
        <button type="button" className={styles.cChipBtn} onClick={() => setRange(7)}>Past 7 days</button>
        <button type="button" className={styles.cChipBtn} onClick={() => setRange(30)}>Past 30</button>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input type="date" className={styles.cField} value={focus.fromStr} max={today} onChange={(e) => e.target.value && patch({ fromStr: e.target.value })} style={{ flex: 1 }} />
        <span style={{ color: 'var(--text-3)', fontSize: '0.78rem' }}>to</span>
        <input type="date" className={styles.cField} value={focus.toStr} max={today} onChange={(e) => e.target.value && patch({ toStr: e.target.value })} style={{ flex: 1 }} />
      </div>
    </div>
  )
}

function NoteScope({ notes, selectedId, onPick }: { notes: Note[]; selectedId: string | null; onPick: (n: Note) => void }) {
  const [q, setQ] = useState('')
  const matches = useMemo(() => {
    const s = q.trim().toLowerCase()
    return notes
      .filter((n) => !s || (n.title ?? '').toLowerCase().includes(s))
      .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
      .slice(0, 40)
  }, [q, notes])
  return (
    <div>
      <input autoFocus className={styles.cField} placeholder="Search notes by title…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div style={{ maxHeight: 220, overflowY: 'auto', marginTop: 4 }}>
        {matches.length === 0 && <p className={styles.pickerEmpty}>No notes match.</p>}
        {matches.map((n) => (
          <MenuRow
            key={n.id}
            icon={<NotebookPen size={14} />}
            label={n.title?.trim() || 'Untitled'}
            active={selectedId === n.id}
            onClick={() => onPick(n)}
          />
        ))}
      </div>
    </div>
  )
}
