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
  label?: string
}

export interface MediaRef {
  type: 'pdf' | 'video' | 'youtube'
  url: string
  noteId: string
}

export interface TimestampNote {
  mediaRef: MediaRef
  timestamp: number
  content: string
}

export interface Plugin {
  id: string
  name: string
  version: string
  init: (bus: import('../lib/eventBus').EventBus) => void
  destroy: () => void
}

export type AppEvent =
  | { type: 'note:saved';        payload: Note }
  | { type: 'note:opened';       payload: Note }
  | { type: 'note:deleted';      payload: { id: string } }
  | { type: 'link:created';      payload: Link }
  | { type: 'link:removed';      payload: Link }
  | { type: 'video:timestamp';   payload: TimestampNote }
  | { type: 'pdf:highlight';     payload: { noteId: string; text: string } }
  | { type: 'search:query';      payload: { query: string } }
  | { type: 'plugin:registered'; payload: { id: string } }