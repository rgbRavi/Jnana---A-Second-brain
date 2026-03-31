// src/core/annotations.ts
import { invoke } from '@tauri-apps/api/core'
import type { Annotation } from '../types'
import { eventBus } from '../lib/eventBus'

export async function saveAnnotation(annotation: Annotation): Promise<Annotation> {
  const saved = await invoke<Annotation>('save_annotation', { annotation })
  eventBus.emit('annotation:created', saved)
  return saved
}

export async function getAnnotationsForNote(noteId: string): Promise<Annotation[]> {
  return invoke<Annotation[]>('get_annotations_for_note', { noteId })
}

export async function getAnnotationsForMedia(mediaId: string): Promise<Annotation[]> {
  return invoke<Annotation[]>('get_annotations_for_media', { mediaId })
}

export async function updateAnnotation(id: string, content: string): Promise<void> {
  await invoke<void>('update_annotation', { id, content })
  eventBus.emit('annotation:updated', { id, content })
}

export async function deleteAnnotation(id: string): Promise<void> {
  await invoke<void>('delete_annotation', { id })
  eventBus.emit('annotation:deleted', { id })
}

/// Helper — build a video timestamp annotation payload.
/// The position is stored as JSON so the video player can restore it.
export function makeVideoAnnotation(
  noteId: string,
  mediaId: string,
  seconds: number,
  content: string = '',
): Annotation {
  return {
    id: crypto.randomUUID(),
    noteId,
    mediaId,
    kind: 'video_timestamp',
    position: JSON.stringify({ seconds }),
    content,
    createdAt: Date.now(),
  }
}

/// Helper — build a PDF highlight annotation payload.
/// rect is [x, y, width, height] in PDF coordinate space (bottom-left origin).
export function makePdfAnnotation(
  noteId: string,
  mediaId: string,
  page: number,
  rect: [number, number, number, number],
  content: string = '',
): Annotation {
  return {
    id: crypto.randomUUID(),
    noteId,
    mediaId,
    kind: 'pdf_highlight',
    position: JSON.stringify({ page, rect }),
    content,
    createdAt: Date.now(),
  }
}

/// Helper — build an audio marker annotation payload.
export function makeAudioAnnotation(
  noteId: string,
  mediaId: string,
  seconds: number,
  content: string = '',
): Annotation {
  return {
    id: crypto.randomUUID(),
    noteId,
    mediaId,
    kind: 'audio_marker',
    position: JSON.stringify({ seconds }),
    content,
    createdAt: Date.now(),
  }
}