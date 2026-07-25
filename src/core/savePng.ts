// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Save a PNG Blob to a user-chosen file via the native Save-As dialog + a Rust
// binary write, with a progress→success toast. Mirrors core/saveCsv.ts.

import { invoke } from '@tauri-apps/api/core'
import { save } from '@tauri-apps/plugin-dialog'
import { toast, updateToast, dismissToast } from '../lib/toast'

function splitPath(path: string): { fileName: string; dir: string } {
  const fileName = path.split(/[\\/]/).pop() || path
  const dir = path.slice(0, path.length - fileName.length).replace(/[\\/]+$/, '')
  return { fileName, dir }
}

/** Prompt for a destination, then write `blob`'s bytes there. Returns the path or null (cancelled). */
export async function savePngFile(defaultName: string, blob: Blob): Promise<string | null> {
  const path = await save({
    title: 'Export canvas as PNG',
    defaultPath: defaultName,
    filters: [{ name: 'PNG', extensions: ['png'] }],
  })
  if (!path) return null

  const { fileName, dir } = splitPath(path)
  const id = toast.progress(`Exporting ${fileName}…`, 0.1)

  try {
    const bytes = Array.from(new Uint8Array(await blob.arrayBuffer()))
    await invoke('write_binary_file', { path, bytes })
    updateToast(id, {
      message: `“${fileName}” exported to “${dir}”`,
      variant: 'success',
      progress: 1,
      duration: 2000,
    })
    return path
  } catch (e) {
    dismissToast(id)
    toast.error(`Export failed: ${e}`)
    return null
  }
}
