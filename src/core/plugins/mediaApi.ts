// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { invoke } from '@tauri-apps/api/core'
import type { PluginMediaApi } from '../../lib/pluginApi'
import type { NoteMedia } from '../markdown/noteMedia'
import { extractNoteMedia } from '../markdown/noteMedia'
import { getActiveVaultId, noteInVault } from '../../lib/activeVault'
import { pluginLog } from '../../lib/pluginLog'
import { getNote, uploadAsset } from '../notes'
import { guard } from './guard'

/**
 * The `media` permission, implemented: a plugin's read/write access to the
 * attachments a note embeds — images, PDFs, audio, video.
 *
 * Kept separate from `notes` on purpose. Note text is words the user wrote; an
 * attachment is often a scan, a recording or a photo, and a plugin that only
 * needs to summarize prose has no business reading either. Granting `notes`
 * alone leaves `ctx.media` absent.
 *
 * Scoped the same way as `ctx.notes`: `list` refuses a note outside the active
 * vault. Reads go through Rust (`plugin_read_asset`), which re-checks the grant
 * and enforces the size ceiling on the file's metadata before reading a byte —
 * so a plugin cannot pull a two-gigabyte video through IPC and freeze the app.
 * Writes reuse the raw-IPC `save_asset` path, so nothing is JSON-encoded.
 */

/** Matches the Rust `MAX_PLUGIN_ASSET_BYTES`; checked here too so a write is
 *  refused before the bytes travel rather than after. */
const MAX_ASSET_BYTES = 25 * 1024 * 1024

function decodeBase64(b64: string): Uint8Array {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export function makePluginMediaApi(pluginId: string): PluginMediaApi {
  return {
    list(noteId: string): Promise<NoteMedia[]> {
      return guard(pluginId, 'reads', async () => {
        const note = await getNote(noteId).catch(() => undefined)
        if (!note || !noteInVault(note, getActiveVaultId())) {
          throw new Error('That note is not in the active vault.')
        }
        return extractNoteMedia(note.content)
      })
    },

    read(filename: string): Promise<Uint8Array> {
      return guard(pluginId, 'reads', async () => {
        try {
          const b64 = await invoke<string>('plugin_read_asset', { pluginId, filename })
          return decodeBase64(b64)
        } catch (err) {
          // Rust refuses a read that was never granted, is too large, or names a
          // file outside the assets dir. Rejecting the plugin's promise is not
          // enough on its own: if the plugin swallows it, a revoked permission
          // looks exactly like a plugin that chose not to read.
          pluginLog('warn', `Refused to read "${filename}": ${err instanceof Error ? err.message : String(err)}`, pluginId)
          throw err
        }
      })
    },

    write(bytes: Uint8Array, extension: string): Promise<string> {
      return guard(pluginId, 'writes', async () => {
        if (bytes.byteLength > MAX_ASSET_BYTES) {
          throw new Error(`Attachments a plugin writes are capped at ${MAX_ASSET_BYTES / (1024 * 1024)} MB.`)
        }
        const filename = await uploadAsset(bytes, extension)
        // A plugin adding a file to the user's vault is exactly the kind of thing
        // that should leave a trail, so it is named in the Plugin Console.
        pluginLog('info', `Saved attachment ${filename}`, pluginId)
        return filename
      })
    },
  }
}
