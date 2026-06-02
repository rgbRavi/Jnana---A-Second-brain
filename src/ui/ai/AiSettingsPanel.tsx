import { useState } from 'react'
import type { AiConfig, AiProviderKind, IndexStats, Note } from '../../types'
import { withProviderDefaults } from '../../core/ai'
import styles from './Ai.module.css'

interface Props {
  config: AiConfig
  onChange: (config: AiConfig) => void
  stats: IndexStats
  indexing: { done: number; total: number } | null
  notes: Note[]
  onReindex: (notes: Note[]) => void
}

export function AiSettingsPanel({ config, onChange, stats, indexing, notes, onReindex }: Props) {
  const [open, setOpen] = useState(!config.enabled)

  const set = <K extends keyof AiConfig>(key: K, value: AiConfig[K]) =>
    onChange({ ...config, [key]: value })

  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader} onClick={() => setOpen((o) => !o)}>
        <span className={styles.panelTitle}>AI settings</span>
        <span className={`${styles.statusDot} ${config.enabled ? styles.statusOn : ''}`}>
          {config.enabled ? `● ${config.provider}` : '○ disabled'} {open ? '▾' : '▸'}
        </span>
      </div>

      {open && (
        <>
          <div className={styles.fields}>
            <div className={styles.field}>
              <label className={styles.label}>Provider</label>
              <select
                className={styles.select}
                value={config.provider}
                onChange={(e) => onChange(withProviderDefaults(config, e.target.value as AiProviderKind))}
              >
                <option value="ollama">Ollama (local)</option>
                <option value="openai">OpenAI-compatible (cloud)</option>
              </select>
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Base URL</label>
              <input
                className={styles.input}
                value={config.baseUrl}
                onChange={(e) => set('baseUrl', e.target.value)}
              />
            </div>

            {config.provider === 'openai' && (
              <div className={`${styles.field} ${styles.fieldWide}`}>
                <label className={styles.label}>API key</label>
                <input
                  className={styles.input}
                  type="password"
                  placeholder="sk-..."
                  value={config.apiKey}
                  onChange={(e) => set('apiKey', e.target.value)}
                />
              </div>
            )}

            <div className={styles.field}>
              <label className={styles.label}>Embedding model</label>
              <input
                className={styles.input}
                value={config.embeddingModel}
                onChange={(e) => set('embeddingModel', e.target.value)}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Chat model</label>
              <input
                className={styles.input}
                value={config.chatModel}
                onChange={(e) => set('chatModel', e.target.value)}
              />
            </div>
          </div>

          <div className={styles.row}>
            <label className={styles.toggle}>
              <input
                type="checkbox"
                checked={config.enabled}
                onChange={(e) => set('enabled', e.target.checked)}
              />
              Enable AI
            </label>
            <label className={styles.toggle}>
              <input
                type="checkbox"
                checked={config.autoIndex}
                onChange={(e) => set('autoIndex', e.target.checked)}
              />
              Auto-index on save
            </label>
            <span className={styles.statsLine}>
              {stats.indexedNoteCount} notes · {stats.chunkCount} chunks indexed
            </span>
          </div>

          <div className={styles.row}>
            <button
              className={styles.btn}
              disabled={!config.enabled || !!indexing}
              onClick={() => onReindex(notes)}
            >
              {indexing
                ? `Indexing ${indexing.done}/${indexing.total}…`
                : `Index all notes (${notes.length})`}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
