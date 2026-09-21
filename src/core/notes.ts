// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { invoke, convertFileSrc } from '@tauri-apps/api/core'
import type { Note, NoteProgress } from '../types'
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

/**
 * Set or clear a note's `kind`. A plain save never touches `kind`, so this is the
 * only way to un-type a note — used to rescue a typed note whose plugin is gone,
 * turning it back into ordinary markdown the app can always read.
 */
export async function setNoteKind(noteId: string, kind: string | null): Promise<void> {
  await invoke<void>('set_note_kind', { noteId, kind })
}

export async function deleteNote(id: string): Promise<void> {
  await invoke<void>('delete_note', { id })
  eventBus.emit('note:deleted', { id })
}

export interface TrashedNote {
  id: string
  title: string
  deletedAt: number
}

/** Soft-delete: move a note to Trash. Emits `note:deleted` so open tabs, the
 *  graph, and other views drop it — same app-facing effect as a hard delete. */
export async function trashNote(id: string): Promise<void> {
  await invoke<void>('trash_note', { id })
  eventBus.emit('note:deleted', { id })
}

/** Convert a blank note to another note type (e.g. canvas) with its starter
 *  content. Resolves `false` (and changes nothing) if the note isn't blank. */
export async function convertNoteKind(id: string, kind: string | null, content: string): Promise<boolean> {
  const ok = await invoke<boolean>('convert_note_kind', { id, kind, content })
  if (ok) eventBus.emit('note:kind-changed', { noteId: id, kind, content })
  return ok
}

/** Restore a trashed note; returns the full note so callers can re-surface it. */
export async function restoreNote(id: string): Promise<Note> {
  return invoke<Note>('restore_note', { id })
}

/** Trashed notes in one vault (Trash is vault-scoped, like the rest of the app). */
export async function listTrashedNotes(vaultId: string): Promise<TrashedNote[]> {
  return invoke<TrashedNote[]>('list_trashed_notes', { vaultId })
}

/** Permanently delete every trashed note in one vault. Returns the count removed. */
export async function emptyTrash(vaultId: string): Promise<number> {
  return invoke<number>('empty_trash', { vaultId })
}

/** Purge trashed notes older than `retentionDays` (<=0 = keep forever). Count removed. */
export async function purgeExpiredTrash(retentionDays: number): Promise<number> {
  return invoke<number>('purge_expired_trash', { retentionDays })
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

/**
 * Store raw bytes as an asset; returns the stored filename.
 *
 * Sent as a **raw IPC body**, not as a `{ bytes }` argument. Tauri encodes
 * command arguments as JSON, so a byte array would be serialized one number at
 * a time — `Array.from()` on a 50 MB video builds a 50-million-element JS array
 * and hundreds of megabytes of JSON, which freezes the webview. A raw body is
 * transferred as bytes. The extension travels in a header because the body slot
 * is taken by the payload.
 */
export async function uploadAsset(bytes: Uint8Array, extension: string): Promise<string> {
  return invoke<string>('save_asset', bytes, { headers: { 'x-extension': extension } })
}

/**
 * Write bytes to a temp file and return its path. Staging step for a pasted
 * document: the document import pipeline takes paths (conversion, extraction,
 * `external://` chips), so this lets a paste reuse it unchanged. Same raw-body
 * transport as `uploadAsset` — see the note there.
 */
export async function saveTempFile(bytes: Uint8Array, extension: string): Promise<string> {
  return invoke<string>('save_temp_file', bytes, { headers: { 'x-extension': extension } })
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

/** Persist how far through a note the user has read (0..1). */
export async function setNoteProgress(noteId: string, progress: number): Promise<void> {
  return invoke<void>('set_note_progress', { noteId, progress })
}

/** Reading progress for every note that has any (for the dashboard). */
export async function listNoteProgress(): Promise<NoteProgress[]> {
  return invoke<NoteProgress[]>('list_note_progress')
}

