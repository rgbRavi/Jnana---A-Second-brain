// Rust-calling service for per-note media layout — presentation metadata
// (width/alignment/caption) for media embeds, kept out of the note's markdown
// in its own table. Mirrors the invoke pattern in core/themes.ts; `json` is
// opaque (frontend-owned shape), same treatment as canvas `data`/theme `json`.

import type { CSSProperties } from 'react'
import { invoke } from '@tauri-apps/api/core'

export type MediaAlignment = 'left' | 'center' | 'right'

export interface MediaLayout {
  /** Pixel width of the embed. Height follows from the media's own aspect ratio. */
  width?: number
  alignment?: MediaAlignment
  caption?: string
}

/** Shared by read-mode (NoteEmbeds.tsx) and the live editor's widgets
 *  (LiveEditor.decorations.tsx) so a saved size/alignment looks identical in
 *  both. No alignment + a width = `inline-block`, so consecutive narrow
 *  embeds in the same paragraph can sit side by side (CommonMark's normal
 *  inline-flow wrapping does the "fit multiple in a row" work for free). An
 *  explicit alignment instead forces the embed onto its own line, positioned
 *  by margin — the deliberate "stand alone, aligned" case. */
export function mediaLayoutStyle(layout: MediaLayout | undefined): CSSProperties | undefined {
  if (!layout || (!layout.width && !layout.alignment)) return undefined
  const style: CSSProperties = {}
  if (layout.width) style.width = layout.width
  if (layout.alignment) {
    style.display = 'block'
    if (layout.alignment === 'left') style.marginRight = 'auto'
    else if (layout.alignment === 'right') style.marginLeft = 'auto'
    else {
      style.marginLeft = 'auto'
      style.marginRight = 'auto'
    }
  } else {
    style.display = 'inline-block'
    style.verticalAlign = 'top'
  }
  return style
}

interface MediaLayoutRow {
  mediaKey: string
  json: string
}

/** All layout entries for a note, keyed by media_key. */
export async function getMediaLayout(noteId: string): Promise<Map<string, MediaLayout>> {
  const rows = await invoke<MediaLayoutRow[]>('get_media_layout', { noteId })
  const map = new Map<string, MediaLayout>()
  for (const row of rows) {
    try {
      map.set(row.mediaKey, JSON.parse(row.json) as MediaLayout)
    } catch {
      // Skip a corrupt row rather than failing the whole note's render.
    }
  }
  return map
}

export async function setMediaLayout(noteId: string, mediaKey: string, layout: MediaLayout): Promise<void> {
  await invoke('set_media_layout', { noteId, mediaKey, json: JSON.stringify(layout) })
}

const pending = new Map<string, ReturnType<typeof setTimeout>>()

/** Coalesces rapid calls (e.g. several resize/align gesture-ends in quick
 *  succession) into one write per `noteId:mediaKey`, off the note-save path. */
export function setMediaLayoutDebounced(noteId: string, mediaKey: string, layout: MediaLayout, delayMs = 400): void {
  const key = `${noteId}:${mediaKey}`
  const existing = pending.get(key)
  if (existing) clearTimeout(existing)
  pending.set(
    key,
    setTimeout(() => {
      pending.delete(key)
      void setMediaLayout(noteId, mediaKey, layout)
    }, delayMs),
  )
}
