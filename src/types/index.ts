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

/** A persisted AI-chat conversation (history). `messages`/`scope` are JSON strings. */
export interface StoredConversation {
  id: string
  /** "focused" | "chat" */
  mode: string
  title: string
  messages: string
  scope: string | null
  /** Owning project (AI Chat), or null. */
  projectId: string | null
  createdAt: number
  updatedAt: number
}

/** Lightweight conversation summary for the history list. */
export interface ConversationMeta {
  id: string
  mode: string
  title: string
  projectId: string | null
  updatedAt: number
}

/** An AI Project: custom instructions + a knowledge base that grounds its chats. */
export interface AiProject {
  id: string
  name: string
  description: string
  instructions: string
  createdAt: number
  updatedAt: number
}

/** One knowledge item attached to a project. */
export interface ProjectKnowledge {
  id: string
  projectId: string
  /** "note" | "file" */
  kind: 'note' | 'file'
  /** note id, or asset filename */
  refId: string
  label: string
  createdAt: number
}

/** A reusable AI preset: a response Style or a Skill. Both augment the system prompt. */
export type PresetKind = 'style' | 'skill'

export interface AiPreset {
  id: string
  kind: PresetKind
  name: string
  description: string
  /** The instruction text prepended to the system prompt when selected. */
  body: string
  createdAt: number
  updatedAt: number
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

/** Transcription backend: OpenAI cloud, or a local OpenAI-compatible Whisper server. */
export type TranscriptionProviderKind = 'openai' | 'local'

/**
 * User-configurable AI settings. Persisted on the Rust side (ai_config.json
 * in the app data dir) so API keys never live in browser-reachable storage.
 *
 * Chat and embeddings are configured independently so you can, e.g., run a
 * local embedding model (Ollama) while using an online chat API. Keys are
 * write-only: always empty when loaded; saving an empty string keeps the
 * stored key unless that provider's baseUrl/provider changed (then it's
 * dropped so it can't be redirected to a host it wasn't entered for).
 */
export interface AiConfig {
  enabled: boolean
  /** Re-embed notes automatically on save when true. */
  autoIndex: boolean

  // ── Chat (LLM) provider ──
  chatProvider: AiProviderKind
  chatBaseUrl: string
  chatApiKey: string
  hasChatApiKey?: boolean
  chatModel: string

  // ── Embedding provider (independent of chat) ──
  embeddingProvider: AiProviderKind
  embeddingBaseUrl: string
  embeddingApiKey: string
  hasEmbeddingApiKey?: boolean
  embeddingModel: string

  // ── Transcription (configured separately too) ──
  transcriptionProvider: TranscriptionProviderKind
  transcriptionBaseUrl: string
  /** Write-only, same rules as apiKey. Empty for local servers. */
  transcriptionApiKey: string
  transcriptionModel: string
  /** Whether a transcription key is currently saved Rust-side. */
  hasTranscriptionApiKey?: boolean
  /** Auto-transcribe audio when recorded/imported, inserting the text into the note. */
  transcribeOnRecord: boolean

  // ── Deep research (its own endpoint; optional) ──
  // When deepResearchModel is set, the AI-Chat "Deep research" toggle routes
  // requests here; otherwise it falls back to a system-prompt directive.
  deepResearchProvider: AiProviderKind
  deepResearchBaseUrl: string
  /** Write-only, same rules as the other keys. */
  deepResearchApiKey: string
  deepResearchModel: string
  hasDeepResearchApiKey?: boolean
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

/** When a note was last embedded (latest chunk `created_at`, ms). */
export interface IndexTime {
  noteId: string
  indexedAt: number
}

/** An AI-suggested tag for a note. `isNew` = not already in the user's vocabulary. */
export interface TagSuggestion {
  tag: string
  reason: string
  isNew: boolean
}

/** An AI-suggested wikilink to a related note, with the matching passage as evidence. */
export interface LinkSuggestion {
  noteId: string
  title: string
  evidence: string
  score: number
}

/** A single quiz question generated from the user's notes. */
export interface QuizQuestion {
  /** recall | application | compare — a hint at the question's type. */
  kind: string
  question: string
  answer: string
  explanation: string
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