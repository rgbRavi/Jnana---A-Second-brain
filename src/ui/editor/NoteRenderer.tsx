// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useSyncExternalStore } from 'react'
import { PuzzleIcon } from 'lucide-react'
import type { Note } from '../../types'
import { getNoteType, subscribeNoteTypes, getNoteTypesVersion } from '../../lib/noteTypes'
import { pluginRegistry } from '../../lib/pluginRegistry'
import { setNoteKind, saveNote } from '../../core/notes'
import { showConfirmDialog } from '../../lib/dialog'
import { toast } from '../../lib/toast'
import PluginErrorBoundary from '../PluginErrorBoundary'
import { MarkdownLite } from './MarkdownLite'
import Styles from './NoteRenderer.module.css'

/** Re-render when the note-type registry changes (plugin enabled/disabled/loaded),
 *  so an open note swaps between its custom view and the markdown fallback live. */
function useNoteTypesVersion(): number {
  return useSyncExternalStore(subscribeNoteTypes, getNoteTypesVersion)
}

/**
 * Shown when a note has a `kind` but no plugin is registered for it — disabled,
 * uninstalled, or failed to load. Without this the note would render its raw
 * serialization (a wall of JSON) with nothing to explain why, so the placeholder
 * names the missing type and keeps the raw content one disclosure away, so the
 * data is never hidden from its owner.
 */
const NEWLINE = String.fromCharCode(10)

function MissingNoteType({ note, content }: { note: Note; content: string }) {
  /** Last resort when the plugin is gone for good: drop the `kind` so the note
   *  becomes ordinary markdown. JSON content is fenced so it stays readable (and
   *  copyable) instead of being mangled by the markdown renderer. */
  const convert = async () => {
    const ok = await showConfirmDialog({
      title: 'Convert to a markdown note?',
      message:
        `This note needs the plugin that provides "${note.kind}". Converting keeps its content but ` +
        `drops the special type, so the note works without the plugin — reinstalling it later won't ` +
        `restore the custom view.`,
      confirmLabel: 'Convert',
      danger: true,
    })
    if (!ok) return
    try {
      let next = content
      try {
        JSON.parse(content)
        next = ['```json', content, '```'].join(NEWLINE)
      } catch {
        /* not JSON — leave it as it is */
      }
      if (next !== content) await saveNote({ ...note, content: next, updatedAt: Date.now() })
      await setNoteKind(note.id, null)
      toast.success('Converted to a markdown note.')
    } catch (err) {
      toast.error('Could not convert: ' + String(err))
    }
  }

  return (
    <div className={Styles.missing}>
      <div className={Styles.missingHead}>
        <PuzzleIcon size={15} /> This note needs a plugin
      </div>
      <p className={Styles.missingHint}>
        It is a <span className={Styles.kind}>{note.kind}</span> note, and no loaded plugin provides
        that type. Enable or reinstall it in Settings → Plugins to see the note again.
      </p>
      <details className={Styles.raw}>
        <summary>Show raw content</summary>
        <pre>{content}</pre>
      </details>
      <button className={Styles.convert} onClick={() => void convert()}>
        Convert to a markdown note
      </button>
    </div>
  )
}

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
  const version = useNoteTypesVersion()
  const def = getNoteType(note)
  if (def) {
    const View = def.View
    // Keyed on the registry version so reloading the plugin clears a stuck crash.
    return (
      <PluginErrorBoundary key={version} name={def.label} pluginId={pluginRegistry.pluginIdForNoteType(def.id)}>
        <View note={content != null ? { ...note, content } : note} />
      </PluginErrorBoundary>
    )
  }
  if (note.kind) {
    return <MissingNoteType note={note} content={content ?? note.content} />
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
  const version = useNoteTypesVersion()
  const def = getNoteType(note)
  if (!def) return null
  const Editor = def.Editor
  return (
    <PluginErrorBoundary
      key={version}
      name={`${def.label} editor`}
      pluginId={pluginRegistry.pluginIdForNoteType(def.id)}
    >
      <Editor note={note} value={value} onChange={onChange} />
    </PluginErrorBoundary>
  )
}
