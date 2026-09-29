// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// src/core/media/visionImages.ts
//
// Turn stored assets into compact JPEG data URLs a vision model can take:
// an image embed as-is, or a scanned PDF's pages rendered with pdf.js.
//
// Bytes come over the asset host (same as pdfText/PdfThumbnail), never as a
// command argument — see the "never send bytes as an argument" gotcha. Every
// image is downscaled (longest side ≤ maxDim) and re-encoded as JPEG, which
// bounds both the request size and the provider's per-image token cost.

const assetUrl = (filename: string) => `http://jnana-asset.localhost/${filename}`

/** Longest side sent to the model. ~1280px keeps text in screenshots and scans legible. */
export const VISION_MAX_DIM = 1280

function toJpeg(source: CanvasImageSource, width: number, height: number, maxDim: number): string {
  const scale = Math.min(1, maxDim / Math.max(width, height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width * scale))
  canvas.height = Math.max(1, Math.round(height * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('No 2D canvas context')
  ctx.fillStyle = '#ffffff' // JPEG has no alpha — flatten transparency onto white, not black
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', 0.85)
}

/** An image asset as a downscaled JPEG data URL, or null if it can't be decoded (e.g. SVG). */
export async function loadImageForVision(filename: string, maxDim = VISION_MAX_DIM): Promise<string | null> {
  try {
    const res = await fetch(assetUrl(filename))
    if (!res.ok) return null
    const bitmap = await createImageBitmap(await res.blob())
    try {
      return toJpeg(bitmap, bitmap.width, bitmap.height, maxDim)
    } finally {
      bitmap.close()
    }
  } catch {
    return null
  }
}

/** The first `maxPages` pages of a PDF asset, rendered to JPEG data URLs. */
export async function renderPdfPagesForVision(
  filename: string,
  maxPages: number,
  maxDim = VISION_MAX_DIM,
): Promise<string[]> {
  if (maxPages <= 0) return []
  try {
    // pdf.js is heavy — load it only when a scanned PDF actually needs rendering.
    const pdfjsLib = await import('pdfjs-dist')
    const { default: workerUrl } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
    pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl
    const pdf = await pdfjsLib.getDocument(assetUrl(filename)).promise
    const pages: string[] = []
    for (let i = 1; i <= Math.min(maxPages, pdf.numPages); i++) {
      const page = await pdf.getPage(i)
      const base = page.getViewport({ scale: 1 })
      const viewport = page.getViewport({ scale: Math.min(2, maxDim / Math.max(base.width, base.height)) })
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(viewport.width)
      canvas.height = Math.round(viewport.height)
      const ctx = canvas.getContext('2d')
      if (!ctx) break
      await page.render({ canvasContext: ctx, viewport, canvas }).promise
      pages.push(toJpeg(canvas, canvas.width, canvas.height, maxDim))
    }
    return pages
  } catch {
    return []
  }
}
