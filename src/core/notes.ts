import { invoke } from '@tauri-apps/api/core'
import type { Note } from '../types'
import { eventBus } from '../lib/eventBus'

export async function getAllNotes(): Promise<Note[]> {
  return invoke<Note[]>('get_all_notes')
}

export async function getNote(id: string): Promise<Note> {
  return invoke<Note>('get_note', { id })
}

export async function saveNote(note: Note): Promise<Note> {
  const saved = await invoke<Note>('save_note', { note })
  eventBus.emit('note:saved', saved)
  return saved
}

export async function deleteNote(id: string): Promise<void> {
  await invoke<void>('delete_note', { id })
  eventBus.emit('note:deleted', { id })
}

export function createNote(title: string = 'Untitled'): Note {
  return {
    id: crypto.randomUUID(),
    title,
    content: '',
    tags: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}