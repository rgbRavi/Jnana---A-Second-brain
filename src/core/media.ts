// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { invoke } from '@tauri-apps/api/core'
import { openUrl } from '@tauri-apps/plugin-opener'
import type { RecentMedia } from '../types'
import type { NoteMedia } from './markdown/noteMedia'
import { eventBus } from '../lib/eventBus'

/**
 * Copy a media file into the assets directory.
 * Does NOT write to the DB — call registerMediaRef after the note is saved.
 */
export async function importMedia(filePath: string, noteId: string): Promise<string> {
  return invoke<string>('import_media', { filePath, noteId })
}

/**
 * Convert a document to PDF via LibreOffice/Pandoc, returning the path to the converted temp PDF.
 */
export async function convertToPdf(filePath: string): Promise<string> {
  return invoke<string>('convert_to_pdf', { filePath })
}

/**
 * Extract plain text from a document via Pandoc.
 */
export async function extractText(filePath: string): Promise<string> {
  return invoke<string>('extract_text', { filePath })
}

/**
 * Read a data file as CSV text for the "insert as editable table" import:
 * `.csv`/`.tsv`/`.txt` directly, `.xlsx`/`.xls` converted (first sheet) via
 * LibreOffice. Throws if the spreadsheet converter isn't available.
 */
export async function readTableFile(filePath: string): Promise<string> {
  return invoke<string>('read_table_file', { filePath })
}

/**
 * Insert a media_refs row for a file that has already been copied to assets.
 * Call this only after save_note has succeeded, so the FK constraint is satisfied.
 */
export async function registerMediaRef(
  noteId: string,
  mediaType: string,
  filename: string,
): Promise<void> {
  return invoke<void>('register_media_ref', { noteId, mediaType, filename })
}

/**
 * Resolve an asset filename (UUID.ext) to its absolute OS path inside the assets dir.
 */
export async function getAssetPath(filename: string): Promise<string> {
  return invoke<string>('get_asset_path', { filename })
}

/**
 * Open an app-managed asset in the OS default application. Goes through the
 * `open_asset` command rather than the opener plugin's `openPath`: that one is
 * scope-checked against an allow-list that's empty by design (widening it would
 * let the WebView launch *any* path), while `open_asset` refuses anything
 * outside the assets dir.
 */
export async function openAssetFile(filename: string): Promise<void> {
  await invoke('open_asset', { path: await getAssetPath(filename) })
}

/**
 * Open one of a note's embedded media (see core/markdown/noteMedia.ts). A PDF
 * opens in the in-app viewer (keeps its markup); other assets and document
 * chips open in the OS default app via `open_asset`, which only opens files
 * inside the assets dir; web embeds open in the browser.
 */
export async function openNoteMedia(media: NoteMedia, noteId: string): Promise<void> {
  if (media.kind === 'pdf' && media.source === 'asset') {
    eventBus.emit('pdf:open', { filename: media.target, noteId, page: 1, x: -1, y: -1 })
  } else if (media.source === 'url') {
    await openUrl(media.target)
  } else {
    if (media.source === 'asset') await openAssetFile(media.target)
    else await invoke('open_asset', { path: media.target })
  }
}

/**
 * Fetch all media file paths associated with a note.
 */
export async function getMediaRefs(noteId: string): Promise<string[]> {
  return invoke<string[]>('get_media_refs', { noteId })

}

/**
 * Media kinds a note still embeds. Pass `content` when re-tagging a note whose
 * edit hasn't been saved yet — otherwise the check runs against the stored text
 * and reports media the user just deleted.
 */
export async function getMediaTypes(noteId: string, content?: string): Promise<string[]> {
  return invoke<string[]>('get_media_types', { noteId, content: content ?? null })
}

/** Most-recently imported media across the whole vault (for the dashboard). */
export async function recentMedia(limit = 12, vaultId?: string | null): Promise<RecentMedia[]> {
  return invoke<RecentMedia[]>('recent_media', { limit, vaultId: vaultId ?? null })
}