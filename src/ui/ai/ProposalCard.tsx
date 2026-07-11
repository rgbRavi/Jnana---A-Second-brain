// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import type { ProposedAction } from '../../core/ai'

const KIND_ICON: Record<ProposedAction['kind'], string> = {
  create: '✚',
  append: '✎',
  tags: '🏷',
  link: '🔗',
}

/** A proposed vault change with Apply / Skip — the propose-then-confirm gate. */
export function ProposalCard({
  action,
  applied,
  skipped,
  onApply,
  onSkip,
}: {
  action: ProposedAction
  applied: boolean
  skipped: boolean
  onApply: () => void
  onSkip: () => void
}) {
  const done = applied || skipped
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        border: '1px solid ' + (applied ? 'var(--accent)' : 'var(--border)'),
        borderRadius: 'var(--radius-sm)',
        padding: '0.5rem 0.65rem',
        background: 'var(--surface-2)',
        opacity: skipped ? 0.55 : 1,
      }}
    >
      <span aria-hidden>{KIND_ICON[action.kind]}</span>
      <span style={{ flex: 1, minWidth: 0, fontSize: '0.82rem', color: 'var(--text-1)' }}>{action.summary}</span>
      {done ? (
        <span style={{ fontSize: '0.74rem', color: applied ? 'var(--accent)' : 'var(--text-3)' }}>
          {applied ? '✓ Applied' : 'Skipped'}
        </span>
      ) : (
        <>
          <button
            onClick={onApply}
            style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', padding: '0.25rem 0.7rem', fontSize: '0.76rem', cursor: 'pointer' }}
          >
            Apply
          </button>
          <button
            onClick={onSkip}
            style={{ background: 'transparent', color: 'var(--text-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '0.25rem 0.6rem', fontSize: '0.76rem', cursor: 'pointer' }}
          >
            Skip
          </button>
        </>
      )}
    </div>
  )
}
