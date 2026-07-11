// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import type { AgentStep } from '../../core/ai'

const ICON: Record<string, string> = {
  search_notes: '🔍',
  read_note: '📖',
  recent_notes: '🕒',
  graph_neighbors: '🕸',
  create_note: '✚',
  append_to_note: '✚',
  set_note_tags: '🏷',
  link_notes: '🔗',
}

function label(step: AgentStep): string {
  const a = step.args || {}
  const hint = (a.query ?? a.note ?? a.title ?? a.from ?? '') as string
  return hint ? `${step.tool}: ${String(hint).slice(0, 48)}` : step.tool
}

/** The agent's trace: the model's reasoning for each round, then the tool it ran. */
export function AgentSteps({ steps }: { steps: AgentStep[] }) {
  if (!steps.length) return null
  let lastThought = ''
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '0.5rem', width: '100%' }}>
      {steps.map((s, i) => {
        const thought = s.thought?.trim() ?? ''
        const showThought = thought !== '' && thought !== lastThought
        if (thought) lastThought = thought
        return (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            {showThought && (
              <div
                style={{
                  fontSize: '0.78rem',
                  color: 'var(--text-2)',
                  lineHeight: 1.45,
                  whiteSpace: 'pre-wrap',
                  borderLeft: '2px solid var(--accent)',
                  paddingLeft: '0.6rem',
                }}
              >
                {thought}
              </div>
            )}
            <span
              title={s.result.slice(0, 400)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                alignSelf: 'flex-start',
                background: 'var(--surface-2)',
                border: '1px solid var(--border)',
                borderRadius: '999px',
                padding: '0.15rem 0.6rem',
                fontSize: '0.7rem',
                color: 'var(--text-3)',
                maxWidth: '320px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              <span aria-hidden>{ICON[s.tool] ?? '•'}</span>
              {label(s)}
            </span>
          </div>
        )
      })}
    </div>
  )
}
