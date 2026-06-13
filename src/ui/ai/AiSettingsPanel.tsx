import type { AiConfig, AiProviderKind, IndexStats, Note, TranscriptionProviderKind } from '../../types'
import { withProviderDefaults, withTranscriptionProviderDefaults } from '../../core/ai'
import styles from './Ai.module.css'

interface Props {
  config: AiConfig
  onChange: (config: AiConfig) => void
  stats: IndexStats
  indexing: { done: number; total: number } | null
  notes: Note[]
  onReindex: (notes: Note[]) => void
}

/**
 * Body of the AI settings modal: provider/key/model fields plus index
 * controls. The modal owns show/hide, so this component no longer manages its
 * own collapsed state — it just renders the fields.
 */
export function AiSettingsPanel({ config, onChange, stats, indexing, notes, onReindex }: Props) {
  const set = <K extends keyof AiConfig>(key: K, value: AiConfig[K]) =>
    onChange({ ...config, [key]: value })

  return (
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
              placeholder={config.hasApiKey ? '•••••• saved — type to replace' : 'sk-...'}
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

      {/* ── Transcription (separate from chat — needs an OpenAI-compatible STT endpoint) ── */}
      <h3 className={styles.modalTitle} style={{ marginTop: '1.5rem', fontSize: '0.95rem' }}>
        Transcription
      </h3>
      <div className={styles.fields}>
        <div className={styles.field}>
          <label className={styles.label}>Backend</label>
          <select
            className={styles.select}
            value={config.transcriptionProvider}
            onChange={(e) =>
              onChange(withTranscriptionProviderDefaults(config, e.target.value as TranscriptionProviderKind))
            }
          >
            <option value="openai">OpenAI Whisper (cloud)</option>
            <option value="local">Local Whisper server</option>
          </select>
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Base URL</label>
          <input
            className={styles.input}
            value={config.transcriptionBaseUrl}
            onChange={(e) => set('transcriptionBaseUrl', e.target.value)}
          />
        </div>

        {config.transcriptionProvider === 'openai' && (
          <div className={`${styles.field} ${styles.fieldWide}`}>
            <label className={styles.label}>API key</label>
            <input
              className={styles.input}
              type="password"
              placeholder={config.hasTranscriptionApiKey ? '•••••• saved — type to replace' : 'sk-...'}
              value={config.transcriptionApiKey}
              onChange={(e) => set('transcriptionApiKey', e.target.value)}
            />
          </div>
        )}

        <div className={styles.field}>
          <label className={styles.label}>Model</label>
          <input
            className={styles.input}
            value={config.transcriptionModel}
            onChange={(e) => set('transcriptionModel', e.target.value)}
          />
        </div>
      </div>

      <p className={styles.hint}>
        Use the <strong>Transcribe</strong> button under an audio clip in a note to transcribe it
        in the background.
      </p>
    </>
  )
}
