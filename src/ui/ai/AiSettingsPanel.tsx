// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import type { AiConfig, AiProviderKind, IndexStats, Note } from '../../types'
import {
  withChatProviderDefaults,
  withEmbeddingProviderDefaults,
  withTranscriptionProviderDefaults,
  withDeepResearchProviderDefaults,
  getModelHistory,
  rememberModel,
  testAiConnection,
  clearAiKey,
  type KeyTarget,
  type ModelKind,
  type TestTarget,
} from '../../core/ai'
import { showConfirmDialog } from '../../lib/dialog'
import { toast } from '../../lib/toast'
import { plural } from '../../lib/plural'
import { log } from '../../lib/logger'
import { registerCloseFlush } from '../../core/closeGuard'
import { SettingSelect, SettingToggle } from '../settings/SettingControls'
import { SettingActions, SettingButton, SettingField, SettingPanel, SettingSection, hintId, settingAnchor, settingInputClass } from '../settings/SettingLayout'
import { PresetBar } from './PresetBar'
import { AiSetupGuide } from './AiSetupGuide'
import { connectionSignature, recordConnectionTest, testedAgo, useConnectionRecord } from './connectionStatus'
import styles from './AiSettings.module.css'

interface Props {
  config: AiConfig
  /** Resolves false when the save failed (the caller already toasted). */
  onChange: (config: AiConfig) => void | Promise<boolean>
  stats: IndexStats
  indexing: { done: number; total: number } | null
  notes: Note[]
  staleNotes: Note[]
  onReindex: (notes: Note[]) => void
}

/** Predicts "the saved key will be dropped". Case-sensitive like Rust's comparison, so it
 *  may warn when Rust would keep the key (a pasted endpoint path) but never the reverse. */
const sameUrl = (a: string, b: string) => a.trim().replace(/\/+$/, '') === b.trim().replace(/\/+$/, '')

const QUICKSTART_KEY = 'jnana.ai.quickstartDone'

const KEY_NOTE = 'Stored on this device only, and sent only to the provider you set here.'
const CLEARS_KEY = 'Changing the URL clears the saved API key for this provider — you will need to enter it again.'

/**
 * Base URL: edits stay local while typing and commit on blur/Enter, so a half-typed
 * address never reaches Rust (which drops a saved key whenever the URL changes — by
 * design, so a key can't be redirected to a new host). The warning shows *before* commit.
 */
function UrlField({
  label,
  value,
  onCommit,
  placeholder,
  keyAtRisk,
  hint,
  hintVisible,
}: {
  label: string
  value: string
  onCommit: (v: string) => void
  placeholder?: string
  /** A saved key exists that a changed URL would clear. */
  keyAtRisk: boolean
  hint?: ReactNode
  hintVisible?: boolean
}) {
  const id = useId()
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  const commit = () => {
    if (draft !== value) onCommit(draft)
  }
  const warn = keyAtRisk && !sameUrl(draft, value)
  const describedBy = [hint ? hintId(id) : null, warn ? `${id}-warn` : null].filter(Boolean).join(' ') || undefined
  return (
    <SettingField label={label} htmlFor={id} hint={hint} hintVisible={hintVisible}>
      <input
        id={id}
        className={settingInputClass}
        value={draft}
        placeholder={placeholder}
        spellCheck={false}
        aria-describedby={describedBy}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
        }}
      />
      {warn && (
        <p id={`${id}-warn`} role="status" className={styles.warn}>
          {CLEARS_KEY}
        </p>
      )}
    </SettingField>
  )
}

/**
 * Text edited as a local draft and committed after a short pause, on blur, and (via the
 * close guard) before the window closes - so typing doesn't fire a full config save per
 * keystroke, yet nothing typed is lost. `multiline` renders a textarea.
 */
