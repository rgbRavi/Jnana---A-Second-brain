// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Canvas → PNG. `computeExportBounds` is the pure, tested bbox; `renderCanvasToPng`
// rasterizes a schematic of the board (node boxes + labels, edges, freehand ink)
// onto an offscreen 2D canvas.
// ponytail: schematic export — media/web/pdf nodes render as labelled boxes, not
// their live pixels. Full-fidelity DOM capture would need an html-to-image dep;
// add only if users ask. Drawing boxes also sidesteps cross-origin canvas taint.

import { strokePath } from '../../../core/ink'
import type { CanvasDoc, CanvasNode } from '../../../core/canvas'
import type { Rect } from './canvasSelect'

/** World-space bounding box of every node + drawing, expanded by `pad`. */
export function computeExportBounds(doc: CanvasDoc, pad: number): Rect {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const n of doc.nodes) {
    minX = Math.min(minX, n.x); minY = Math.min(minY, n.y)
    maxX = Math.max(maxX, n.x + n.width); maxY = Math.max(maxY, n.y + n.height)
  }
  for (const d of doc.drawings) for (const [x, y] of d.points) {
    minX = Math.min(minX, x); minY = Math.min(minY, y)
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y)
  }
  if (!isFinite(minX)) return { x: 0, y: 0, w: 0, h: 0 }
  return { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 }
}

function cssVar(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v || fallback
}

function nodeLabel(n: CanvasNode, titles: Map<string, string>): string {
  if (n.type === 'note') return (n.noteId ? titles.get(n.noteId) : '') || 'Note'
  if (n.type === 'text') return n.text ?? ''
  if (n.type === 'link') return n.url ?? 'Web page'
  if (n.type === 'media') return n.mediaType ?? 'Media'
  return ''
}

/** Render the board to a PNG blob. `titles` maps a note id → title for note cards. */
export async function renderCanvasToPng(
  doc: CanvasDoc,
  opts: { scale?: number; background?: string; titles?: Map<string, string> } = {},
): Promise<Blob> {
  const scale = opts.scale ?? 2
  const titles = opts.titles ?? new Map()
  const b = computeExportBounds(doc, 40)
  const w = Math.max(1, Math.round(b.w * scale))
  const h = Math.max(1, Math.round(b.h * scale))

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.scale(scale, scale)
  ctx.translate(-b.x, -b.y)

  // Background.
  ctx.fillStyle = opts.background || cssVar('--bg', '#ffffff')
  ctx.fillRect(b.x, b.y, b.w, b.h)

  const surface = cssVar('--surface', '#ffffff')
  const border = cssVar('--border', '#d0d0d0')
  const text1 = cssVar('--text-1', '#1a1a1a')
  const edgeCol = cssVar('--text-3', '#999999')

  // Edges (center-to-center).
  const byId = new Map(doc.nodes.map((n) => [n.id, n]))
  ctx.strokeStyle = edgeCol
  ctx.lineWidth = 2
  for (const e of doc.edges) {
    const from = byId.get(e.fromNode), to = byId.get(e.toNode)
    if (!from || !to) continue
    ctx.beginPath()
    ctx.moveTo(from.x + from.width / 2, from.y + from.height / 2)
    ctx.lineTo(to.x + to.width / 2, to.y + to.height / 2)
    ctx.stroke()
  }

  // Nodes.
  ctx.font = '13px sans-serif'
  ctx.textBaseline = 'top'
  for (const n of doc.nodes) {
    ctx.fillStyle = n.color || surface
    ctx.strokeStyle = border
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.rect(n.x, n.y, n.width, n.height)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = text1
    const label = nodeLabel(n, titles).slice(0, 120)
    if (label) wrapText(ctx, label, n.x + 8, n.y + 8, n.width - 16, 16)
  }

  // Freehand ink.
  for (const d of doc.drawings) {
    ctx.fillStyle = d.color
    ctx.fill(new Path2D(strokePath(d.points, d.size)))
  }

  return await new Promise<Blob>((res, rej) =>
    canvas.toBlob((blob) => (blob ? res(blob) : rej(new Error('toBlob failed'))), 'image/png'),
  )
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lineH: number) {
  const words = text.split(/\s+/)
  let line = ''
  let cy = y
  for (const word of words) {
    const test = line ? `${line} ${word}` : word
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, cy)
      line = word
      cy += lineH
    } else {
      line = test
    }
  }
  if (line) ctx.fillText(line, x, cy)
}
