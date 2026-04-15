import { invoke } from '@tauri-apps/api/core'

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
 * Use this when you need to open the file in an external app via the Tauri opener plugin.
 */
export async function getAssetPath(filename: string): Promise<string> {
  return invoke<string>('get_asset_path', { filename })
}

/**
 * Fetch all media file paths associated with a note.
 */
export async function getMediaRefs(noteId: string): Promise<string[]> {
  return invoke<string[]>('get_media_refs', { noteId })
}
