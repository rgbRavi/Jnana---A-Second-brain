// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import {
  Bot, Brain, FileText, Globe, Image as ImageIcon, Lightbulb, MessageSquare, Microscope, MoreHorizontal, Music,
  NotebookPen, Paperclip, Puzzle, Palette, Plus, ScrollText, SlidersHorizontal, Layers,
  Sparkles, Square, Wrench, X,
} from 'lucide-react'
import type { AiPreset, AiPresetView } from '../../types'
import type { ChatAttachment } from '../../core/ai'
import type { Note } from '../../types'
import type { WebMode } from '../../core/ai/webContext'
import { cycleWebMode } from './freeThread'
import { ACTION_VERB, scopeLabel, quizOriginOf, type FocusState } from '../../core/ai/focusedScope'
import { useComposerToolbar, type ToolbarItem } from '../../hooks/useComposerToolbar'
import { closeFocusPanel } from '../../lib/activeFocus'
import { ComposerMenu, MenuRow, MenuHeader, pillStyle } from './ComposerMenu'
import { FocusedContent } from './FocusedMenu'
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
  /** Model is a reasoning model (name guess or the user's answer) — only then is the Thinking toggle meaningful. */
  canThink: boolean
  /** What the model name alone suggests — shown as the Reasoning model switch's hint. */
  thinkingDetected: boolean
  onReasoningChange: (on: boolean) => void
  deepResearch: boolean
  onDeepResearchChange: (v: boolean) => void
  agent: boolean
  onAgentChange: (v: boolean) => void
  webMode: WebMode
  onWebModeChange: (m: WebMode) => void
  /** A web search provider is configured (else Always reads pasted links only). */
  canWebSearch: boolean
  /** Images will be sent to the chat model (name guess or the user's answer). */
  vision: boolean
  /** What the model name alone suggests — shown as the switch's hint. */
  visionDetected: boolean
  onVisionChange: (on: boolean) => void
  /** Chat model id, for the vision switch's wording. */
  model: string
  /** Files pasted into the message box (e.g. a screenshot). */
  onPasteFiles: (files: File[]) => void
  /** Files dropped onto the composer from the OS. */
  onDropPaths: (paths: string[]) => void
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
  // Focused (grounded) mode: arm an action over a note scope; the shared Send runs it.
  focus: FocusState
  onFocus: (updater: (f: FocusState) => FocusState) => void
  /** Active project, if any — named in the mode line. */
  projectName?: string
  inputRef?: React.Ref<HTMLTextAreaElement>
  disabled?: boolean
  // Provider presets (chat section) and this conversation's own system prompt.
  chatPresets: AiPresetView[]
  activeChatPresetId?: string
  onPickChatPreset: (id: string) => void
  convPrompt: string
  onConvPrompt: (v: string) => void
  /** The prompt was edited and left (blur / view closed) — persist it. */
  onConvPromptCommit: () => void
  /** Names the prompt the conversation instructions add to (preset name or "global"). */
  promptBase?: string
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
  vision, visionDetected, onVisionChange, model, notes, onAttach, onAddNote, close,
}: {
  vision: boolean
  visionDetected: boolean
  onVisionChange: (on: boolean) => void
  model: string
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
        hint={vision ? 'Documents, images or audio — or paste / drop them' : 'Documents or audio — or paste / drop them'}
        onClick={() => { onAttach(); close() }}
      />
      <MenuRow
        icon={<ImageIcon size={15} />}
        label="Send images to this model"
        hint={
          visionDetected
            ? `${model || 'This model'} looks image-capable`
            : `Turn on if ${model || 'this model'} accepts images`
        }
        active={vision}
        trailing={<span style={{ color: vision ? 'var(--accent)' : 'var(--text-3)' }}>{vision ? 'On' : 'Off'}</span>}
        onClick={() => onVisionChange(!vision)}
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
  convPrompt: string
  onConvPrompt: (v: string) => void
  onConvPromptCommit: () => void
  promptBase?: string
}) {
  const [view, setView] = useState<'root' | 'rules' | 'styles' | 'skills' | 'conversation'>('root')
  const activeStyle = props.stylePresets.find((s) => s.id === props.styleId)
  const skillCount = props.skillIds.filter((id) => props.skillPresets.some((s) => s.id === id)).length
  const back = () => setView('root')

  if (view === 'conversation') {
    return (
      <>
        <MenuHeader icon={<MessageSquare size={15} />} title="Conversation instructions" onBack={back} />
        <ConvPromptField {...props} />
      </>
    )
  }
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
        icon={<MessageSquare size={15} />} label="Conversation instructions"
        active={!!props.convPrompt.trim()}
        trailing={<Plus size={13} style={{ transform: 'rotate(45deg)' }} />}
        onClick={() => setView('conversation')}
      />
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

/** Commits on blur and on unmount (the menu closing unmounts it), so a closed menu never drops an edit. */
function ConvPromptField({ convPrompt, onConvPrompt, onConvPromptCommit, promptBase }: {
  convPrompt: string; onConvPrompt: (v: string) => void; onConvPromptCommit: () => void; promptBase?: string
}) {
  const commitCb = useRef(onConvPromptCommit)
  commitCb.current = onConvPromptCommit
  const latest = useRef(convPrompt)
  latest.current = convPrompt
  const saved = useRef(convPrompt)
  // Only a real edit commits; opening and closing untouched must not re-save the chat.
  const commit = () => {
    if (latest.current === saved.current) return
    saved.current = latest.current
    commitCb.current()
  }
  const commitRef = useRef(commit)
  commitRef.current = commit
  useEffect(() => () => commitRef.current(), [])
  return (
    <div style={{ padding: '0 0.2rem 0.2rem' }}>
      <textarea
        autoFocus
        aria-label="Conversation instructions"
        rows={5}
        value={convPrompt}
        onChange={(e) => onConvPrompt(e.target.value)}
        onBlur={commit}
        placeholder="Extra instructions for this conversation only…"
        className={styles.cField}
      />
      <small style={{ color: 'var(--text-3)' }}>
        {promptBase ? `Added after your ${promptBase} system prompt` : "Sent as this conversation's system prompt."}
      </small>
    </div>
  )
}

const WEB_LABEL: Record<WebMode, string> = { off: 'Off', always: 'Always', hybrid: 'Model decides' }

// ─── More menu (Thinking / Deep research / Agent / Web) ────────────────────

function MoreContent(props: {
  think: boolean; onThinkChange: (v: boolean) => void; canThink: boolean
  thinkingDetected: boolean; onReasoningChange: (on: boolean) => void; model: string
  deepResearch: boolean; onDeepResearchChange: (v: boolean) => void
  agent: boolean; onAgentChange: (v: boolean) => void
  webMode: WebMode; onWebModeChange: (m: WebMode) => void; canWebSearch: boolean
  /** The armed Focused action, if any — it takes over Send. */
  focusAction: FocusState['action']
}) {
  // Deep research shapes a plain chat reply; Agent and Focused runs don't use it.
  const drBlockedBy = props.focusAction ? ACTION_VERB[props.focusAction] : props.agent ? 'Agent' : null
  const onOff = (v: boolean) => <span style={{ color: v ? 'var(--accent)' : 'var(--text-3)' }}>{v ? 'On' : 'Off'}</span>
  const webHint =
    props.webMode === 'hybrid' && props.canWebSearch ? 'Agent with web tools — the model decides'
      : props.webMode === 'always'
        ? props.canWebSearch ? 'Searches the web before every reply' : 'Reads pasted links only — set up web search in Settings → AI'
        : props.canWebSearch ? 'Search the web for answers' : 'Pasted links are read; set up web search in Settings → AI to search'
  return (
    <>
      <MenuRow
        icon={<Brain size={15} />} label="Thinking"
        hint={props.canThink ? 'Extended reasoning' : 'Not a reasoning model — turn on "Reasoning model" if it is'}
        disabled={!props.canThink}
        active={props.canThink && props.think}
        trailing={props.canThink ? onOff(props.think) : <span style={{ color: 'var(--text-3)' }}>n/a</span>}
        onClick={() => props.onThinkChange(!props.think)}
      />
      <MenuRow
        icon={<Lightbulb size={15} />} label="Reasoning model"
        hint={
          props.thinkingDetected
            ? `${props.model || 'This model'} looks like a reasoning model`
            : `Turn on if ${props.model || 'this model'} reasons before answering`
        }
        active={props.canThink}
        trailing={onOff(props.canThink)}
        onClick={() => props.onReasoningChange(!props.canThink)}
      />
      <MenuRow
        icon={<Microscope size={15} />} label="Deep research"
        hint={drBlockedBy ? `Not used while ${drBlockedBy} is on` : 'Thorough, source-grounded answers'}
        disabled={!!drBlockedBy}
        active={!drBlockedBy && props.deepResearch}
        trailing={onOff(props.deepResearch)}
        onClick={() => props.onDeepResearchChange(!props.deepResearch)}
      />
      <MenuRow
        icon={<Bot size={15} />} label="Agent"
        hint={props.focusAction ? `Turns off ${ACTION_VERB[props.focusAction]}` : 'Search, read & propose note edits'}
        active={props.agent}
        trailing={onOff(props.agent)}
        onClick={() => props.onAgentChange(!props.agent)}
      />
      <MenuRow
        icon={<Globe size={15} />} label="Web"
        hint={webHint}
        active={props.webMode !== 'off'}
        trailing={<span style={{ color: props.webMode !== 'off' ? 'var(--accent)' : 'var(--text-3)' }}>{WEB_LABEL[props.webMode]}</span>}
        onClick={() => props.onWebModeChange(cycleWebMode(props.webMode, props.canWebSearch))}
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
  thinkingDetected,
  onReasoningChange,
  deepResearch,
  onDeepResearchChange,
  agent,
  onAgentChange,
  webMode,
  onWebModeChange,
  canWebSearch,
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
  focus,
  onFocus,
  projectName,
  inputRef,
  disabled,
  visionDetected,
  onVisionChange,
  model,
  onPasteFiles,
  onDropPaths,
  chatPresets,
  activeChatPresetId,
  onPickChatPreset,
  convPrompt,
  onConvPrompt,
  onConvPromptCommit,
  promptBase,
}: Props) {
  // OS file drops arrive at the window, not as DOM events (Tauri), so hit-test
  // the drop point against the composer — same pattern as LiveEditor.
  const boxRef = useRef<HTMLDivElement>(null)
  const onDropRef = useRef(onDropPaths)
  onDropRef.current = onDropPaths
  const [dropActive, setDropActive] = useState(false)
  useEffect(() => {
    let unlisten: (() => void) | undefined
    let cancelled = false
    const inBox = (p: { x: number; y: number }) => {
      const dpr = window.devicePixelRatio || 1
      const el = document.elementFromPoint(p.x / dpr, p.y / dpr)
      return !!el && !!boxRef.current?.contains(el)
    }
    void getCurrentWebview()
      .onDragDropEvent((event) => {
        const payload = event.payload
        if (payload.type === 'leave') return setDropActive(false)
        const hit = inBox(payload.position)
        if (payload.type !== 'drop') return setDropActive(hit)
        setDropActive(false)
        if (hit && payload.paths.length) onDropRef.current(payload.paths)
      })
      .then((fn) => {
        if (cancelled) fn()
        else unlisten = fn
      })
      .catch(() => {
        /* no webview (tests / browser dev) — paste and the picker still work */
      })
    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [])

  // Analyze/Quiz run on the scope alone (no text needed); Ask + normal chat need input.
  const runsWithoutText = focus.action === 'analyze' || focus.action === 'quiz'
  const canSend = !busy && (runsWithoutText || value.trim() !== '' || attachments.length > 0)
  const sendLabel = focus.action === 'analyze' ? 'Analyze' : focus.action === 'quiz' ? 'Quiz me' : 'Send'

  const styleActive = stylePresets.some((s) => s.id === styleId)
  const skillCount = skillIds.filter((id) => skillPresets.some((s) => s.id === id)).length
  const capBadge = ruleIds.length + skillCount + (styleActive ? 1 : 0) + (convPrompt.trim() ? 1 : 0)
  const activePreset = chatPresets.find((p) => p.id === activeChatPresetId)
  const presetLabel = activePreset?.name ?? (model.length > 24 ? model.slice(0, 23) + '…' : model || 'Model')
  const moreCount = (canThink && think ? 1 : 0) + (deepResearch ? 1 : 0) + (agent ? 1 : 0) + (webMode !== 'off' ? 1 : 0)

  const [{ order, hidden }] = useComposerToolbar()
  const activeOf: Partial<Record<ToolbarItem, boolean>> = {
    more: moreCount > 0, capabilities: capBadge > 0, focused: !!focus.action, attach: attachments.length > 0,
  }
  const controls: Record<ToolbarItem, React.ReactNode> = {
    preset: chatPresets.length === 0 ? null : (
      <ComposerMenu icon={<Layers size={14} />} label={presetLabel} active={!!activePreset}>
        {(close) =>
          chatPresets.map((p) => (
            <MenuRow
              key={p.id}
              label={p.name}
              hint={p.model}
              active={p.id === activeChatPresetId}
              onClick={() => { onPickChatPreset(p.id); close() }}
            />
          ))
        }
      </ComposerMenu>
    ),
    attach: (
      <ComposerMenu icon={<Paperclip size={14} />} label="Attach" badge={attachments.length || undefined} active={attachments.length > 0}>
        {(close) => (
          <AttachContent
            vision={vision}
            visionDetected={visionDetected}
            onVisionChange={onVisionChange}
            model={model}
            notes={notes}
            onAttach={onAttach}
            onAddNote={onAddNote}
            close={close}
          />
        )}
      </ComposerMenu>
    ),
    capabilities: (
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
            convPrompt={convPrompt}
            onConvPrompt={onConvPrompt}
            onConvPromptCommit={onConvPromptCommit}
            promptBase={promptBase}
          />
        )}
      </ComposerMenu>
    ),
    more: (
      <ComposerMenu icon={<MoreHorizontal size={14} />} label="More" badge={moreCount || undefined} active={moreCount > 0}>
        {() => (
          <MoreContent
            think={think} onThinkChange={onThinkChange} canThink={canThink}
            thinkingDetected={thinkingDetected} onReasoningChange={onReasoningChange} model={model}
            deepResearch={deepResearch} onDeepResearchChange={onDeepResearchChange}
            agent={agent} onAgentChange={onAgentChange}
            webMode={webMode} onWebModeChange={onWebModeChange} canWebSearch={canWebSearch}
            focusAction={focus.action}
          />
        )}
      </ComposerMenu>
    ),
    focused: (
      <ComposerMenu icon={<Sparkles size={14} />} label="Focused" active={!!focus.action}>
        {(close) => (
          <FocusedContent focus={focus} setFocus={onFocus} close={close} />
        )}
      </ComposerMenu>
    ),
  }

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

      <ModeLine
        focus={focus}
        agent={agent}
        webMode={webMode}
        canWebSearch={canWebSearch}
        deepResearch={deepResearch}
        projectName={projectName}
        presetsOn={styleActive || skillCount > 0}
        rulesOn={ruleIds.length > 0}
        onFocusOff={() => { onFocus((f) => ({ ...f, action: null })); closeFocusPanel() }}
        onAgentOff={() => onAgentChange(false)}
        onWebOff={() => onWebModeChange('off')}
        onDeepResearchOff={() => onDeepResearchChange(false)}
      />

      <div ref={boxRef} className={`${styles.composerBox} ${dropActive ? styles.composerBoxDrop : ''}`}>
        <textarea
          ref={inputRef}
          aria-label="Message"
          onPaste={(e) => {
            const files = Array.from(e.clipboardData.files)
            if (files.length === 0) return // plain text paste — leave it alone
            e.preventDefault()
            onPasteFiles(files)
          }}
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
          {order.filter((i) => !hidden.includes(i) || activeOf[i]).map((i) => <Fragment key={i}>{controls[i]}</Fragment>)}

          <div style={{ marginLeft: 'auto' }}>
            {busy ? (
              <button className={`${styles.btn} ${styles.stopBtn}`} onClick={onStop} title="Stop generating">
                <Square size={13} /> Stop
              </button>
            ) : (
              <button className={styles.btnPrimary} disabled={!canSend} onClick={onSend}>
                {sendLabel}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Mode line ───────────────────────────────────────────────────────────────

/** "a", "a and b", "a, b and c". */
const joinList = (items: string[]) =>
  items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`

/**
 * One line above the composer that states what Send will do, and what it will
 * ignore. Precedence mirrors FreeChat.send: a Focused action, then Agent, then
 * Deep research, then plain chat.
 */
function ModeLine(props: {
  focus: FocusState
  agent: boolean
  webMode: WebMode
  canWebSearch: boolean
  deepResearch: boolean
  projectName?: string
  presetsOn: boolean
  rulesOn: boolean
  onFocusOff: () => void
  onAgentOff: () => void
  onWebOff: () => void
  onDeepResearchOff: () => void
}) {
  const { focus, projectName, presetsOn, rulesOn } = props
  let icon: React.ReactNode
  let label: string
  let detail: string
  let grounded = false
  let off: { label: string; run: () => void } | null = null
  const ignored: string[] = []

  if (focus.action) {
    icon = <Sparkles size={14} />
    label = `${ACTION_VERB[focus.action]} · ${scopeLabel(focus)}`
    grounded = true
    if (projectName) ignored.push('project instructions')
    if (presetsOn) ignored.push('styles & skills')
    if (rulesOn) ignored.push('rules')
    const origin = quizOriginOf(focus)
    detail = focus.action === 'quiz' && origin !== 'notes'
      ? origin === 'web' ? 'Uses the web — not your notes' : "Uses the AI's general knowledge — not your notes"
      : ignored.length ? `Uses only your notes — ${joinList(ignored)} don't apply` : 'Uses only the notes in scope'
    off = { label: `Turn off ${ACTION_VERB[focus.action]}`, run: props.onFocusOff }
  } else if (props.agent) {
    icon = <Bot size={14} />
    label = 'Agent'
    grounded = true
    if (projectName) ignored.push('project instructions')
    if (presetsOn) ignored.push('styles & skills')
    detail = props.webMode === 'hybrid' ? 'Agent with web tools'
      : props.webMode === 'always' ? 'Agent · searches the web first'
      : ignored.length
      ? `Proposes note edits for you to approve — ${joinList(ignored)} don't apply`
      : 'Searches your notes and proposes edits for you to approve'
    off = { label: 'Turn off Agent', run: props.onAgentOff }
  } else if (props.webMode === 'always') {
    icon = <Globe size={14} />
    label = 'Web'
    detail = props.canWebSearch ? 'Searches the web, then answers' : 'Reads pasted links, then answers'
    off = { label: 'Turn off Web', run: props.onWebOff }
  } else if (props.deepResearch) {
    icon = <Microscope size={14} />
    label = 'Deep research'
    detail = projectName ? `Slower, more thorough · ${projectName} instructions on` : 'Slower, more thorough answers'
    off = { label: 'Turn off Deep research', run: props.onDeepResearchOff }
  } else {
    icon = <MessageSquare size={14} />
    label = 'Chat'
    detail = projectName
      ? `${projectName} instructions on · won't search your notes`
      : "Won't search your notes — use Focused to ground a reply in them"
  }

  return (
    <div className={`${styles.modeLine} ${grounded ? styles.modeLineOn : ''}`} aria-live="polite">
      <span className={styles.modeLineIcon} aria-hidden>{icon}</span>
      <span className={styles.modeLineLabel}>{label}</span>
      <span className={styles.modeLineDetail} title={detail}>{detail}</span>
      {off && (
        <button type="button" className={styles.modeLineOff} onClick={off.run} title={off.label} aria-label={off.label}>
          <X size={13} />
        </button>
      )}
    </div>
  )
}
