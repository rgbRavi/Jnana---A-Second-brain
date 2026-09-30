// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useEffect } from 'react'
import type { Note } from '../types'
import { eventBus } from '../lib/eventBus'
import { mirrorNote, unmirrorNote } from '../core/mirror'
import { useGeneralSettings } from './useGeneralSettings'

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
    eventBus.on('note:saved', onSaved)
    eventBus.on('note:deleted', onDeleted)
    eventBus.on('note:kind-changed', onKind)
    return () => {
      eventBus.off('note:saved', onSaved)
      eventBus.off('note:deleted', onDeleted)
      eventBus.off('note:kind-changed', onKind)
    }
  }, [mirrorDir])
}
