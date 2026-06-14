import { useMemo, useState } from 'react'
import type { ChatAttachment } from '../../core/ai'
import type { Note } from '../../types'
import styles from './Ai.module.css'

interface Props {
  value: string
  onChange: (v: string) => void
  onSend: () => void
  onStop: () => void
  busy: boolean
  attachments: ChatAttachment[]
  onAttach: () => void
  onRemoveAttachment: (id: string) => void
  onToggleThread: (id: string) => void
  /** All notes, for the "Add note" picker. */
  notes: Note[]
  onAddNote: (note: Note) => void
  think: boolean
  onThinkChange: (v: boolean) => void
  /** Model is a reasoning model — only then is the Thinking toggle meaningful. */
  canThink: boolean
  deepResearch: boolean
  onDeepResearchChange: (v: boolean) => void
  agent: boolean
  onAgentChange: (v: boolean) => void
  /** Model supports vision — used only for the attach tooltip. */
  vision: boolean
  /** Style/Skills controls, injected by the parent (which owns preset state). */
  presetControls?: React.ReactNode
  disabled?: boolean
}

const kindIcon: Record<ChatAttachment['kind'], string> = {
  image: '🖼',
  document: '📄',
  audio: '🎵',
  note: '📝',
  other: '📎',
}

const pill = (active: boolean): React.CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '5px',
  background: active ? 'rgba(124, 106, 247, 0.15)' : 'var(--surface-2)',
  color: active ? 'var(--accent)' : 'var(--text-2)',
  border: '1px solid ' + (active ? 'var(--accent)' : 'var(--border)'),
  borderRadius: '999px',
  padding: '0.3rem 0.7rem',
  fontSize: '0.78rem',
  cursor: 'pointer',
})

/** A small inline note search → pick to attach. */
function NotePicker({ notes, onPick }: { notes: Note[]; onPick: (n: Note) => void }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const matches = useMemo(() => {
    const s = q.trim().toLowerCase()
    return notes
      .filter((n) => !s || (n.title ?? '').toLowerCase().includes(s) || n.content.toLowerCase().includes(s))
      .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
      .slice(0, 100)
  }, [q, notes])

  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setOpen((v) => !v)} style={pill(open)} title="Attach one of your notes">
        📝 Add note
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 6px)',
            left: 0,
            width: '300px',
            zIndex: 40,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            boxShadow: '0 10px 28px rgba(0,0,0,0.4)',
            padding: '0.5rem',
          }}
        >
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search your notes…"
            style={{
              width: '100%',
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-1)',
              padding: '0.45rem 0.6rem',
              fontSize: '0.82rem',
              outline: 'none',
              marginBottom: '0.4rem',
            }}
          />
          <div style={{ maxHeight: '240px', overflowY: 'auto' }}>
            {matches.length === 0 && <p className={styles.pickerEmpty}>No notes match.</p>}
            {matches.map((n) => (
              <button
                key={n.id}
                onClick={() => {
                  onPick(n)
                  setQ('')
                  setOpen(false)
                }}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-1)',
                  fontSize: '0.82rem',
                  padding: '0.4rem 0.5rem',
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {n.title?.trim() || 'Untitled'}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export function ChatComposer({
  value,
  onChange,
  onSend,
  onStop,
  busy,
  attachments,
  onAttach,
  onRemoveAttachment,
  onToggleThread,
  notes,
  onAddNote,
  think,
  onThinkChange,
  canThink,
  deepResearch,
  onDeepResearchChange,
  agent,
  onAgentChange,
  vision,
  presetControls,
  disabled,
}: Props) {
  const canSend = !busy && (value.trim() !== '' || attachments.length > 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {/* Attachment chips */}
      {attachments.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
          {attachments.map((a) => (
            <span key={a.id} style={{ ...pill(false), cursor: 'default' }}>
              <span aria-hidden>{kindIcon[a.kind]}</span>
              <span style={{ maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {a.name}
              </span>
              {a.kind === 'note' && a.hasThread && (
                <label
                  onClick={(e) => e.stopPropagation()}
                  title={
                    a.includeThread
                      ? `Sending this note + its ${a.threadCount} linked note${a.threadCount === 1 ? '' : 's'} (thread)`
                      : 'Tick to include the whole thread (linked notes)'
                  }
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '3px',
                    fontSize: '0.7rem',
                    cursor: 'pointer',
                    color: a.includeThread ? 'var(--accent)' : 'var(--text-3)',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={!!a.includeThread}
                    onChange={() => onToggleThread(a.id)}
                    style={{ cursor: 'pointer', margin: 0 }}
                  />
                  thread{a.threadCount ? ` (${a.threadCount})` : ''}
                </label>
              )}
              <button
                onClick={() => onRemoveAttachment(a.id)}
                title="Remove"
                aria-label={`Remove ${a.name}`}
                style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, fontSize: '0.9rem', lineHeight: 1 }}
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Composer card: textarea on top, toolbar row beneath. */}
      <div
        style={{
          border: '1px solid var(--border)',
          borderRadius: '14px',
          background: 'var(--surface)',
          padding: '0.6rem 0.7rem 0.5rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
        }}
      >
        <textarea
          rows={2}
          placeholder="Message the assistant…  (Enter to send, Shift+Enter for newline)"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              if (canSend) onSend()
            }
          }}
          disabled={disabled}
          style={{
            width: '100%',
            background: 'transparent',
            border: 'none',
            outline: 'none',
            resize: 'none',
            color: 'var(--text-1)',
            fontSize: '0.92rem',
            fontFamily: 'var(--font-body)',
            lineHeight: 1.5,
            minHeight: '44px',
            maxHeight: '200px',
            overflowY: 'auto',
          }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
          <button
            onClick={onAttach}
            disabled={disabled || busy}
            title={vision ? 'Attach documents, images or audio' : 'Attach documents or audio (this model has no vision for images)'}
            style={pill(false)}
          >
            📎 Attach
          </button>
          <NotePicker notes={notes} onPick={onAddNote} />
          {presetControls}
          <button
            onClick={() => onThinkChange(!think)}
            disabled={!canThink || busy}
            title={
              canThink
                ? think
                  ? 'Reasoning on — click to turn thinking off'
                  : 'Reasoning off'
                : 'This model is not a reasoning model'
            }
            style={{ ...pill(canThink && think), opacity: canThink ? 1 : 0.5, cursor: canThink ? 'pointer' : 'not-allowed' }}
          >
            🧠 Thinking {canThink ? (think ? 'on' : 'off') : 'n/a'}
          </button>
          <button
            onClick={() => onDeepResearchChange(!deepResearch)}
            disabled={busy}
            title="Routes to your Deep-research endpoint if configured; otherwise adds a thorough-research directive"
            style={pill(deepResearch)}
          >
            🔬 Deep research
          </button>
          <button
            onClick={() => onAgentChange(!agent)}
            disabled={busy}
            title="Agent mode: the AI can search, read and propose changes to your notes (writes need your approval)"
            style={pill(agent)}
          >
            🤖 Agent
          </button>

          <div style={{ marginLeft: 'auto' }}>
            {busy ? (
              <button className={styles.btn} onClick={onStop} title="Stop generating">
                ■ Stop
              </button>
            ) : (
              <button className={styles.btnPrimary} disabled={!canSend} onClick={onSend}>
                Send
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
