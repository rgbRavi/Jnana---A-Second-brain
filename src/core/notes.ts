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

export async function getLinks(noteId: string): Promise<string[]> {
  return invoke<string[]>('get_links', { noteId })
}

export async function getAllLinks(): Promise<[string, string][]> {
  return invoke<[string, string][]>('get_all_links')
}

export async function createLink(fromId: string, toId: string): Promise<void> {
  await invoke<void>('create_link', { fromId, toId })
  eventBus.emit('link:created', { fromId, toId })
}

export async function removeLink(fromId: string, toId: string): Promise<void> {
  await invoke<void>('remove_link', { fromId, toId })
  eventBus.emit('link:removed', { fromId, toId })
}

export async function uploadAsset(bytes: Uint8Array, extension: string): Promise<string> {
  const filename = await invoke<string>('save_asset', { bytes: Array.from(bytes), extension })
  return `jnana-asset://${filename}`
}

export async function getAssetBlob(filename: string): Promise<Blob> {
  const bytes = await invoke<number[]>('get_asset', { filename })
  return new Blob([new Uint8Array(bytes)])
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

export async function syncLinksForNote(noteId: string, content: string): Promise<void> {
  const linkMatches = content.match(/\[\[(.*?)\]\]/g) || []
  const linkedTitles = linkMatches.map((m) => m.slice(2, -2).trim().toLowerCase())

  if (linkedTitles.length === 0) return

  const allNotes = await getAllNotes()
  
  // Create links to matched notes
  for (const title of linkedTitles) {
    const targetNode = allNotes.find((n) => n.title.trim().toLowerCase() === title)
    if (targetNode && targetNode.id !== noteId) {
      // Backend automatically handles unique/primary key constraints if you attempt to add an existing link
      await createLink(noteId, targetNode.id).catch(() => {})
    }
  }
}