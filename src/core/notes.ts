import { invoke, convertFileSrc } from '@tauri-apps/api/core'
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
  return invoke<string>('save_asset', { bytes: Array.from(bytes), extension })
}


export async function getAssetBlob(filename: string): Promise<Blob> {
  const bytes = await invoke<number[]>('get_asset', { filename })
  return new Blob([new Uint8Array(bytes)])
}

/** Copy a user-picked file (from a native dialog) into assets; returns the stored filename. */
export async function importFile(path: string): Promise<string> {
  return invoke<string>('import_file', { path })
}

/** Read a stored asset as a `data:<mime>;base64,...` URL (for vision/file model blocks). */
export async function getAssetDataUrl(filename: string, mime: string): Promise<string> {
  const bytes = await invoke<number[]>('get_asset', { filename })
  const blob = new Blob([new Uint8Array(bytes)], { type: mime })
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

export async function getAssetUrl(filename: string): Promise<string> {
  const absPath = await invoke<string>('get_asset_path', { filename })
  return convertFileSrc(absPath)
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

/**
 * Sync this note's outbound [[wikilinks]] with the links table. The diff
 * (title resolution, add/remove) runs inside SQLite via the `sync_links`
 * command — one IPC call instead of pulling every note and link over the
 * bridge on each save. Inbound links from other notes are preserved.
 */
export async function syncLinksForNote(noteId: string, content: string): Promise<void> {
  const linkMatches = content.match(/\[\[(.*?)\]\]/g) ?? []
  const titles = [...new Set(linkMatches.map((m) => m.slice(2, -2).trim().toLowerCase()))]

  const { added, removed } = await invoke<{ added: string[]; removed: string[] }>(
    'sync_links',
    { noteId, titles },
  )

  for (const toId of added) eventBus.emit('link:created', { fromId: noteId, toId })
  for (const toId of removed) eventBus.emit('link:removed', { fromId: noteId, toId })
}

export async function getFavouriteNoteIds(): Promise<string[]> {
  return invoke<string[]>('get_favourite_note_ids')
}

export async function addFavourite(noteId: string): Promise<void> {
  return invoke<void>('add_favourite', { noteId })
}

export async function removeFavourite(noteId: string): Promise<void> {
  return invoke<void>('remove_favourite', { noteId })
}

