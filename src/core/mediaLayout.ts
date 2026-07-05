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

/** Per-embed style shared by read-mode (NoteEmbeds.tsx) and the live editor's
 *  widgets (LiveEditor.decorations.tsx) so a saved size looks identical in both.
 *  Embeds are always `inline-block`, so consecutive ones on the same markdown
 *  line sit side by side (a row) and never get forced onto their own line.
 *  **Alignment is deliberately NOT applied here** — it's a property of the
 *  embed's row/paragraph, applied as `text-align` on the container (the CM6 line
 *  in the editor, the `<p>` in read-mode) via `alignmentTextAlign` below. That's
 *  what lets aligning a media in a row justify the whole row instead of breaking
 *  it out (the old `display:block` + margin behavior). */
export function mediaLayoutStyle(layout: MediaLayout | undefined): CSSProperties | undefined {
  if (!layout || (!layout.width && !layout.alignment)) return undefined
  const style: CSSProperties = { display: 'inline-block', verticalAlign: 'top', maxWidth: '100%' }
  if (layout.width) style.width = layout.width
  return style
}

/** The `text-align` value that justifies a media embed's container for a saved
 *  alignment. `MediaAlignment` values are already valid `text-align` keywords —
 *  this is the named seam both renderers use so the mapping lives in one place. */
export function alignmentTextAlign(alignment: MediaAlignment | undefined): MediaAlignment | undefined {
  return alignment
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
