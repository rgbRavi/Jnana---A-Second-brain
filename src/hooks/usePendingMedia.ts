import { useRef } from 'react'
import { registerMediaRef } from '../core/media'

type PendingMedia = { filename: string; type: 'video' | 'pdf' | 'image' | 'youtube' | 'audio' }

export function usePendingMedia() {
  const pendingMedia = useRef<PendingMedia[]>([])

  const addPendingMedia = (filename: string, type: 'video' | 'pdf' | 'image' | 'youtube' | 'audio') => {
    pendingMedia.current.push({ filename, type })
  }

  const flushPendingMedia = async (noteId: string) => {
    for (const { filename, type } of pendingMedia.current) {
      await registerMediaRef(noteId, type, filename).catch((err) => {
        console.error('registerMediaRef failed:', err)
      })
    }
  }

  const resetPendingMedia = () => {
    pendingMedia.current = []
  }

  return { addPendingMedia, flushPendingMedia, resetPendingMedia }
}
