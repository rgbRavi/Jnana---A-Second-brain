// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import type { Note } from '../../types'
import { useSemanticSearch } from '../../hooks/useSemanticSearch'
import type { SemanticResult } from '../../core/ai/searchResults'

interface AiSearchDocsProps {
  notes: Note[]
  onOpenNote?: (noteId: string) => void
}

export function AiSearchDocs({ notes, onOpenNote }: AiSearchDocsProps) {
  const { query, setQuery, results, status, available } = useSemanticSearch(notes)

  return (
    <section
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '0.9rem 1.25rem',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          gap: '0.75rem',
          alignItems: 'center',
        }}
      >
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ask in plain language — e.g. the note about spaced repetition"
          aria-label="AI search"
          disabled={!available}
          style={{
            flex: 1,
            background: 'transparent',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--text-1)',
            padding: '0.7rem 0.85rem',
            fontFamily: 'var(--font-body)',
            fontSize: '0.9rem',
            outline: 'none',
          }}
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            style={{
              background: 'transparent',
              color: 'var(--text-2)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              padding: '0.65rem 0.9rem',
              cursor: 'pointer',
              fontFamily: 'var(--font-body)',
              fontSize: '0.82rem',
            }}
          >
            Clear
          </button>
        )}
      </div>

      <div
        style={{
          padding: '0.8rem 1.25rem',
          borderBottom: query ? '1px solid var(--border)' : 'none',
          color: 'var(--text-3)',
          fontSize: '0.72rem',
          fontFamily: 'var(--font-mono)',
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
        }}
      >
        {!available && 'AI search unavailable — enable an AI provider and index notes in Settings → AI Providers'}
        {available && status === 'searching' && 'Searching…'}
        {available && status === 'done' && `${results.length} result${results.length === 1 ? '' : 's'}`}
        {available && status === 'idle' && 'Type a question to search by meaning'}
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
          padding: '1rem 1.25rem 1.25rem',
          maxHeight: '420px',
          overflowY: 'auto',
        }}
      >
        {available && status === 'done' && results.length === 0 && (
          <p className="note-empty" style={{ padding: '1rem 0' }}>
            No notes matched "{query}".
          </p>
        )}

        {results.map((r: SemanticResult) => (
          <button
            key={r.note.id}
            type="button"
            onClick={() => onOpenNote?.(r.note.id)}
            style={{
              textAlign: 'left',
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              padding: '0.95rem 1rem',
              cursor: onOpenNote ? 'pointer' : 'default',
              color: 'inherit',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: '0.75rem',
                marginBottom: '0.4rem',
              }}
            >
              <div style={{ color: 'var(--text-1)', fontWeight: 600, fontSize: '0.92rem' }}>
                {r.note.title || 'Untitled'}
              </div>
              <div
                style={{
                  color: 'var(--text-3)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.68rem',
                  whiteSpace: 'nowrap',
                }}
              >
                {r.score.toFixed(2)}
              </div>
            </div>
            <p style={{ color: 'var(--text-2)', fontSize: '0.84rem', lineHeight: 1.55 }}>
              {r.snippet.length > 180 ? `${r.snippet.slice(0, 180).trim()}…` : r.snippet}
            </p>
          </button>
        ))}
      </div>
    </section>
  )
}
