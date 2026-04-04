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
  mediaType: 'pdf' | 'video' | 'youtube' | 'audio'
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