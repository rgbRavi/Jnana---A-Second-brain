// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import type { Note } from '../../types'
import { getNoteType } from '../../lib/noteTypes'
import { MarkdownLite } from './MarkdownLite'

/**
 * The single read-mode choke-point for a note. If a plugin has registered a type
 * for `note.kind`, its `View` renders; otherwise this is exactly `<MarkdownLite>`
 * — so the fallback path is byte-identical for plain markdown notes. Every place
 * that used to render `<MarkdownLite content={note.content} …>` should go through
 * here so a custom-typed note never shows its raw JSON content.
 *
 * `content` overrides `note.content` when a caller has a live draft (e.g. the
 * editor's reading preview); it defaults to the saved content.
 */
export function NoteView({
  note,
  content,
  lazy,
  fullscreen,
}: {
  note: Note
  content?: string
  lazy?: boolean
  fullscreen?: boolean
}) {
  const def = getNoteType(note)
  if (def) {
    const View = def.View
    return <View note={content != null ? { ...note, content } : note} />
  }
  return (
    <MarkdownLite
      content={content ?? note.content}
      noteId={note.id}
      lazy={lazy}
      fullscreen={fullscreen}
    />
  )
}

/**
 * The edit-mode choke-point for a *typed* note only. Renders the note type's
 * `Editor`. Callers first check `getNoteType(note)` and keep their existing
 * `<LiveEditor>` (plus toolbars, imperative ref, etc.) for plain notes — the CM6
 * editor path is untouched for the common case.
 */
export function NoteTypeEditor({
  note,
  value,
  onChange,
}: {
  note: Note
  value: string
  onChange: (next: string) => void
}) {
  const def = getNoteType(note)
  if (!def) return null
  const Editor = def.Editor
  return <Editor note={note} value={value} onChange={onChange} />
}
