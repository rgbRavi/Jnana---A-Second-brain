import { useState } from 'react'
import type { AiConfig, AnalysisResult, AnalyzeInput, Note } from '../../types'
import { analyze, timeWindow } from '../../core/ai'
import styles from './Ai.module.css'

interface Props {
  config: AiConfig
  notes: Note[]
  onOpenNote: (noteId: string) => void
}

type Mode = 'topic' | 'time'

export function ThreadAnalyzer({ config, notes, onOpenNote }: Props) {
  const [mode, setMode] = useState<Mode>('topic')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<AnalysisResult | null>(null)

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

  return (
    <div className={styles.panel}>
      <div className={styles.modeRow}>
        <button
          className={`${styles.btn} ${mode === 'topic' ? styles.btnActive : ''}`}
          onClick={() => setMode('topic')}
        >
          By topic
        </button>
        <button
          className={`${styles.btn} ${mode === 'time' ? styles.btnActive : ''}`}
          onClick={() => setMode('time')}
        >
          By time
        </button>
      </div>

      {mode === 'topic' ? (
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
      ) : (
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
      )}

      {loading && <p className={styles.spinner}>Analyzing your notes…</p>}
      {error && <p className={styles.error}>{error}</p>}

      {result && !loading && <AnalysisView result={result} onOpenNote={onOpenNote} />}
    </div>
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
