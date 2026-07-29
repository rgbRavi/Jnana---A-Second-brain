// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useMemo, useState } from 'react'
import {
  Bot, Brain, FileText, Image as ImageIcon, Microscope, MoreHorizontal, Music,
  NotebookPen, Paperclip, Puzzle, Palette, Plus, ScrollText, SlidersHorizontal,
  Square, Wrench, X,
} from 'lucide-react'
import type { AiPreset } from '../../types'
import type { ChatAttachment } from '../../core/ai'
import type { Note } from '../../types'
import { ComposerMenu, MenuRow, MenuHeader, pillStyle } from './ComposerMenu'
import { StylesBody, SkillsBody } from './PresetPicker'
import { RulesBody } from './RulesPicker'
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
  /** Model supports vision — used only for the attach hint. */
  vision: boolean
  // Capabilities: styles + skills (presets) and rules.
  stylePresets: AiPreset[]
  skillPresets: AiPreset[]
  styleId: string
  onStyleId: (id: string) => void
  skillIds: string[]
  onSkillIds: (ids: string[]) => void
  onPresetsChanged: () => void
  vaultId: string
  ruleIds: string[]
  onRuleIds: (ids: string[]) => void
  disabled?: boolean
}

const kindIcon: Record<ChatAttachment['kind'], React.ReactNode> = {
  image: <ImageIcon size={13} />,
  document: <FileText size={13} />,
  audio: <Music size={13} />,
  note: <NotebookPen size={13} />,
  other: <Paperclip size={13} />,
}

const chipStyle: React.CSSProperties = { ...pillStyle(false), cursor: 'default' }

// ─── Attach menu ────────────────────────────────────────────────────────────

function AttachContent({
  vision, notes, onAttach, onAddNote, close,
}: {
  vision: boolean
  notes: Note[]
  onAttach: () => void
  onAddNote: (n: Note) => void
  close: () => void
}) {
  const [q, setQ] = useState('')
  const matches = useMemo(() => {
    const s = q.trim().toLowerCase()
    return notes
      .filter((n) => !s || (n.title ?? '').toLowerCase().includes(s) || n.content.toLowerCase().includes(s))
      .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
      .slice(0, 60)
  }, [q, notes])

  return (
    <>
      <div className={styles.cSectionLabel}>Attach a note</div>
      <div style={{ padding: '0 0.2rem 0.2rem' }}>
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search your notes…"
          className={styles.cField}
        />
      </div>
      <div style={{ maxHeight: 220, overflowY: 'auto' }}>
        {matches.length === 0 && <p className={styles.pickerEmpty}>No notes match.</p>}
        {matches.map((n) => (
          <MenuRow
            key={n.id}
            icon={<NotebookPen size={15} />}
            label={n.title?.trim() || 'Untitled'}
            onClick={() => { onAddNote(n); close() }}
          />
        ))}
      </div>
      <div className={styles.cDivider} />
      <MenuRow
        icon={<Paperclip size={15} />}
        label="Files & media"
        hint={vision ? 'Documents, images or audio' : 'Documents or audio (no vision)'}
        onClick={() => { onAttach(); close() }}
      />
    </>
  )
}

// ─── Capabilities menu (master → detail) ─────────────────────────────────────

function CapabilitiesContent(props: {
  stylePresets: AiPreset[]
  skillPresets: AiPreset[]
  styleId: string
  onStyleId: (id: string) => void
  skillIds: string[]
  onSkillIds: (ids: string[]) => void
  onPresetsChanged: () => void
  vaultId: string
  ruleIds: string[]
  onRuleIds: (ids: string[]) => void
}) {
  const [view, setView] = useState<'root' | 'rules' | 'styles' | 'skills'>('root')
  const activeStyle = props.stylePresets.find((s) => s.id === props.styleId)
  const skillCount = props.skillIds.filter((id) => props.skillPresets.some((s) => s.id === id)).length
  const back = () => setView('root')

  if (view === 'rules') {
    return (
      <>
        <MenuHeader icon={<ScrollText size={15} />} title="Rules" onBack={back} />
        <RulesBody vaultId={props.vaultId} selectedIds={props.ruleIds} onSelectedIds={props.onRuleIds} />
      </>
    )
  }
  if (view === 'styles') {
    return (
      <>
        <MenuHeader icon={<Palette size={15} />} title="Response style" onBack={back} />
        <StylesBody styles={props.stylePresets} styleId={props.styleId} onStyleId={props.onStyleId} />
      </>
    )
  }
  if (view === 'skills') {
    return (
      <>
        <MenuHeader icon={<Wrench size={15} />} title="Skills" onBack={back} />
        <SkillsBody skills={props.skillPresets} skillIds={props.skillIds} onSkillIds={props.onSkillIds} onChanged={props.onPresetsChanged} />
      </>
    )
  }
  return (
    <>
      <MenuRow
        icon={<ScrollText size={15} />} label="Rules"
        badge={props.ruleIds.length || undefined}
        trailing={<Plus size={13} style={{ transform: 'rotate(45deg)' }} />}
        active={props.ruleIds.length > 0}
        onClick={() => setView('rules')}
      />
      <MenuRow
        icon={<Palette size={15} />} label="Response style"
        hint={activeStyle?.name ?? 'None'}
        active={!!activeStyle}
        trailing={<Plus size={13} style={{ transform: 'rotate(45deg)' }} />}
        onClick={() => setView('styles')}
      />
      <MenuRow
        icon={<Wrench size={15} />} label="Skills"
        badge={skillCount || undefined}
        active={skillCount > 0}
        trailing={<Plus size={13} style={{ transform: 'rotate(45deg)' }} />}
        onClick={() => setView('skills')}
      />
      <MenuRow
        icon={<Puzzle size={15} />} label="Plugins"
        disabled
        trailing={<span className={styles.cComing}>Soon</span>}
      />
    </>
  )
}

