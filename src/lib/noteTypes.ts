// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import type { ComponentType } from 'react'
import type { LucideIcon } from 'lucide-react'
import type { Note } from '../types'

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
}

const registry = new Map<string, NoteTypeDefinition>()

/** Register a note type. Idempotent per id (last registration wins with a warn),
 *  matching `pluginRegistry`'s tolerance of StrictMode double-invoke. */
export function registerNoteType(def: NoteTypeDefinition): void {
  if (registry.has(def.id)) {
    console.warn(`Note type "${def.id}" is already registered; replacing.`)
  }
  registry.set(def.id, def)
}

export function unregisterNoteType(id: string): void {
  registry.delete(id)
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