export function DraftText({
  value,
  onCommit,
  multiline,
  ...rest
}: {
  value: string
  onCommit: (v: string) => void
  multiline?: boolean
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'onBlur'> &
  Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange' | 'onBlur'>) {
  const [draft, setDraft] = useState(value)
  const dirty = useRef(false)
  const draftRef = useRef(draft)
  const commitRef = useRef(onCommit)
  commitRef.current = onCommit
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  // Adopt external changes (preset applied...) only while nothing is pending.
  useEffect(() => {
    if (!dirty.current) {
      setDraft(value)
      draftRef.current = value
    }
  }, [value])
  const flush = () => {
    clearTimeout(timer.current)
    if (!dirty.current) return
    dirty.current = false
    commitRef.current(draftRef.current)
  }
  useEffect(() => {
    const off = registerCloseFlush(async () => flush())
    return () => {
      off()
      flush()
    }
  }, [])
  const change = (v: string) => {
    dirty.current = true
    draftRef.current = v
    setDraft(v)
    clearTimeout(timer.current)
    timer.current = setTimeout(flush, 400)
  }
  return multiline ? (
    <textarea {...rest} value={draft} onChange={(e) => change(e.target.value)} onBlur={flush} />
  ) : (
    <input {...rest} value={draft} onChange={(e) => change(e.target.value)} onBlur={flush} onKeyDown={(e) => e.key === 'Enter' && flush()} />
  )
}

/**
 * API key: typed locally, committed on blur/Enter (so the save + confirmation happen once, not per
 * keystroke). A saved key shows "saved" and can be removed explicitly - an empty key sent to Rust
 * means "keep the stored one", so removal goes through its own command.
 */
function KeyField({
  id,
  hasKey,
  onCommit,
  target,
  placeholder,
}: {
  id: string
  hasKey: boolean
  onCommit: (v: string) => void | Promise<boolean>
  target: KeyTarget
  placeholder: string
}) {
  const [draft, setDraft] = useState('')
  const commit = () => {
    const v = draft.trim()
    setDraft('')
    if (!v) return
    // Only claim "saved" once Rust has it; a failed save already toasted.
    void Promise.resolve(onCommit(v)).then((ok) => {
      if (ok !== false) toast.success('API key saved.')
    })
  }
  const remove = async () => {
    const ok = await showConfirmDialog({
      title: 'Remove API key?',
      message: 'The saved key is deleted from this device. You will need to enter it again to use this service.',
      confirmLabel: 'Remove key',
      danger: true,
    })
    if (!ok) return
    try {
      await clearAiKey(target)
      toast.success('API key removed.')
    } catch (e) {
      log.error('[ai] failed to remove API key', e)
      toast.error("Couldn't remove the API key. Try again.")
    }
  }
  return (
    <SettingField label="API key" htmlFor={id} hint={KEY_NOTE} hintVisible>
      <input
        id={id}
        className={settingInputClass}
        type="password"
        autoComplete="off"
        aria-describedby={hintId(id)}
        placeholder={hasKey ? '•••••• saved — type to replace' : placeholder}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
        }}
      />
      {hasKey && (
        <SettingActions>
          <SettingButton variant="danger" onClick={() => void remove()}>
            Remove key
          </SettingButton>
        </SettingActions>
      )}
    </SettingField>
  )
}

interface ProviderSectionProps {
  title: string
  hint?: string
  provider: string
  options: { value: string; label: string }[]
  onProvider: (value: string) => void
  baseUrl: string
  onBaseUrl: (value: string) => void
  /** Which saved key "Remove key" deletes. */
  keyTarget: KeyTarget
  /** Stable id prefix so a sibling (quick start) can focus this section's fields. */
  idPrefix?: string
  /** Show the API-key field (cloud providers). */
  showKey: boolean
  apiKey: string
  hasKey: boolean
  onKey: (value: string) => void | Promise<boolean>
  modelLabel: string
  modelHint?: string
  model: string
  onModel: (value: string) => void
  /** Which model-name history bucket feeds this field's dropdown. */
  historyKey?: ModelKind
  /** Preset bar rendered above the fields. */
  presets?: ReactNode
  /** Extra fields rendered after the model (e.g. the chat system prompt). */
  extra?: ReactNode
  /** Which Rust target "Test connection" probes; omit when no cheap probe exists. */
  testTarget?: TestTarget
  /** Start expanded until a test of the current settings has succeeded (Chat). */
  openUnlessConnected?: boolean
}

/** A reusable provider block: provider select + service address + (optional) key + model.
 *  The model field is a combobox — free text plus a dropdown of names used before. */
