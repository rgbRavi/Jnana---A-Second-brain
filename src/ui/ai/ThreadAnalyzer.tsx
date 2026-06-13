import { useMemo, useState } from 'react'
import type { AiConfig, AnalysisResult, AnalyzeInput, Note } from '../../types'
import { analyze, timeWindow } from '../../core/ai'
import styles from './Ai.module.css'

interface Props {
  config: AiConfig
  notes: Note[]
  onOpenNote: (noteId: string) => void
}

type Mode = 'topic' | 'time' | 'note'

const DAY = 24 * 60 * 60 * 1000
const MAX_RANGE_DAYS = 90

function toInputDate(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, '0')
  const day = `${d.getDate()}`.padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

const startOfDay = (s: string) => new Date(`${s}T00:00:00`).getTime()
const endOfDay = (s: string) => new Date(`${s}T23:59:59.999`).getTime()

const fmtDate = (t: number) =>
  new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })

const fmtDateTime = (t: number) =>
  new Date(t).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

export function ThreadAnalyzer({ config, notes, onOpenNote }: Props) {
  const [mode, setMode] = useState<Mode>('topic')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<AnalysisResult | null>(null)

  // ── Time mode: a "last N days" slider kept in sync with two date pickers ──
  const today = toInputDate(new Date())
  const [fromStr, setFromStr] = useState(() => toInputDate(new Date(Date.now() - 6 * DAY)))
  const [toStr, setToStr] = useState(today)

  const rangeDays = useMemo(() => {
    const diff = Math.round((startOfDay(toStr) - startOfDay(fromStr)) / DAY) + 1
    return Math.min(MAX_RANGE_DAYS, Math.max(1, diff || 1))
  }, [fromStr, toStr])

  const setRangeFromSlider = (days: number) => {
    const now = new Date()
    setToStr(toInputDate(now))
    setFromStr(toInputDate(new Date(now.getTime() - (days - 1) * DAY)))
  }

  const runCustomRange = () => {
    // Swap if the user picked the dates backwards.
    const [lo, hi] = startOfDay(fromStr) <= startOfDay(toStr) ? [fromStr, toStr] : [toStr, fromStr]
    const since = startOfDay(lo)
    const until = endOfDay(hi)
    void run({
      mode: 'window',
      since,
      until,
      label: lo === hi ? fmtDate(since) : `${fmtDate(since)} – ${fmtDate(until)}`,
    })
  }

  const run = async (input: AnalyzeInput) => {
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      setResult(await analyze(input, config, notes))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Analysis failed.')
    } finally {
      setLoading(false)
    }
  }

  if (!config.enabled) {
    return (
      <div className={styles.panel}>
        <p className={styles.disabledNote}>
          AI is disabled. Enable it in <strong>AI settings</strong> above and index your
          notes to use the analyzer.
        </p>
      </div>
    )
  }

  return (
    <div className={styles.panel}>
      <div className={styles.modeRow}>
        {(
          [
            ['topic', 'By topic'],
            ['time', 'By time'],
            ['note', 'By note'],
          ] as [Mode, string][]
        ).map(([m, label]) => (
          <button
            key={m}
            className={`${styles.btn} ${mode === m ? styles.btnActive : ''}`}
            onClick={() => setMode(m)}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === 'topic' && (
        <div className={styles.queryRow}>
          <input
            className={styles.input}
            placeholder="What did I learn about… (e.g. neural networks)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && query.trim() && run({ mode: 'topic', query })}
          />
          <button
            className={styles.btnPrimary}
            disabled={loading || !query.trim()}
            onClick={() => run({ mode: 'topic', query })}
          >
            Analyze
          </button>
        </div>
      )}

      {mode === 'time' && (
        <>
          <div className={styles.windowRow}>
            <button className={styles.btn} disabled={loading} onClick={() => run(timeWindow('today'))}>
              Today
            </button>
            <button className={styles.btn} disabled={loading} onClick={() => run(timeWindow('yesterday'))}>
              Yesterday
            </button>
            <button className={styles.btn} disabled={loading} onClick={() => run(timeWindow('week'))}>
              Past 7 days
            </button>
          </div>

          <div className={styles.sliderRow}>
            <input
              type="range"
              className={styles.slider}
              min={1}
              max={MAX_RANGE_DAYS}
              value={rangeDays}
              onChange={(e) => setRangeFromSlider(Number(e.target.value))}
            />
            <span className={styles.sliderValue}>
              last {rangeDays} day{rangeDays > 1 ? 's' : ''}
            </span>
          </div>

          <div className={styles.dateRow}>
            <input
              type="date"
              className={`${styles.input} ${styles.dateInput}`}
              value={fromStr}
              max={today}
              onChange={(e) => e.target.value && setFromStr(e.target.value)}
            />
            <span className={styles.dateSep}>to</span>
            <input
              type="date"
              className={`${styles.input} ${styles.dateInput}`}
              value={toStr}
              max={today}
              onChange={(e) => e.target.value && setToStr(e.target.value)}
            />
            <button className={styles.btnPrimary} disabled={loading} onClick={runCustomRange}>
              Analyze range
            </button>
          </div>
        </>
      )}

      {mode === 'note' && <NotePicker notes={notes} loading={loading} onRun={run} />}

      {loading && <p className={styles.spinner}>Analyzing your notes…</p>}
      {error && <p className={styles.error}>{error}</p>}

      {result && !loading && <AnalysisView result={result} onOpenNote={onOpenNote} />}
    </div>
  )
}

/**
 * Searchable note dropdown: filter by title, newest first, hover to preview
 * the content. Analyzing a note also analyzes its linked thread.
 */
function NotePicker({
  notes,
  loading,
  onRun,
}: {
  notes: Note[]
  loading: boolean
  onRun: (input: AnalyzeInput) => void
}) {
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<Note | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return notes
      .filter((n) => !q || (n.title ?? '').toLowerCase().includes(q))
      .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
      .slice(0, 50)
  }, [notes, search])

  const previewNote =
    filtered.find((n) => n.id === hoveredId) ?? selected ?? filtered[0] ?? null

  const select = (note: Note) => {
    setSelected(note)
    setSearch(note.title?.trim() || 'Untitled')
    setOpen(false)
  }

  return (
    <>
      <div className={styles.picker}>
        <div className={styles.queryRow}>
          <input
            className={styles.input}
            placeholder="Search notes by title…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setSelected(null)
              setOpen(true)
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setOpen(false)}
          />
          <button
            className={styles.btnPrimary}
            disabled={loading || !selected}
            onClick={() => selected && onRun({ mode: 'note', noteId: selected.id })}
          >
            Analyze
          </button>
        </div>

        {open && (
          // preventDefault keeps the input focused so onBlur doesn't close the
          // dropdown before a click on an item lands.
          <div className={styles.pickerDropdown} onMouseDown={(e) => e.preventDefault()}>
            <div className={styles.pickerList} onMouseLeave={() => setHoveredId(null)}>
              {filtered.length === 0 && <p className={styles.pickerEmpty}>No notes match.</p>}
              {filtered.map((n) => (
                <div
                  key={n.id}
                  className={`${styles.pickerItem} ${
                    selected?.id === n.id ? styles.pickerItemActive : ''
                  }`}
                  onMouseEnter={() => setHoveredId(n.id)}
                  onClick={() => select(n)}
                >
                  <span className={styles.pickerItemTitle}>{n.title?.trim() || 'Untitled'}</span>
                  <span className={styles.pickerItemMeta}>{fmtDateTime(n.updatedAt)}</span>
                </div>
              ))}
            </div>

            {previewNote && (
              <div className={styles.pickerPreview}>
                <span className={styles.previewTitle}>
                  {previewNote.title?.trim() || 'Untitled'}
                </span>
                <span className={styles.previewMeta}>
                  updated {fmtDateTime(previewNote.updatedAt)}
                </span>
                <p className={styles.previewBody}>
                  {previewNote.content.trim()
                    ? previewNote.content.trim().slice(0, 600)
                    : '(empty note)'}
                  {previewNote.content.trim().length > 600 ? '…' : ''}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
      <p className={styles.hint}>
        Analyzes the selected note plus every note linked to it (its thread).
      </p>
    </>
  )
}

function Section({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null
  return (
    <div className={styles.section}>
      <span className={styles.sectionTitle}>{title}</span>
      <div className={styles.list}>
        {items.map((item, i) => (
          <span key={i} className={styles.listItem}>
            {item}
          </span>
        ))}
      </div>
    </div>
  )
}

function AnalysisView({
  result,
  onOpenNote,
}: {
  result: AnalysisResult
  onOpenNote: (noteId: string) => void
}) {
  return (
    <div className={styles.result}>
      {result.summary && <p className={styles.summary}>{result.summary}</p>}
      <Section title="Key concepts" items={result.keyConcepts} />
      <Section title="Open questions" items={result.openQuestions} />
      <Section title="Weak spots" items={result.weakSpots} />

      {result.sourceNotes.length > 0 && (
        <div className={styles.section}>
          <span className={styles.sectionTitle}>Source notes</span>
          <div className={styles.sources}>
            {result.sourceNotes.map((s) => (
              <button
                key={s.noteId}
                className={styles.sourceChip}
                onClick={() => onOpenNote(s.noteId)}
              >
                {s.title}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
