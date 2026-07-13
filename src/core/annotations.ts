// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

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

/// Update an annotation's opaque `position` JSON (e.g. dragging a PDF text box
/// or ink stroke to a new spot). `update_annotation` only touches `content`, so
/// this is the symmetric command for position moves.
export async function updateAnnotationPosition(id: string, position: string): Promise<void> {
  await invoke<void>('update_annotation_position', { id, position })
  eventBus.emit('annotation:updated', { id, position })
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

/// Helper — build a PDF freehand-ink annotation payload.
/// points are [x, y, pressure] in PDF coordinate space (bottom-left origin) so
/// the stroke stays anchored across zoom; content is unused.
export function makePdfInkAnnotation(
  noteId: string,
  mediaId: string,
  page: number,
  points: [number, number, number][],
  color: string,
  size: number,
): Annotation {
  return {
    id: crypto.randomUUID(),
    noteId,
    mediaId,
    kind: 'pdf_ink',
    position: JSON.stringify({ page, points, color, size }),
    content: '',
    createdAt: Date.now(),
  }
}

/// Helper — build a PDF text-box annotation payload.
/// (x, y) is the box's top-left in PDF coordinate space; fontSize is in PDF
/// points; the typed text lives in `content`. `color` is optional — when
/// omitted the viewer auto-picks a colour that contrasts the page background.
export function makePdfTextAnnotation(
  noteId: string,
  mediaId: string,
  page: number,
  x: number,
  y: number,
  text: string,
  fontSize: number,
  color?: string,
): Annotation {
  return {
    id: crypto.randomUUID(),
    noteId,
    mediaId,
    kind: 'pdf_text',
    position: JSON.stringify({ page, x, y, fontSize, ...(color ? { color } : {}) }),
    content: text,
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