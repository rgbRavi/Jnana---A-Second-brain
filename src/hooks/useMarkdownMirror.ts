// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useEffect } from 'react'
import type { Note } from '../types'
import { eventBus } from '../lib/eventBus'
import { mirrorNote, unmirrorNote, remirror } from '../core/mirror'
import { useGeneralSettings } from './useGeneralSettings'

/** Changes that move notes between the mirror's vault/folder directories. */
const TREE_EVENTS = ['vault:changed', 'vault:deleted', 'folder:changed', 'folder:deleted', 'folder:moved', 'note:moved']
/** A drag or a bulk move fires a burst of these; re-mirror once after it settles. */
const TREE_DEBOUNCE_MS = 300

/**
 * Keeps the Markdown mirror folder (Settings → Import / Export) in step with
 * saves and deletes. Mounted once in AppLayout. Runs after the save and never
 * blocks it; core/mirror.ts reports failures.
 */
export function useMarkdownMirror(): void {
  const [{ mirrorDir }] = useGeneralSettings()
  useEffect(() => {
    if (!mirrorDir) return
    const onSaved = (note: Note) => void mirrorNote(mirrorDir, note)
    const onDeleted = ({ id }: { id: string }) => void unmirrorNote(mirrorDir, id)
    // Converting to a type without a markdown form (e.g. canvas) drops its file.
    const onKind = ({ noteId, kind }: { noteId: string; kind: string | null }) => {
      if (kind) void unmirrorNote(mirrorDir, noteId)
    }
    let timer: number | undefined
    const onTree = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => void remirror(mirrorDir), TREE_DEBOUNCE_MS)
    }
    eventBus.on('note:saved', onSaved)
    eventBus.on('note:deleted', onDeleted)
    eventBus.on('note:kind-changed', onKind)
    TREE_EVENTS.forEach((e) => eventBus.on(e, onTree))
    return () => {
      window.clearTimeout(timer)
      eventBus.off('note:saved', onSaved)
      eventBus.off('note:deleted', onDeleted)
      eventBus.off('note:kind-changed', onKind)
      TREE_EVENTS.forEach((e) => eventBus.off(e, onTree))
    }
  }, [mirrorDir])
}
