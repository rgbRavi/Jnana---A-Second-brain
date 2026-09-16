// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

/**
 * What kind of attachment a file is, decided from its **name**.
 *
 * Name, not MIME type: a file arriving by OS drag-and-drop is only ever a path,
 * and one arriving by clipboard paste frequently carries `application/octet-stream`
 * or no type at all. The import pipeline branches on the extension anyway.
 */

/** Stored and embedded as media. Matches `media_refs.type`. */
export type MediaKind = 'image' | 'video' | 'audio' | 'pdf'

/** Media, or a document that goes through the convert/extract/link importer. */
export type FileKind = MediaKind | 'document'

/** What the document importer can handle — also the file dialog's filter. */
export const DOCUMENT_EXTENSIONS = ['pdf', 'doc', 'docx', 'odt', 'csv', 'xlsx', 'xls']

/** Extensions that become an embed directly, no dialog. */
const MEDIA_EXTENSIONS: Record<MediaKind, string[]> = {
  image: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif'],
  video: ['mp4', 'webm', 'mov', 'avi', 'mkv', 'ogv'],
  // `.ogg` is far more often audio than video, so it lands here; `.ogv` is the
  // unambiguous video spelling and stays above.
  audio: ['mp3', 'wav', 'm4a', 'aac', 'flac', 'oga', 'ogg', 'opus'],
  pdf: ['pdf'],
}

/** A file's extension, lower-cased; '' when it has none. */
export const extensionOf = (name: string) =>
  name.includes('.') ? (name.split('.').pop() ?? '').toLowerCase() : ''

/** The last segment of a path, handling both separators (Windows gives `\`). */
export const basenameOf = (path: string) => path.split(/[\\/]/).pop() || path

/**
 * How to import `name`, or null if Jnana has nothing to do with it.
 *
 * Media wins over documents, so a PDF is embedded straight away rather than
 * prompting — matching what the toolbar's document button already does with one.
 */
export function classifyFile(name: string): FileKind | null {
  const ext = extensionOf(name)
  if (!ext) return null
  for (const kind of Object.keys(MEDIA_EXTENSIONS) as MediaKind[]) {
    if (MEDIA_EXTENSIONS[kind].includes(ext)) return kind
  }
  return DOCUMENT_EXTENSIONS.includes(ext) ? 'document' : null
}
