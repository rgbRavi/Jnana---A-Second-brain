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

export async function syncLinksForNote(noteId: string, content: string): Promise<void> {
  // Parse every [[wikilink]] in the current content
  const linkMatches = content.match(/\[\[(.*?)\]\]/g) ?? []
  const linkedTitles = new Set(
    linkMatches.map((m) => m.slice(2, -2).trim().toLowerCase())
  )

  const [allNotes, allLinks] = await Promise.all([getAllNotes(), getAllLinks()])

  // Resolve wikilink titles → note IDs (skip self-links)
  const targetIds = new Set<string>()
  for (const title of linkedTitles) {
    const target = allNotes.find((n) => n.title.trim().toLowerCase() === title)
    if (target && target.id !== noteId) {
      targetIds.add(target.id)
    }
  }

  // Find only OUTBOUND links from noteId (where noteId is from_id).
  // getAllLinks() returns [from_id, to_id] pairs — we filter to only
  // rows where this note is the source. This avoids the bidirectional
  // getLinks() which returns both directions and would cause us to
  // incorrectly remove links created by other notes pointing to noteId.
  const outboundIds = new Set(
    allLinks
      .filter(([from]) => from === noteId)
      .map(([, to]) => to)
  )

  // Add new links (in content but not yet in DB)
  for (const id of targetIds) {
    if (!outboundIds.has(id)) {
      await createLink(noteId, id).catch(() => {})
    }
  }

  // Remove stale outbound links (stored in DB but no longer in content)
  for (const id of outboundIds) {
    if (!targetIds.has(id)) {
      await removeLink(noteId, id).catch(() => {})
    }
  }
}