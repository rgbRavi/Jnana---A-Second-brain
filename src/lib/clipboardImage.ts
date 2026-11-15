// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { readImage } from '@tauri-apps/plugin-clipboard-manager'

/** PNG-encode raw RGBA via a canvas (fallback path for the Tauri clipboard image). */
async function rgbaToPng(rgba: Uint8Array, width: number, height: number): Promise<Uint8Array> {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  ctx.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0)
  const blob: Blob = await new Promise((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error('toBlob failed'))), 'image/png'),
  )
  return new Uint8Array(await blob.arrayBuffer())
}

/** Read an image off the clipboard as PNG bytes via the Tauri plugin (RGBA → PNG).
 *  Not `navigator.clipboard.read()`: the WebView shows every user a "wants to see your
 *  clipboard" permission prompt for it, while the plugin is granted by the capability file. */
export async function readClipboardImage(): Promise<Uint8Array | null> {
  try {
    const img = await readImage()
    const { width, height } = await img.size()
    return await rgbaToPng(new Uint8Array(await img.rgba()), width, height)
  } catch {
    return null
  }
}
