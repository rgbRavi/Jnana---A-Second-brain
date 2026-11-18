// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Save arbitrary CSV text to a user-chosen file. Unlike a browser `<a download>`
// (which drops the bytes into the OS downloads folder with no prompt and no
// feedback), this opens a native "Save As" dialog so the user names the file and
// picks its folder, streams the write through Rust, shows a progress bar in the
// toast tray while it writes, and resolves into a self-dismissing "‘name’ exported
// to ‘dir’" notification.

import { invoke } from './ipc'
import { save } from '@tauri-apps/plugin-dialog'
import { toast, updateToast, dismissToast } from '../lib/toast'

/** Split an absolute path into its file name and containing directory. */
function splitPath(path: string): { fileName: string; dir: string } {
  const fileName = path.split(/[\\/]/).pop() || path
  const dir = path.slice(0, path.length - fileName.length).replace(/[\\/]+$/, '')
  return { fileName, dir }
}

/**
 * Prompt for a destination, then write `csv` there with progress + result toasts.
 * Returns the written path, or `null` if the user cancelled the dialog.
 */
export function saveCsvFile(defaultName: string, csv: string): Promise<string | null> {
  return saveTextFile(defaultName, csv, { title: 'Export table as CSV', filterName: 'CSV', extensions: ['csv'] })
}

/** Same flow for any text file (CSV, a log export, …). */
export async function saveTextFile(
  defaultName: string,
  text: string,
  opts: { title: string; filterName: string; extensions: string[] },
): Promise<string | null> {
  const path = await save({
    title: opts.title,
    defaultPath: defaultName,
    filters: [{ name: opts.filterName, extensions: opts.extensions }],
  })
  if (!path) return null // cancelled

  const { fileName, dir } = splitPath(path)

  // A local CSV write is near-instant, so we ease a determinate bar up to ~90%
  // while the write is in flight, then snap to 100% and flip to the success
  // notification — enough to read as "downloading" without faking a long wait.
  const id = toast.progress(`Exporting ${fileName}…`, 0.06)
  let p = 0.06
  const timer = window.setInterval(() => {
    p = Math.min(0.9, p + 0.18)
    updateToast(id, { progress: p })
  }, 90)

  try {
    await invoke('write_text_file', { path, content: text })
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
