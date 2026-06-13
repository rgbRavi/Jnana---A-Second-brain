import { useMemo, useState } from 'react'
import type { AiConfig, AnalysisResult, AnalyzeInput, Note, QuizQuestion, SourceNote } from '../../types'
import { analyze, askNotes, generateQuiz, type AskTurn } from '../../core/ai'
import styles from './Ai.module.css'

interface Props {
  config: AiConfig
  notes: Note[]
  onOpenNote: (noteId: string) => void
}

type ScopeKind = 'topic' | 'time' | 'note'
type ResponseMode = 'analyze' | 'chat' | 'quiz'

/** One entry in the unified chat thread. */
type ChatMessage =
  | { kind: 'question'; text: string }
  | { kind: 'answer'; text: string; sources: SourceNote[] }
  | { kind: 'analysis'; result: AnalysisResult }
  | { kind: 'quiz'; questions: QuizQuestion[] }

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

/** Build a window AnalyzeInput from two yyyy-mm-dd strings (order-independent). */
function buildTimeScope(fromStr: string, toStr: string): AnalyzeInput {
  const [lo, hi] = startOfDay(fromStr) <= startOfDay(toStr) ? [fromStr, toStr] : [toStr, fromStr]
  const since = startOfDay(lo)
  const until = endOfDay(hi)
  return {
    mode: 'window',
    since,
    until,
    label: lo === hi ? fmtDate(since) : `${fmtDate(since)} – ${fmtDate(until)}`,
  }
}

/** A stable identity for a scope, so the thread resets only when scope changes. */
function scopeKey(s: AnalyzeInput): string {
  if (s.mode === 'topic') return `topic:${s.query.trim().toLowerCase()}`
  if (s.mode === 'note') return `note:${s.noteId}`
  return `time:${s.since}-${s.until}`
}

/** A scope directive parsed from an inline /@ command. */
type Directive =
  | { kind: 'topic'; phrase: string }
  | { kind: 'time'; from: string; to: string }
  | { kind: 'note'; note: Note }

/**
 * Parse a leading scope command out of the composer text, for quick typers.
 *   /today /yesterday /week   → time window
 *   /topic <phrase>           → topic (whole remainder is the phrase)
 *   @<note title>             → note (longest title prefix match)
 * Returns the directive (if any) and the residual text (the question).
 */
function parseScope(text: string, notes: Note[]): { directive: Directive | null; rest: string } {
  const t = text.trimStart()

  const win = t.match(/^\/(today|yesterday|week)\b\s*/i)
  if (win) {
    const today = new Date()
    const kind = win[1].toLowerCase()
    const rest = t.slice(win[0].length)
    if (kind === 'today') return { directive: { kind: 'time', from: toInputDate(today), to: toInputDate(today) }, rest }
    if (kind === 'yesterday') {
      const y = toInputDate(new Date(today.getTime() - DAY))
      return { directive: { kind: 'time', from: y, to: y }, rest }
    }
    return {
      directive: { kind: 'time', from: toInputDate(new Date(today.getTime() - 6 * DAY)), to: toInputDate(today) },
      rest,
    }
  }

  const topic = t.match(/^\/topic\b\s*/i)
  if (topic) {
    const phrase = t.slice(topic[0].length).trim()
    return { directive: phrase ? { kind: 'topic', phrase } : null, rest: '' }
  }

  if (t.startsWith('@')) {
    const after = t.slice(1)
    const lower = after.toLowerCase()
    let best: Note | null = null
    for (const n of notes) {
      const title = (n.title ?? '').trim()
      if (title && lower.startsWith(title.toLowerCase())) {
        if (!best || title.length > (best.title ?? '').trim().length) best = n
      }
    }
    if (best) {
      const rest = after.slice((best.title ?? '').trim().length).trim()
      return { directive: { kind: 'note', note: best }, rest }
    }
    return { directive: null, rest: text } // unmatched @ — caller hints
  }

  return { directive: null, rest: text }
}

/** Pair up question→answer messages into the history askNotes expects. */
function toHistory(msgs: ChatMessage[]): AskTurn[] {
  const turns: AskTurn[] = []
  for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i]
    const next = msgs[i + 1]
    if (m.kind === 'question' && next && next.kind === 'answer') {
      turns.push({ question: m.text, answer: next.text })
    }
  }
  return turns
}

