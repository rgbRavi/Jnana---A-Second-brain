// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useState } from 'react'
import type { AiConfig, IndexStats, Note } from '../../types'
import {
  withChatProviderDefaults,
  withEmbeddingProviderDefaults,
  withTranscriptionProviderDefaults,
  withDeepResearchProviderDefaults,
  getModelHistory,
  rememberModel,
  type ModelKind,
} from '../../core/ai'
import styles from './Ai.module.css'

interface Props {
  config: AiConfig
  onChange: (config: AiConfig) => void
  stats: IndexStats
  indexing: { done: number; total: number } | null
  notes: Note[]
  staleNotes: Note[]
  onReindex: (notes: Note[]) => void
}

interface ProviderSectionProps {
  title: string
  hint?: string
  provider: string
  options: { value: string; label: string }[]
  onProvider: (value: string) => void
  baseUrl: string
  onBaseUrl: (value: string) => void
  /** Show the API-key field (cloud providers). */
  showKey: boolean
  apiKey: string
  hasKey: boolean
  onKey: (value: string) => void
  modelLabel: string
  model: string
  onModel: (value: string) => void
  /** Which model-name history bucket feeds this field's dropdown. */
  historyKey?: ModelKind
}

/** A reusable provider block: backend select + base URL + (optional) key + model.
 *  The model field is a combobox — free text plus a dropdown of names used before. */
function ProviderSection(p: ProviderSectionProps) {
  const [suggestions, setSuggestions] = useState<string[]>(() =>
    p.historyKey ? getModelHistory(p.historyKey) : [],
  )
  const listId = p.historyKey ? `models-${p.historyKey}` : undefined
  const commitModel = () => {
    if (p.historyKey && p.model.trim()) {
      rememberModel(p.historyKey, p.model)
      setSuggestions(getModelHistory(p.historyKey))
    }
  }
  return (
    <section className={styles.providerSection}>
      <h3 className={styles.subhead}>{p.title}</h3>
      {p.hint && <p className={styles.hint}>{p.hint}</p>}
      <div className={styles.fields}>
        <div className={styles.field}>
          <label className={styles.label}>Backend</label>
          <select className={styles.select} value={p.provider} onChange={(e) => p.onProvider(e.target.value)}>
            {p.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Base URL</label>
          <input className={styles.input} value={p.baseUrl} onChange={(e) => p.onBaseUrl(e.target.value)} />
        </div>

        {p.showKey && (
          <div className={`${styles.field} ${styles.fieldWide}`}>
            <label className={styles.label}>API key</label>
            <input
              className={styles.input}
              type="password"
              placeholder={p.hasKey ? '•••••• saved — type to replace' : 'sk-...'}
              value={p.apiKey}
              onChange={(e) => p.onKey(e.target.value)}
            />
          </div>
        )}

        <div className={`${styles.field} ${styles.fieldWide}`}>
          <label className={styles.label}>{p.modelLabel}</label>
          <input
            className={styles.input}
            value={p.model}
            list={listId}
            placeholder="Type or pick a model…"
            onChange={(e) => p.onModel(e.target.value)}
            onBlur={commitModel}
          />
          {listId && (
            <datalist id={listId}>
              {suggestions.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          )}
        </div>
      </div>
    </section>
  )
}

const LLM_OPTIONS = [
  { value: 'ollama', label: 'Ollama (local)' },
  { value: 'openai', label: 'OpenAI-compatible (cloud)' },
]

/**
 * AI provider settings: chat (LLM), embeddings, and transcription are each
 * configured independently — so you can, for example, embed locally with
 * Ollama while chatting through an online API.
 */
export function AiSettingsPanel({ config, onChange, stats, indexing, notes, staleNotes, onReindex }: Props) {
  const set = <K extends keyof AiConfig>(key: K, value: AiConfig[K]) => onChange({ ...config, [key]: value })

  return (
    <>
      <div className={styles.row}>
        <label className={styles.toggle}>
          <input type="checkbox" checked={config.enabled} onChange={(e) => set('enabled', e.target.checked)} />
          Enable AI
        </label>
        <label className={styles.toggle}>
          <input type="checkbox" checked={config.autoIndex} onChange={(e) => set('autoIndex', e.target.checked)} />
          Auto-index on save
        </label>
      </div>

      <ProviderSection
        title="Chat (LLM)"
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
      />

      <ProviderSection
        title="Embeddings"
        hint="Embedding models are small and run well locally — pick Ollama here to index offline even while using a cloud chat model."
        provider={config.embeddingProvider}
        options={LLM_OPTIONS}
        onProvider={(v) => onChange(withEmbeddingProviderDefaults(config, v as AiConfig['embeddingProvider']))}
        baseUrl={config.embeddingBaseUrl}
        onBaseUrl={(v) => set('embeddingBaseUrl', v)}
        showKey={config.embeddingProvider === 'openai'}
        apiKey={config.embeddingApiKey}
        hasKey={!!config.hasEmbeddingApiKey}
        onKey={(v) => set('embeddingApiKey', v)}
        modelLabel="Embedding model"
        model={config.embeddingModel}
        onModel={(v) => set('embeddingModel', v)}
        historyKey="embedding"
      />

      <div className={styles.row}>
        <span className={styles.statsLine}>
          {stats.indexedNoteCount} notes · {stats.chunkCount} chunks indexed
        </span>
      </div>
      <div className={styles.row}>
        <button className={styles.btn} disabled={!config.enabled || !!indexing} onClick={() => onReindex(notes)}>
          {indexing ? `Indexing ${indexing.done}/${indexing.total}…` : `Index all notes (${notes.length})`}
        </button>
        {config.enabled && !indexing && staleNotes.length > 0 && (
          <>
            <button className={styles.btnPrimary} onClick={() => onReindex(staleNotes)}>
              Index {staleNotes.length} updated
            </button>
            <span className={styles.statsLine}>{staleNotes.length} need (re)indexing</span>
          </>
        )}
      </div>

      <ProviderSection
        title="Transcription"
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
      />

      <ProviderSection
        title="Deep research"
        hint="Optional. Used by the AI-Chat 'Deep research' toggle. Set a model to route deep-research requests to a dedicated endpoint/model; leave the model blank to fall back to a system-prompt directive on the normal chat model."
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
      />
    </>
  )
}
