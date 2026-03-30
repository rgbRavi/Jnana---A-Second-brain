import { invoke } from '@tauri-apps/api/core'

/**
 * Import a video file from the native file system.
 * Uses the Tauri dialog to select a file, then copies it directly to APPDATA/jnana/assets/[UUID].mp4
 * Returns the UUID filename for use in markdown.
 */
export async function importVid(filePath: string, noteId: string): Promise<string> {
  const filename = await invoke<string>('import_vid', { filePath, noteId })
  return filename
}

/**
 * Fetch all media references for a given note.
 */
export async function getMediaRefs(noteId: string): Promise<string[]> {
  return invoke<string[]>('get_media_refs', { noteId })
}
