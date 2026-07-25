// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { invoke } from '@tauri-apps/api/core'

/** Persist extracted text for a note's attachment (replaces prior text for that file). */
export async function saveAttachmentText(
  noteId: string,
  filename: string,
  text: string,
): Promise<void> {
  await invoke('save_attachment_text', { noteId, filename, text })
}

/** All extracted attachment text for one note, concatenated ('' if none). */
export async function getAttachmentText(noteId: string): Promise<string> {
  return invoke<string>('get_attachment_text', { noteId })
}

/** Every note's aggregated attachment text, as a noteId → text map. */
export async function getAllAttachmentText(): Promise<Map<string, string>> {
  const rows = await invoke<{ noteId: string; text: string }[]>('get_all_attachment_text')
  return new Map(rows.map((r) => [r.noteId, r.text]))
}
