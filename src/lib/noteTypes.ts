// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import type { ComponentType } from 'react'
import type { LucideIcon } from 'lucide-react'
import type { Note } from '../types'
import { renameWikilinks } from '../core/markdown/wikilinks'
import { extractNoteMedia, type NoteMedia } from '../core/markdown/noteMedia'

/** Props a note-type's read-mode View receives. */
export interface NoteViewProps {
  note: Note
}

/** Props a note-type's edit-mode Editor receives. `value`/`onChange` are the
 *  note's raw `content` string (the plugin owns its own serialization inside it),
 *  mirroring how `LiveEditor` is driven. */
export interface NoteEditorProps {
  note: Note
  value: string
  onChange: (next: string) => void
}

/**
 * A plugin-supplied note type. A custom-typed note is still an ordinary `Note`
 * (its data lives in `note.content`), so it keeps riding folders/vaults/graph/
 * export/search for free — only presentation + editing are swapped. Registered
 * via a plugin's `ctx.registerNoteType(...)`; the app looks one up by `note.kind`.
 */
export interface NoteTypeDefinition {
  /** Stable id; matched against `note.kind`. */
  id: string
  /** Human label (used in "New {label}" commands and the card type badge). */
  label: string
  /** Optional lucide icon for menus/badges. */
  icon?: LucideIcon
  /** Read-mode renderer (replaces `MarkdownLite`). */
  View: ComponentType<NoteViewProps>
  /** Edit-mode surface (replaces `LiveEditor`). */
  Editor: ComponentType<NoteEditorProps>
  /** Plain-text projection of the note for search/RAG indexing + card previews,
   *  so a JSON-content note indexes its real text instead of raw JSON. */
  toSearchText?: (note: Note) => string
  /** Markdown projection for export; falls back to the raw content when absent. */
  toExportMarkdown?: (note: Note) => string
  /** Initial `content` for a freshly-created note of this kind. */
  newContent?: () => string
  /** Markdown-ish text carrying this note's outbound `[[wikilinks]]` (link sync,
   *  graph, backlinks). `titleOf` resolves a note id to its title, for types that
   *  reference notes by id. Absent = the type has no links (its raw JSON content
   *  is never scanned — e.g. `[[x,y]]` point arrays would mis-parse as links). */
  toLinkText?: (note: Pick<Note, 'content'>, titleOf: (id: string) => string | undefined) => string
  /** Return `content` with `[[from]]` links rewritten to `[[to]]` (a note rename's
   *  "update links"); return it unchanged when nothing matched. Absent = no
   *  rewritable links. */
  renameLinks?: (content: string, from: string, to: string) => string
  /** Media this note uses, for the Links panel's "Attached media". Absent = none. */
  toMedia?: (note: Pick<Note, 'content'>) => NoteMedia[]
}

const registry = new Map<string, NoteTypeDefinition>()

// Bumped on any registry change so views resolving a note's type (NoteView /
// NoteTypeEditor) can re-render when a plugin is enabled/disabled/loaded live.
let version = 0
const listeners = new Set<() => void>()

function changed(): void {
  version += 1
  listeners.forEach((l) => l())
}

export function subscribeNoteTypes(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Stable snapshot for useSyncExternalStore — its identity changes on mutation. */
export function getNoteTypesVersion(): number {
  return version
}

/** Register a note type. Idempotent per id (last registration wins with a warn),
 *  matching `pluginRegistry`'s tolerance of StrictMode double-invoke. */
export function registerNoteType(def: NoteTypeDefinition): void {
  if (registry.has(def.id)) {
    console.warn(`Note type "${def.id}" is already registered; replacing.`)
  }
  registry.set(def.id, def)
  changed()
}

export function unregisterNoteType(id: string): void {
  if (registry.delete(id)) changed()
}

/** The definition for a note's `kind`, or `undefined` for a plain markdown note
 *  (or a `kind` whose plugin isn't loaded — callers fall back to markdown). */
export function getNoteType(note: Pick<Note, 'kind'>): NoteTypeDefinition | undefined {
  return note.kind ? registry.get(note.kind) : undefined
}

export function getNoteTypeById(id: string): NoteTypeDefinition | undefined {
  return registry.get(id)
}

export function listNoteTypes(): NoteTypeDefinition[] {
  return Array.from(registry.values())
}

/** Plain-text projection used by search/RAG/previews — the type's `toSearchText`
 *  if any, else the raw content (correct for plain markdown notes). */
export function noteSearchText(note: Note): string {
  return getNoteType(note)?.toSearchText?.(note) ?? note.content
}

/** The text to scan for a note's outbound `[[wikilinks]]`: raw content for a
 *  plain note, the type's `toLinkText` for a typed note, else nothing. A `kind`
 *  whose plugin isn't loaded also yields nothing (its content is opaque). */
export function noteLinkText(
  note: Pick<Note, 'content' | 'kind'>,
  titleOf: (id: string) => string | undefined,
): string {
  if (!note.kind) return note.content
  return getNoteType(note)?.toLinkText?.(note, titleOf) ?? ''
}

/** `note.content` with `[[from]]` rewritten to `[[to]]` — markdown for a plain
 *  note, the type's `renameLinks` for a typed one (unchanged if it has none). */
export function noteRenameLinks(note: Pick<Note, 'content' | 'kind'>, from: string, to: string): string {
  if (!note.kind) return renameWikilinks(note.content, from, to)
  return getNoteType(note)?.renameLinks?.(note.content, from, to) ?? note.content
}

/** Media a note uses: markdown embeds for a plain note, the type's `toMedia`
 *  for a typed one (none if it has no such hook). */
export function noteMedia(note: Pick<Note, 'content' | 'kind'>): NoteMedia[] {
  if (!note.kind) return extractNoteMedia(note.content)
  return getNoteType(note)?.toMedia?.(note) ?? []
}
