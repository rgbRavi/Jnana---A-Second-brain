export interface Note {
  id: string
  title: string
  content: string
  tags: string[]
  createdAt: number
  updatedAt: number
}

export interface Link {
  fromId: string
  toId: string
}

export interface MediaRef {
  id: string
  noteId: string
  mediaType: 'pdf' | 'video' | 'youtube' | 'audio' | 'image' | 'document'
  path: string
  meta: VideoMeta | PdfMeta | AudioMeta | {}
}

export interface VideoMeta {
  timestamps: TimestampEntry[]
}

export interface TimestampEntry {
  time: number
  noteText: string
}

export interface PdfMeta {
  annotations: PdfAnnotation[]
}

export interface PdfAnnotation {
  page: number
  rect: [number, number, number, number]
  text: string
}

export interface AudioMeta {
  transcript?: string
  markers: AudioMarker[]
}

export interface AudioMarker {
  time: number
  noteText: string
}


export interface Annotation {
  id: string
  noteId: string
  mediaId: string
  /** "video_timestamp" | "pdf_highlight" | "audio_marker" */
  kind: string
  /** JSON string — parsed by the UI based on kind */
  position: string
  content: string
  createdAt: number
}

// ─── AI / RAG layer ─────────────────────────────────────

/** Which family of API the provider speaks. */
export type AiProviderKind = 'openai' | 'ollama'

/**
 * User-configurable AI settings. Persisted on the Rust side (ai_config.json
 * in the app data dir) so the API key never lives in browser-reachable
 * storage. The same abstraction targets a cloud API or a local model.
 */
export interface AiConfig {
  enabled: boolean
  provider: AiProviderKind
  /** Base URL of the API, e.g. https://api.openai.com/v1 or http://localhost:11434 */
  baseUrl: string
  /**
   * Bearer key for cloud providers; ignored by local providers like Ollama.
   * Write-only: always empty when loaded. Saving an empty string keeps the
   * stored key, unless baseUrl/provider changed — that drops the key so it
   * can never be redirected to a host it wasn't entered for.
   */
  apiKey: string
  /** Whether a key is currently saved on the Rust side. */
  hasApiKey?: boolean
  embeddingModel: string
  chatModel: string
  /** Re-embed notes automatically on save when true. */
  autoIndex: boolean
}

/** A single embeddable slice of a note. */
export interface NoteChunk {
  chunkIndex: number
  chunkText: string
}

/** A chunk plus its embedding vector, ready to persist. */
export interface EmbeddedChunk extends NoteChunk {
  vector: number[]
}

/** One semantic-search match returned from the Rust vector store. */
export interface RetrievalHit {
  noteId: string
  chunkIndex: number
  chunkText: string
  score: number
}

export interface IndexStats {
  chunkCount: number
  indexedNoteCount: number
}

/** A source note the analyzer actually drew from (grounding, not hallucinated). */
export interface SourceNote {
  noteId: string
  title: string
}

/**
 * Structured output from the Thread/Day analyzer. Deliberately not free prose:
 * the UI renders each field as its own section, and `sourceNotes` is computed
 * from the retrieved notes (never from the model) so every analysis is grounded.
 */
export interface AnalysisResult {
  summary: string
  keyConcepts: string[]
  openQuestions: string[]
  weakSpots: string[]
  sourceNotes: SourceNote[]
}

/**
 * What to analyze: a topic (semantic), a time window (e.g. yesterday), or a
 * specific note — which also pulls in the notes it links to (its thread).
 */
export type AnalyzeInput =
  | { mode: 'topic'; query: string }
  | { mode: 'window'; since: number; until: number; label: string }
  | { mode: 'note'; noteId: string }

/**
 * The provider abstraction the rest of the AI layer codes against.
 * Concrete adapters (OpenAI-compatible, Ollama) implement it so features
 * never depend on a specific vendor.
 */
export interface AiProvider {
  readonly kind: AiProviderKind
  readonly embeddingModel: string
  /** Embed a batch of texts into vectors (one vector per input, same order). */
  embed(texts: string[]): Promise<number[][]>
  /** Generate a completion for a prompt. */
  complete(prompt: string, opts?: { system?: string; temperature?: number }): Promise<string>
}

export interface Plugin {
  id: string
  name: string
  version: string
  /** Set to true and provide workerUrl to run the plugin in an isolated Web Worker thread */
  worker?: boolean
  /** Required when worker: true. Use: new URL('./myPlugin.worker.ts', import.meta.url) */
  workerUrl?: URL
  /** Called with a sandboxed PluginBus for inline (non-worker) plugins */
  init?: (bus: import('../lib/eventBus').PluginBus) => void
  /** Called before the plugin is unregistered (inline plugins only) */
  destroy?: () => void
}

export type AppEvent =
  | { type: 'note:saved';        payload: Note }
  | { type: 'note:opened';       payload: Note }
  | { type: 'note:deleted';      payload: { id: string } }
  | { type: 'link:created';      payload: Link }
  | { type: 'link:removed';      payload: Link }
  | { type: 'video:timestamp';   payload: TimestampEntry & { noteId: string } }
  | { type: 'pdf:highlight';     payload: PdfAnnotation & { noteId: string } }
  | { type: 'search:query';      payload: { query: string } }
  | { type: 'plugin:registered';    payload: { id: string } }
  | { type: 'annotation:created';   payload: Annotation }
  | { type: 'annotation:updated';   payload: { id: string; content: string } }
  | { type: 'annotation:deleted';   payload: { id: string } }