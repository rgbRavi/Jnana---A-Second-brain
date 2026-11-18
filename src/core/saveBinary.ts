// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Binary twin of `saveTextFile`/`saveCsvFile` (saveCsv.ts): native "Save As" dialog,
// progress toast, success notification. The bytes go to Rust as a raw IPC body (never
// a JSON number array); the path rides in a percent-encoded header (headers are ASCII).

import { invoke } from './ipc'
import { save } from '@tauri-apps/plugin-dialog'
import { toast, updateToast, dismissToast } from '../lib/toast'
import { splitPath } from './saveCsv'

/** Prompt for a destination, then write `bytes` there. Returns the path, or `null` if cancelled/failed. */
export async function saveBinaryFile(
  defaultName: string,
  bytes: Uint8Array,
  opts: { title: string; filterName: string; extensions: string[] },
): Promise<string | null> {
  const path = await save({
    title: opts.title,
    defaultPath: defaultName,
    filters: [{ name: opts.filterName, extensions: opts.extensions }],
  })
  if (!path) return null // cancelled

  const { fileName, dir } = splitPath(path)
  const id = toast.progress(`Exporting ${fileName}…`, 0.06)
  let p = 0.06
  const timer = window.setInterval(() => {
    p = Math.min(0.9, p + 0.18)
    updateToast(id, { progress: p })
  }, 90)

  try {
    await invoke('write_binary_file_raw', bytes, { headers: { 'x-path': encodeURIComponent(path) } })
    window.clearInterval(timer)
    updateToast(id, {
      message: `“${fileName}” exported to “${dir}”`,
      variant: 'success',
      progress: 1,
      duration: 2000,
    })
    return path
  } catch (e) {
    window.clearInterval(timer)
    dismissToast(id)
    toast.error(`Export failed: ${e}`)
    return null
  }
}
