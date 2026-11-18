// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { saveBinaryFile } from '../saveBinary'
import { toast } from '../../lib/toast'

/** Export what the graph canvas currently shows as a PNG on the theme background. */
export async function exportGraphPng(container: HTMLElement | null): Promise<void> {
  const src = container?.querySelector('canvas')
  if (!src || !src.width || !src.height) {
    toast.error('Nothing to export — switch to the graph view first.')
    return
  }
  const out = document.createElement('canvas')
  out.width = src.width // already devicePixelRatio-scaled by force-graph
  out.height = src.height
  const ctx = out.getContext('2d')
  if (!ctx) return
  // The canvas can be transparent (themed/ripple background lives behind it) — fill first.
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#000'
  ctx.fillRect(0, 0, out.width, out.height)
  ctx.drawImage(src, 0, 0)
  const blob = await new Promise<Blob | null>((r) => out.toBlob(r, 'image/png'))
  if (!blob) {
    toast.error('Export failed: could not render the image.')
    return
  }
  const bytes = new Uint8Array(await blob.arrayBuffer())
  await saveBinaryFile('graph.png', bytes, {
    title: 'Export graph as image',
    filterName: 'PNG image',
    extensions: ['png'],
  })
}
