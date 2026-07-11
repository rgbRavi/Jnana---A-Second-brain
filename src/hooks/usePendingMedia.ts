// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useRef } from 'react'
import { registerMediaRef } from '../core/media'
import { toast } from '../lib/toast'

type PendingMedia = { filename: string; type: 'video' | 'pdf' | 'image' | 'youtube' | 'audio' }

export function usePendingMedia() {
  const pendingMedia = useRef<PendingMedia[]>([])

  const addPendingMedia = (filename: string, type: 'video' | 'pdf' | 'image' | 'youtube' | 'audio') => {
    pendingMedia.current.push({ filename, type })
  }

  const flushPendingMedia = async (noteId: string) => {
    for (const { filename, type } of pendingMedia.current) {
      // Surface failures: a swallowed error here means no media_refs row, which
      // silently drops the note's has:image/has:video/… auto-tags.
      await registerMediaRef(noteId, type, filename).catch((err) => {
        console.error('registerMediaRef failed:', err)
        toast.error(`Couldn't tag attached ${type}: ${String(err)}`)
      })
    }
  }

  const resetPendingMedia = () => {
    pendingMedia.current = []
  }

  return { addPendingMedia, flushPendingMedia, resetPendingMedia }
}