export function AiChat({ config, notes, onOpenNote }: Props) {
  const [scopeKind, setScopeKind] = useState<ScopeKind>('topic')
  const [responseMode, setResponseMode] = useState<ResponseMode>('analyze')

  // Per-kind scope inputs.
  const [topicPhrase, setTopicPhrase] = useState('')
  const [selectedNote, setSelectedNote] = useState<Note | null>(null)
  const today = toInputDate(new Date())
  const [fromStr, setFromStr] = useState(() => toInputDate(new Date(Date.now() - 6 * DAY)))
  const [toStr, setToStr] = useState(today)

  // Conversation.
  const [thread, setThread] = useState<ChatMessage[]>([])
  const [lastScopeKey, setLastScopeKey] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const rangeDays = useMemo(() => {
    const diff = Math.round((startOfDay(toStr) - startOfDay(fromStr)) / DAY) + 1
    return Math.min(MAX_RANGE_DAYS, Math.max(1, diff || 1))
  }, [fromStr, toStr])

  const timeNoteCount = useMemo(() => {
    if (scopeKind !== 'time') return 0
    const since = startOfDay(fromStr <= toStr ? fromStr : toStr)
    const until = endOfDay(fromStr <= toStr ? toStr : fromStr)
    return notes.filter((n) => {
      const t = n.updatedAt ?? n.createdAt
      return t >= since && t <= until
    }).length
  }, [notes, scopeKind, fromStr, toStr])

  /** Effective scope from the current scope-bar state (null if incomplete). */
  const buildScope = (): AnalyzeInput | null => {
    if (scopeKind === 'topic') return topicPhrase.trim() ? { mode: 'topic', query: topicPhrase.trim() } : null
    if (scopeKind === 'note') return selectedNote ? { mode: 'note', noteId: selectedNote.id } : null
    return buildTimeScope(fromStr, toStr)
  }

  const setRangeFromSlider = (days: number) => {
    const now = new Date()
    setToStr(toInputDate(now))
    setFromStr(toInputDate(new Date(now.getTime() - (days - 1) * DAY)))
  }

  const switchScope = (kind: ScopeKind) => {
    setScopeKind(kind)
    setThread([])
    setLastScopeKey(null)
    setError(null)
  }

  const applyDirective = (d: Directive) => {
    if (d.kind === 'topic') {
      setScopeKind('topic')
      setTopicPhrase(d.phrase)
    } else if (d.kind === 'note') {
      setScopeKind('note')
      setSelectedNote(d.note)
    } else {
      setScopeKind('time')
      setFromStr(d.from)
      setToStr(d.to)
    }
  }

  const directiveToScope = (d: Directive): AnalyzeInput => {
    if (d.kind === 'topic') return { mode: 'topic', query: d.phrase }
    if (d.kind === 'note') return { mode: 'note', noteId: d.note.id }
    return buildTimeScope(d.from, d.to)
  }

  const scopeHint = (): string => {
    if (scopeKind === 'topic') return 'Enter a topic above (or type "/topic …") to ground the analysis.'
    if (scopeKind === 'note') return 'Pick a note above (or type "@NoteTitle") to analyze.'
    return 'No notes in that time range.'
  }

  const send = async () => {
    if (busy) return

    const { directive, rest } = parseScope(input, notes)
    if (directive) applyDirective(directive)

    // Unmatched @mention — the user clearly meant a note we couldn't resolve.
    if (!directive && input.trimStart().startsWith('@')) {
      setError('No note title matches that @mention — try the Note scope picker.')
      return
    }

    const scope = directive ? directiveToScope(directive) : buildScope()
    if (!scope) {
      setError(scopeHint())
      return
    }

    const key = scopeKey(scope)
    const base = key !== lastScopeKey ? [] : thread
    const question = rest.trim()
    setError(null)

    if (responseMode === 'analyze') {
      setBusy(true)
      setThread(base)
      setLastScopeKey(key)
      try {
        const result = await analyze(scope, config, notes)
        setThread([...base, { kind: 'analysis', result }])
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Analysis failed.')
      } finally {
        setBusy(false)
        setInput('')
      }
      return
    }

    if (responseMode === 'quiz') {
      setBusy(true)
      setThread(base)
      setLastScopeKey(key)
      try {
        const questions = await generateQuiz(scope, config, notes)
        setThread([...base, { kind: 'quiz', questions }])
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Quiz generation failed.')
      } finally {
        setBusy(false)
        setInput('')
      }
      return
    }

    // Chat mode needs a question once scope commands are stripped.
    if (!question) {
      setError('Type a question to ask about this scope.')
      return
    }

    const withQuestion: ChatMessage[] = [...base, { kind: 'question', text: question }]
    setThread(withQuestion)
    setLastScopeKey(key)
    setInput('')
    setBusy(true)
    try {
      const res = await askNotes(scope, question, toHistory(base), config, notes)
      setThread((prev) => [...prev, { kind: 'answer', text: res.answer, sources: res.sourceNotes }])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Question failed.')
    } finally {
      setBusy(false)
    }
  }

  if (!config.enabled) {
    return (
      <div className={styles.panel}>
        <p className={styles.disabledNote}>
          AI is disabled. Open <strong>AI Quick Settings</strong> (top right), enable it, and
          index your notes to use the analyzer.
        </p>
      </div>
    )
  }

  const sendDisabled =
    busy || (responseMode === 'chat' ? !input.trim() : !(input.trim() || buildScope()))

  return (
    <div className={styles.panel}>
      {/* ── Scope bar ── */}
      <div className={styles.scopeBar}>
        <div className={styles.scopeChips}>
          <span className={styles.scopeLabel}>Scope</span>
          {(
            [
              ['topic', 'Topic'],
              ['time', 'Time'],
              ['note', 'Note'],
            ] as [ScopeKind, string][]
          ).map(([k, label]) => (
            <button
              key={k}
              className={`${styles.btn} ${scopeKind === k ? styles.btnActive : ''}`}
              onClick={() => switchScope(k)}
            >
              {label}
            </button>
          ))}
        </div>

        {scopeKind === 'topic' && (
          <input
            className={styles.input}
            placeholder="Topic to ground on… (e.g. neural networks)"
            value={topicPhrase}
            onChange={(e) => setTopicPhrase(e.target.value)}
          />
        )}

        {scopeKind === 'time' && (
          <>
            <div className={styles.windowRow}>
              <button className={styles.btn} onClick={() => { setFromStr(today); setToStr(today) }}>
                Today
              </button>
              <button
                className={styles.btn}
                onClick={() => {
                  const y = toInputDate(new Date(Date.now() - DAY))
                  setFromStr(y)
                  setToStr(y)
                }}
              >
                Yesterday
              </button>
              <button className={styles.btn} onClick={() => setRangeFromSlider(7)}>
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
              <span className={styles.scopeSummary}>· {timeNoteCount} notes</span>
            </div>
          </>
        )}

        {scopeKind === 'note' && (
          <NotePicker notes={notes} selected={selectedNote} onSelect={setSelectedNote} />
        )}
      </div>

      {/* ── Thread ── */}
      {thread.length > 0 && (
        <div className={styles.thread}>
          {thread.map((m, i) =>
            m.kind === 'analysis' ? (
              <AnalysisCard key={i} result={m.result} onOpenNote={onOpenNote} />
            ) : m.kind === 'quiz' ? (
              <QuizCard key={i} questions={m.questions} />
            ) : m.kind === 'question' ? (
              <p key={i} className={styles.chatQ}>
                {m.text}
              </p>
            ) : (
              <div key={i} className={styles.answerBlock}>
                <p className={styles.chatA}>{m.text}</p>
                {m.sources.length > 0 && (
                  <div className={styles.sources}>
                    {m.sources.map((s) => (
                      <button key={s.noteId} className={styles.sourceChip} onClick={() => onOpenNote(s.noteId)}>
                        {s.title}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ),
          )}
        </div>
      )}

      {busy && (
        <p className={styles.spinner}>
          {responseMode === 'analyze'
            ? 'Analyzing your notes…'
            : responseMode === 'quiz'
              ? 'Building your quiz…'
              : 'Thinking…'}
        </p>
      )}
      {error && <p className={styles.error}>{error}</p>}

      {/* ── Mode toggle + composer ── */}
      <div className={styles.modeToggle}>
        <span className={styles.scopeLabel}>Mode</span>
        <button
          className={`${styles.btn} ${responseMode === 'analyze' ? styles.btnActive : ''}`}
          onClick={() => setResponseMode('analyze')}
        >
          Analyze
        </button>
        <button
          className={`${styles.btn} ${responseMode === 'chat' ? styles.btnActive : ''}`}
          onClick={() => setResponseMode('chat')}
        >
          Chat
        </button>
        <button
          className={`${styles.btn} ${responseMode === 'quiz' ? styles.btnActive : ''}`}
          onClick={() => setResponseMode('quiz')}
        >
          Quiz
        </button>
      </div>

      <div className={styles.chatInputRow}>
        <textarea
          className={styles.chatInput}
          rows={2}
          placeholder={
            responseMode === 'chat'
              ? 'Ask a question about this scope… (try /today, /week, @NoteTitle · Enter to send)'
              : responseMode === 'quiz'
                ? 'Set scope above and press Quiz me — or type /today, /week, @NoteTitle to scope quickly.'
                : 'Set scope above and press Analyze — or type /today, /week, @NoteTitle to scope quickly.'
          }
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              if (!sendDisabled) void send()
            }
          }}
        />
        <button className={styles.btnPrimary} disabled={sendDisabled} onClick={() => void send()}>
          {responseMode === 'analyze' ? 'Analyze' : responseMode === 'quiz' ? 'Quiz me' : 'Send'}
        </button>
      </div>
    </div>
  )
}

/**
 * Searchable note dropdown: filter by title, newest first, hover to preview
 * the content. Selection only — the parent decides what to do with it.
 */
function NotePicker({
  notes,
  selected,
  onSelect,
}: {
  notes: Note[]
  selected: Note | null
  onSelect: (note: Note) => void
}) {
  const [search, setSearch] = useState(selected?.title?.trim() ?? '')
  const [open, setOpen] = useState(false)
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return notes
      .filter((n) => !q || (n.title ?? '').toLowerCase().includes(q))
      .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
      .slice(0, 50)
  }, [notes, search])

  const previewNote = filtered.find((n) => n.id === hoveredId) ?? selected ?? filtered[0] ?? null

  const choose = (note: Note) => {
    onSelect(note)
    setSearch(note.title?.trim() || 'Untitled')
    setOpen(false)
  }

  return (
    <div className={styles.picker}>
      <input
        className={styles.input}
        placeholder="Search notes by title…"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      />

      {open && (
        // preventDefault keeps the input focused so onBlur doesn't close the
        // dropdown before a click on an item lands.
        <div className={styles.pickerDropdown} onMouseDown={(e) => e.preventDefault()}>
          <div className={styles.pickerList} onMouseLeave={() => setHoveredId(null)}>
            {filtered.length === 0 && <p className={styles.pickerEmpty}>No notes match.</p>}
            {filtered.map((n) => (
              <div
                key={n.id}
                className={`${styles.pickerItem} ${selected?.id === n.id ? styles.pickerItemActive : ''}`}
                onMouseEnter={() => setHoveredId(n.id)}
                onClick={() => choose(n)}
              >
                <span className={styles.pickerItemTitle}>{n.title?.trim() || 'Untitled'}</span>
                <span className={styles.pickerItemMeta}>{fmtDateTime(n.updatedAt)}</span>
              </div>
            ))}
          </div>

          {previewNote && (
            <div className={styles.pickerPreview}>
              <span className={styles.previewTitle}>{previewNote.title?.trim() || 'Untitled'}</span>
              <span className={styles.previewMeta}>updated {fmtDateTime(previewNote.updatedAt)}</span>
              <p className={styles.previewBody}>
                {previewNote.content.trim() ? previewNote.content.trim().slice(0, 600) : '(empty note)'}
                {previewNote.content.trim().length > 600 ? '…' : ''}
              </p>
            </div>
          )}
        </div>
      )}
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

function AnalysisCard({
  result,
  onOpenNote,
}: {
  result: AnalysisResult
  onOpenNote: (noteId: string) => void
}) {
  return (
    <div className={styles.analysisCard}>
      {result.summary && <p className={styles.summary}>{result.summary}</p>}
      <Section title="Key concepts" items={result.keyConcepts} />
      <Section title="Open questions" items={result.openQuestions} />
      <Section title="Weak spots" items={result.weakSpots} />

      {result.sourceNotes.length > 0 && (
        <div className={styles.section}>
          <span className={styles.sectionTitle}>Source notes</span>
          <div className={styles.sources}>
            {result.sourceNotes.map((s) => (
              <button key={s.noteId} className={styles.sourceChip} onClick={() => onOpenNote(s.noteId)}>
                {s.title}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/** A generated quiz — each question reveals its answer + explanation on click. */
function QuizCard({ questions }: { questions: QuizQuestion[] }) {
  const [revealed, setRevealed] = useState<Set<number>>(new Set())
  const toggle = (i: number) =>
    setRevealed((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })

  if (questions.length === 0) {
    return <p className={styles.hint}>Not enough in these notes to build a quiz.</p>
  }

  return (
    <div className={styles.analysisCard}>
      <span className={styles.sectionTitle}>Quiz · {questions.length} questions</span>
      {questions.map((q, i) => (
        <div key={i} className={styles.quizItem}>
          <p className={styles.quizQ}>
            <span className={styles.quizKind}>{q.kind}</span>
            {i + 1}. {q.question}
          </p>
          <button className={styles.quizReveal} onClick={() => toggle(i)}>
            {revealed.has(i) ? 'Hide answer' : 'Show answer'}
          </button>
          {revealed.has(i) && (
            <div className={styles.quizAnswer}>
              <p className={styles.quizA}>{q.answer}</p>
              {q.explanation && <p className={styles.quizExpl}>{q.explanation}</p>}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
