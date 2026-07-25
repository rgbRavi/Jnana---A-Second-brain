// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import * as pdfjsLib from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

// Same asset host the thumbnail/viewer use — pdf.js fetches bytes over it.
function assetUrl(filename: string): string {
  return `http://jnana-asset.localhost/${filename}`
}

// A PDF's extracted text never changes; cache by filename so a re-index or a
// second import of the same file skips the parse.
const textCache = new Map<string, string>()
const inFlight = new Map<string, Promise<string>>()

/**
 * Extract all page text from a stored PDF asset. Returns '' for scanned/
 * image-only PDFs (no text layer) — those would need OCR, out of scope here.
 */
export function extractPdfText(filename: string): Promise<string> {
  const cached = textCache.get(filename)
  if (cached !== undefined) return Promise.resolve(cached)
  const existing = inFlight.get(filename)
  if (existing) return existing

  const task = pdfjsLib
    .getDocument(assetUrl(filename))
    .promise.then(async (pdf) => {
      const pages: string[] = []
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i)
        const content = await page.getTextContent()
        const text = content.items
          .map((it) => (it as { str?: string }).str ?? '')
          .join(' ')
        if (text.trim()) pages.push(text)
      }
      const joined = pages.join('\n\n').replace(/[ \t]+/g, ' ').trim()
      textCache.set(filename, joined)
      return joined
    })
    .finally(() => {
      inFlight.delete(filename)
    })

  inFlight.set(filename, task)
  return task
}
