import type { SearchResult } from 'minisearch'
import type { Note } from '../types'
import { useSearch } from '../hooks/useSearch'

type SearchDocResult = SearchResult & {
  title?: string
  content?: string
  tags?: string
  updatedAt?: number
}

interface SearchDocsProps {
  notes: Note[]
  onOpenNote?: (noteId: string) => void
  placeholder?: string
}

function makePreview(content: string | undefined, limit: number = 180): string {
  if (!content) return 'No preview available.'

  const plain = content
    .replace(/!\[[^\]]*\]\((.*?)\)/g, ' ')
    .replace(/\[([^\]]+)\]\((.*?)\)/g, '$1')
    .replace(/\[\[(.*?)\]\]/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()

  if (!plain) return 'No preview available.'
  return plain.length > limit ? `${plain.slice(0, limit).trim()}...` : plain
}

function formatUpdatedAt(updatedAt?: number): string | null {
  if (!updatedAt) return null
  return new Date(updatedAt).toLocaleString()
}

export function SearchDocs({
  notes,
  onOpenNote,
  placeholder = 'Search notes, tags, and content...',
}: SearchDocsProps) {
  const { query, results, ready, search, clearSearch } = useSearch(notes)
  const typedResults = results as SearchDocResult[]

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
          background: 'var(--surface)',
        }}
      >
        <input
          type="search"
          value={query}
          onChange={(e) => search(e.target.value)}
          placeholder={placeholder}
          aria-label="Search notes"
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
            onClick={clearSearch}
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
        {!ready && 'Building search index...'}
        {ready && !query && `${notes.length} note${notes.length === 1 ? '' : 's'} indexed`}
        {ready && query && `${typedResults.length} result${typedResults.length === 1 ? '' : 's'}`}
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
        {ready && !query && (
          <p className="note-empty" style={{ padding: '1rem 0' }}>
            Start typing to search your notes.
          </p>
        )}

        {ready && query && typedResults.length === 0 && (
          <p className="note-empty" style={{ padding: '1rem 0' }}>
            No notes matched "{query}".
          </p>
        )}

        {typedResults.map((result) => {
          const updatedAt = formatUpdatedAt(result.updatedAt)
          const preview = makePreview(result.content)

          return (
            <button
              key={String(result.id)}
              type="button"
              onClick={() => onOpenNote?.(String(result.id))}
              style={{
                textAlign: 'left',
                background: 'var(--surface-2)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                padding: '0.95rem 1rem',
                cursor: onOpenNote ? 'pointer' : 'default',
                transition: 'border-color 0.15s, background 0.15s',
                color: 'inherit',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: '0.75rem',
                  marginBottom: '0.4rem',
                }}
              >
                <div
                  style={{
                    color: 'var(--text-1)',
                    fontWeight: 600,
                    fontSize: '0.92rem',
                  }}
                >
                  {result.title || 'Untitled'}
                </div>
                <div
                  style={{
                    color: 'var(--text-3)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.68rem',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {typeof result.score === 'number' ? result.score.toFixed(2) : ''}
                </div>
              </div>

              <p
                style={{
                  color: 'var(--text-2)',
                  fontSize: '0.84rem',
                  lineHeight: 1.55,
                  marginBottom: result.tags ? '0.55rem' : updatedAt ? '0.55rem' : 0,
                }}
              >
                {preview}
              </p>

              {result.tags && (
                <div
                  style={{
                    color: 'var(--accent)',
                    fontSize: '0.74rem',
                    marginBottom: updatedAt ? '0.55rem' : 0,
                  }}
                >
                  {result.tags}
                </div>
              )}

              {updatedAt && (
                <div
                  style={{
                    color: 'var(--text-3)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.68rem',
                  }}
                >
                  Updated {updatedAt}
                </div>
              )}
            </button>
          )
        })}
      </div>
    </section>
  )
}