// ─── More menu (Thinking / Deep research / Agent toggles) ────────────────────

function MoreContent(props: {
  think: boolean; onThinkChange: (v: boolean) => void; canThink: boolean
  deepResearch: boolean; onDeepResearchChange: (v: boolean) => void
  agent: boolean; onAgentChange: (v: boolean) => void
}) {
  const onOff = (v: boolean) => <span style={{ color: v ? 'var(--accent)' : 'var(--text-3)' }}>{v ? 'On' : 'Off'}</span>
  return (
    <>
      <MenuRow
        icon={<Brain size={15} />} label="Thinking"
        hint={props.canThink ? 'Extended reasoning' : 'Not a reasoning model'}
        disabled={!props.canThink}
        active={props.canThink && props.think}
        trailing={props.canThink ? onOff(props.think) : <span style={{ color: 'var(--text-3)' }}>n/a</span>}
        onClick={() => props.onThinkChange(!props.think)}
      />
      <MenuRow
        icon={<Microscope size={15} />} label="Deep research"
        hint="Thorough, source-grounded answers"
        active={props.deepResearch}
        trailing={onOff(props.deepResearch)}
        onClick={() => props.onDeepResearchChange(!props.deepResearch)}
      />
      <MenuRow
        icon={<Bot size={15} />} label="Agent"
        hint="Search, read & propose note edits"
        active={props.agent}
        trailing={onOff(props.agent)}
        onClick={() => props.onAgentChange(!props.agent)}
      />
    </>
  )
}

// ─── Composer ────────────────────────────────────────────────────────────────

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
  stylePresets,
  skillPresets,
  styleId,
  onStyleId,
  skillIds,
  onSkillIds,
  onPresetsChanged,
  vaultId,
  ruleIds,
  onRuleIds,
  disabled,
}: Props) {
  const canSend = !busy && (value.trim() !== '' || attachments.length > 0)

  const styleActive = stylePresets.some((s) => s.id === styleId)
  const skillCount = skillIds.filter((id) => skillPresets.some((s) => s.id === id)).length
  const capBadge = ruleIds.length + skillCount + (styleActive ? 1 : 0)
  const moreCount = (canThink && think ? 1 : 0) + (deepResearch ? 1 : 0) + (agent ? 1 : 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {/* Attachment chips */}
      {attachments.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
          {attachments.map((a) => (
            <span key={a.id} style={chipStyle}>
              <span aria-hidden style={{ display: 'inline-flex' }}>{kindIcon[a.kind]}</span>
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
                    style={{ cursor: 'pointer', margin: 0, accentColor: 'var(--accent)' }}
                  />
                  thread{a.threadCount ? ` (${a.threadCount})` : ''}
                </label>
              )}
              <button
                onClick={() => onRemoveAttachment(a.id)}
                title="Remove"
                aria-label={`Remove ${a.name}`}
                style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, lineHeight: 1, display: 'inline-flex' }}
              >
                <X size={14} />
              </button>
            </span>
          ))}
        </div>
      )}

      <div
        style={{
          border: '1px solid color-mix(in srgb, var(--text-1) 12%, transparent)',
          borderRadius: '28px',
          background: 'color-mix(in srgb, var(--surface) 35%, transparent)',
          backdropFilter: 'blur(24px) saturate(150%)',
          boxShadow: '0 12px 36px rgba(0,0,0,0.3), inset 0 1px 1px color-mix(in srgb, var(--text-1) 15%, transparent)',
          padding: '0.85rem 1.25rem 0.75rem',
          margin: '0 0.5rem 0.5rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.6rem',
          transition: 'box-shadow 0.2s',
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
          <ComposerMenu icon={<Paperclip size={14} />} label="Attach" badge={attachments.length || undefined} active={attachments.length > 0}>
            {(close) => (
              <AttachContent vision={vision} notes={notes} onAttach={onAttach} onAddNote={onAddNote} close={close} />
            )}
          </ComposerMenu>

          <ComposerMenu icon={<SlidersHorizontal size={14} />} label="Capabilities" badge={capBadge || undefined} active={capBadge > 0}>
            {() => (
              <CapabilitiesContent
                stylePresets={stylePresets}
                skillPresets={skillPresets}
                styleId={styleId}
                onStyleId={onStyleId}
                skillIds={skillIds}
                onSkillIds={onSkillIds}
                onPresetsChanged={onPresetsChanged}
                vaultId={vaultId}
                ruleIds={ruleIds}
                onRuleIds={onRuleIds}
              />
            )}
          </ComposerMenu>

          <ComposerMenu icon={<MoreHorizontal size={14} />} label="More" badge={moreCount || undefined} active={moreCount > 0}>
            {() => (
              <MoreContent
                think={think} onThinkChange={onThinkChange} canThink={canThink}
                deepResearch={deepResearch} onDeepResearchChange={onDeepResearchChange}
                agent={agent} onAgentChange={onAgentChange}
              />
            )}
          </ComposerMenu>

          <div style={{ marginLeft: 'auto' }}>
            {busy ? (
              <button className={styles.btn} onClick={onStop} title="Stop generating">
                <Square size={13} /> Stop
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