function ProviderSection(p: ProviderSectionProps) {
  const uid = useId()
  const [suggestions, setSuggestions] = useState<string[]>(() => (p.historyKey ? getModelHistory(p.historyKey) : []))
  const [testing, setTesting] = useState(false)
  // The failure reason outlives its toast for this session (connectionStatus stores only ok/at).
  const [failure, setFailure] = useState<string | null>(null)
  const listId = p.historyKey ? `models-${p.historyKey}` : undefined
  const keyAtRisk = p.hasKey && !p.apiKey
  const changeProvider = async (v: string) => {
    if (v === p.provider) return
    if (keyAtRisk) {
      const ok = await showConfirmDialog({
        title: 'Switch provider?',
        message: 'Switching provider clears the API key saved for this section. You will need to enter it again.',
        confirmLabel: 'Switch',
        danger: true,
      })
      if (!ok) return
    }
    p.onProvider(v)
  }
  const runTest = async () => {
    if (!p.testTarget) return
    setTesting(true)
    const r = await testAiConnection(p.testTarget, p.provider as AiProviderKind, p.model)
    setTesting(false)
    recordConnectionTest(p.testTarget, r.ok, connectionSignature(p.provider, p.baseUrl, p.model))
    setFailure(r.ok ? null : r.message)
    if (r.ok) toast.success(r.message)
    else toast.error(r.message)
  }
  // The last test only counts while this section still points at what was tested.
  const record = useConnectionRecord(p.testTarget)
  const current = record && record.signature === connectionSignature(p.provider, p.baseUrl, p.model) ? record : undefined
  const statusText = current ? (current.ok ? `Connected · tested ${testedAgo(current.at)}` : `Last test failed · ${testedAgo(current.at)}`) : 'Not tested yet'
  // Open on first view only while the section still needs attention; afterwards the user owns it.
  const [open, setOpen] = useState(() => !!p.openUnlessConnected && !current?.ok)

  const base = p.idPrefix ?? uid
  const providerId = `${base}-provider`
  const keyId = `${base}-key`
  const modelId = `${base}-model`
  const body = (
    <div className={styles.card}>
      {p.hint && <p className={styles.statusLine}>{p.hint}</p>}
      {p.presets}
      <SettingField label="Provider" htmlFor={providerId}>
        <SettingSelect id={providerId} value={p.provider} options={p.options} onChange={(v) => void changeProvider(v)} />
      </SettingField>

      <UrlField
        label="Service address"
        value={p.baseUrl}
        onCommit={p.onBaseUrl}
        keyAtRisk={keyAtRisk}
        hint="Where the AI service runs, e.g. http://localhost:11434 for Ollama."
        hintVisible
      />

      {p.showKey && (
        <KeyField id={keyId} hasKey={p.hasKey} onCommit={p.onKey} target={p.keyTarget} placeholder="sk-..." />
      )}

      <SettingField label={p.modelLabel} htmlFor={modelId} hint={p.modelHint} hintVisible={!!p.modelHint}>
        <DraftText
          id={modelId}
          className={settingInputClass}
          value={p.model}
          list={listId}
          maxLength={200}
          placeholder="Type or pick a model…"
          onCommit={(v) => {
            p.onModel(v)
            if (p.historyKey && v.trim()) {
              rememberModel(p.historyKey, v)
              setSuggestions(getModelHistory(p.historyKey))
            }
          }}
        />
        {listId && (
          <datalist id={listId}>
            {suggestions.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        )}
      </SettingField>
      {p.extra}
      {p.testTarget && (
        <SettingField
          label="Connection"
          htmlFor={`${base}-test`}
          hint={
            <span
              role="status"
              className={`${styles.connStatus} ${current ? (current.ok ? styles.connOk : styles.connFail) : ''}`}
            >
              <span className={styles.connDot} aria-hidden />
              {statusText}
            </span>
          }
        >
          <div id={`${base}-test`}>
            <SettingButton busy={testing} onClick={() => void runTest()} title="Send one tiny request using your saved settings">
              {testing ? 'Testing…' : 'Test connection'}
            </SettingButton>
          </div>
          {current && !current.ok && failure && (
            <p role="status" className={styles.warn}>
              {failure}
            </p>
          )}
        </SettingField>
      )}
    </div>
  )

  // Summary is one line: the option's short name ("OpenAI-compatible"), not its explanation.
  const label = (p.options.find((o) => o.value === p.provider)?.label ?? p.provider).split(' — ')[0]
  return (
    <details
      className={styles.disclosure}
      data-setting-anchor={settingAnchor(p.title)}
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary>
        <ChevronRight size={14} className={styles.chevron} aria-hidden />
        <span className={styles.disclosureTitle}>{p.title}</span>
        <span className={styles.disclosureSummary} title={[label, p.model.trim()].filter(Boolean).join(' · ')}>
          {[label, p.model.trim()].filter(Boolean).join(' · ')}
        </span>
        {p.testTarget && (
          <span className={`${styles.connStatus} ${styles.summaryStatus} ${current ? (current.ok ? styles.connOk : styles.connFail) : ''}`}>
            <span className={styles.connDot} aria-hidden />
            {statusText}
          </span>
        )}
      </summary>
      {body}
    </details>
  )
}

const WEB_SEARCH_OPTIONS = [
  { value: 'brave', label: 'Brave Search' },
  { value: 'tavily', label: 'Tavily' },
  { value: 'searxng', label: 'SearXNG (self-hosted)' },
]

/** Web search backend: provider + key (brave/tavily) or base URL (searxng). No model. */
function WebSearchSection({ config, set }: { config: AiConfig; set: <K extends keyof AiConfig>(k: K, v: AiConfig[K]) => void | Promise<boolean> }) {
  const uid = useId()
  const searx = config.webSearchProvider === 'searxng'
  const hasKey = !!config.hasWebSearchApiKey && !config.webSearchApiKey
  const changeProvider = async (v: string) => {
    if (v === config.webSearchProvider) return
    if (hasKey) {
      const ok = await showConfirmDialog({
        title: 'Switch provider?',
        message: 'Switching provider clears the API key saved for web search. You will need to enter it again.',
        confirmLabel: 'Switch',
        danger: true,
      })
      if (!ok) return
    }
    set('webSearchProvider', v as AiConfig['webSearchProvider'])
  }
  const label = WEB_SEARCH_OPTIONS.find((o) => o.value === config.webSearchProvider)?.label ?? config.webSearchProvider
  return (
    <details className={styles.disclosure} data-setting-anchor="web-search">
      <summary>
        <ChevronRight size={14} className={styles.chevron} aria-hidden />
        <span className={styles.disclosureTitle}>Web search</span>
        <span className={styles.disclosureSummary}>{label}</span>
      </summary>
      <div className={styles.card}>
        <p className={styles.statusLine}>
          Used by Web quizzes and answer rechecks. Your topic is sent to this provider; pages are read by Jnana and sent to your
          chat model.
        </p>
        <PresetBar section="webSearch" config={config} />
        <SettingField label="Provider" htmlFor={`${uid}-provider`}>
          <SettingSelect
            id={`${uid}-provider`}
            value={config.webSearchProvider}
            options={WEB_SEARCH_OPTIONS}
            onChange={(v) => void changeProvider(v)}
          />
        </SettingField>
        {searx ? (
          <UrlField
            label="Service address"
            value={config.webSearchBaseUrl}
            onCommit={(v) => set('webSearchBaseUrl', v)}
            placeholder="https://searx.example.org"
            keyAtRisk={hasKey}
            hint="The address of your SearXNG server."
          />
        ) : (
          <KeyField
            id={`${uid}-key`}
            hasKey={!!config.hasWebSearchApiKey}
            onCommit={(v) => set('webSearchApiKey', v)}
            target="webSearch"
            placeholder="API key"
          />
        )}
      </div>
    </details>
  )
}

const LLM_OPTIONS = [
  { value: 'ollama', label: 'Ollama — runs on this computer' },
  { value: 'openai', label: 'OpenAI-compatible — cloud service' },
]

/**
 * AI connections: chat, search by meaning, and transcription are each
 * configured independently — so you can, for example, embed locally with
 * Ollama while chatting through an online API.
 */
export function AiSettingsPanel({ config, onChange, stats, indexing, notes, staleNotes, onReindex }: Props) {
  const uid = useId()
  const set = <K extends keyof AiConfig>(key: K, value: AiConfig[K]) => onChange({ ...config, [key]: value })
  const [quickDone, setQuickDone] = useState(() => {
    try {
      return localStorage.getItem(QUICKSTART_KEY) === '1'
    } catch {
      return false
    }
  })
  const finishQuick = () => {
    setQuickDone(true)
    try {
      localStorage.setItem(QUICKSTART_KEY, '1')
    } catch {
      /* storage unavailable: the card just returns next visit */
    }
  }
  // The guided setup shows on its own only while AI is unconfigured: never dismissed, no saved
  // key, no saved setups (connecting resets the chat + embedding providers, which drops their
  // keys). "Run guided setup" brings it back on demand; it warns before replacing a saved key.
  const [guideForced, setGuideForced] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const unconfigured = !quickDone && !config.hasChatApiKey && !config.hasEmbeddingApiKey && !(config.presets?.chat?.length ?? 0)
  const showGuide = config.enabled && (guideForced || unconfigured)
  const leaveGuide = () => {
    setGuideForced(false)
    setShowAll(false)
    finishQuick()
  }

  // Why "Index all notes" can't run — shown instead of a silently dead button.
  const indexBlocker = indexing
    ? null
    : !config.embeddingModel.trim()
      ? 'Choose a search model above first.'
      : notes.length === 0
        ? 'There are no notes in this vault to index yet.'
        : null

  return (
    <SettingPanel>
      <SettingSection
        title="AI features"
        intro={config.enabled ? undefined : 'AI is optional and off. With a local provider such as Ollama, nothing leaves your computer.'}
      >
        <SettingToggle
          checked={config.enabled}
          onChange={(v) => set('enabled', v)}
          label="Enable AI"
          hint="turns on chat, search by meaning, quizzes and suggestions"
          hintVisible
          ariaLabel="Enable AI"
        />
        {config.enabled && (
          <SettingToggle
            checked={config.autoIndex}
            onChange={(v) => set('autoIndex', v)}
            label="Keep search up to date as you edit"
            hint="re-indexes each note when you save it"
            ariaLabel="Keep search up to date as you edit"
          />
        )}
        {config.enabled && !showGuide && (
          <SettingField label="Guided setup" htmlFor={`${uid}-guide`} hint="Walks you through connecting a chat model." hintVisible>
            <div id={`${uid}-guide`}>
              <SettingButton onClick={() => setGuideForced(true)}>Run guided setup</SettingButton>
            </div>
          </SettingField>
        )}
      </SettingSection>

      {!config.enabled ? null : (
        <>
          {showGuide && (
            <AiSetupGuide
              config={config}
              onChange={onChange}
              onReindex={() => onReindex(notes)}
              noteCount={notes.length}
              onFinish={leaveGuide}
              onSkip={leaveGuide}
            />
          )}
          {showGuide && !showAll ? (
            <SettingButton className={styles.showAll} onClick={() => setShowAll(true)}>
              Show all settings
            </SettingButton>
          ) : (
          <>
          <ProviderSection
            title="Chat"
            openUnlessConnected
            idPrefix="chat-setup"
            keyTarget="chat"
            provider={config.chatProvider}
            options={LLM_OPTIONS}
            onProvider={(v) => onChange(withChatProviderDefaults(config, v as AiConfig['chatProvider']))}
            baseUrl={config.chatBaseUrl}
            onBaseUrl={(v) => set('chatBaseUrl', v)}
            showKey={config.chatProvider === 'openai'}
            apiKey={config.chatApiKey}
            hasKey={!!config.hasChatApiKey}
            onKey={(v) => set('chatApiKey', v)}
            modelLabel="Chat model"
            model={config.chatModel}
            onModel={(v) => set('chatModel', v)}
            historyKey="chat"
            testTarget="chat"
            presets={<PresetBar section="chat" config={config} />}
            extra={
              <SettingField
                stacked
                label="System prompt for this chat setup"
                htmlFor={`${uid}-chat-prompt`}
                hint="Used instead of the global prompt (How the AI answers → Chat defaults) while this setup is active."
              >
                <DraftText
                  multiline
                  id={`${uid}-chat-prompt`}
                  className={`${settingInputClass} ${styles.textarea}`}
                  rows={4}
                  aria-describedby={hintId(`${uid}-chat-prompt`)}
                  value={config.chatSystemPrompt}
                  onCommit={(v) => set('chatSystemPrompt', v)}
                />
              </SettingField>
            }
          />

          <ProviderSection
            title="Search by meaning"
            keyTarget="embedding"
            hint="Lets Jnana search your notes by meaning. Runs well locally with Ollama, even alongside a cloud chat model."
            provider={config.embeddingProvider}
            options={LLM_OPTIONS}
            onProvider={(v) => onChange(withEmbeddingProviderDefaults(config, v as AiConfig['embeddingProvider']))}
            baseUrl={config.embeddingBaseUrl}
            onBaseUrl={(v) => set('embeddingBaseUrl', v)}
            showKey={config.embeddingProvider === 'openai'}
            apiKey={config.embeddingApiKey}
            hasKey={!!config.hasEmbeddingApiKey}
            onKey={(v) => set('embeddingApiKey', v)}
            modelLabel="Search model"
            modelHint="The embedding model, e.g. nomic-embed-text."
            model={config.embeddingModel}
            onModel={(v) => set('embeddingModel', v)}
            historyKey="embedding"
            testTarget="embedding"
            presets={<PresetBar section="embedding" config={config} onReindex={() => onReindex(notes)} />}
            extra={
              <div className={styles.card}>
                <p className={styles.statusLine}>
                  {plural(stats.indexedNoteCount, 'note')} indexed, split into {plural(stats.chunkCount, 'searchable passage')}.
                  {!indexing && !indexBlocker && staleNotes.length === 0 && stats.indexedNoteCount > 0 && ' Everything is up to date.'}
                </p>
                <SettingActions>
                  <SettingButton
                    disabled={!!indexing || !!indexBlocker}
                    aria-describedby={indexBlocker ? `${uid}-index-why` : undefined}
                    onClick={() => onReindex(notes)}
                  >
                    {indexing ? `Indexing ${indexing.done}/${indexing.total}…` : `Index all notes (${notes.length})`}
                  </SettingButton>
                  {!indexing && staleNotes.length > 0 && (
                    <SettingButton variant="primary" onClick={() => onReindex(staleNotes)}>
                      Index {staleNotes.length} updated
                    </SettingButton>
                  )}
                </SettingActions>
                {indexBlocker && (
                  <p id={`${uid}-index-why`} className={styles.statusLine}>
                    {indexBlocker}
                  </p>
                )}
              </div>
            }
          />

          <ProviderSection
            title="Transcription"
            keyTarget="transcription"
            hint="Used by the Transcribe button under an audio clip; runs in the background."
            provider={config.transcriptionProvider}
            options={[
              { value: 'openai', label: 'OpenAI Whisper (cloud)' },
              { value: 'local', label: 'Local Whisper server' },
            ]}
            onProvider={(v) => onChange(withTranscriptionProviderDefaults(config, v as AiConfig['transcriptionProvider']))}
            baseUrl={config.transcriptionBaseUrl}
            onBaseUrl={(v) => set('transcriptionBaseUrl', v)}
            showKey={config.transcriptionProvider === 'openai'}
            apiKey={config.transcriptionApiKey}
            hasKey={!!config.hasTranscriptionApiKey}
            onKey={(v) => set('transcriptionApiKey', v)}
            modelLabel="Model"
            model={config.transcriptionModel}
            onModel={(v) => set('transcriptionModel', v)}
            historyKey="transcription"
            presets={<PresetBar section="transcription" config={config} />}
          />

          <ProviderSection
            title="Deep research"
            keyTarget="deepResearch"
            hint="Powers the Deep research toggle in AI chat. Leave the model blank to use your chat model."
            provider={config.deepResearchProvider}
            options={LLM_OPTIONS}
            onProvider={(v) => onChange(withDeepResearchProviderDefaults(config, v as AiConfig['deepResearchProvider']))}
            baseUrl={config.deepResearchBaseUrl}
            onBaseUrl={(v) => set('deepResearchBaseUrl', v)}
            showKey={config.deepResearchProvider === 'openai'}
            apiKey={config.deepResearchApiKey}
            hasKey={!!config.hasDeepResearchApiKey}
            onKey={(v) => set('deepResearchApiKey', v)}
            modelLabel="Deep research model"
            model={config.deepResearchModel}
            onModel={(v) => set('deepResearchModel', v)}
            historyKey="deepResearch"
            testTarget="deepResearch"
            presets={<PresetBar section="deepResearch" config={config} />}
          />

          <WebSearchSection config={config} set={set} />
          </>
          )}
        </>
      )}
    </SettingPanel>
  )
}
