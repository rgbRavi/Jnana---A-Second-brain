// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// A small, first-page-only PDF preview (~3"x2", no controls) for note cards
// and the modal's read view — the full PdfViewer renders every page with a
// controls bar and is far too tall/heavy for a preview context. Clicking
// opens the full viewer (the caller owns the fullscreen overlay).

import { useEffect, useState } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import styles from './PdfThumbnail.module.css'

import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

function assetUrl(filename: string): string {
  return `http://jnana-asset.localhost/${filename}`
}

const THUMB_WIDTH = 216
const THUMB_HEIGHT = 192

// Rendering a PDF's first page (fetch + parse + canvas paint through pdf.js) is
// expensive and, until it lands, shows a visible "Loading…" flash. In the live
// editor the embed is a CM6 widget that can remount (the caret revealing the
// raw token, decoration rebuilds), which would re-run all of that on keystrokes
// near the token. Cache the rendered page as a data URL keyed by filename so any
// remount paints instantly from memory — a file's first page never changes.
// (pdf.js paints the page from decoded bytes, not a cross-origin <img>, so the
// canvas isn't tainted and toDataURL is allowed.)
const thumbCache = new Map<string, string>()
const thumbInFlight = new Map<string, Promise<string>>()

function renderThumbnail(filename: string): Promise<string> {
  const cached = thumbCache.get(filename)
  if (cached) return Promise.resolve(cached)
  const existing = thumbInFlight.get(filename)
  if (existing) return existing

  const task = pdfjsLib
    .getDocument(assetUrl(filename))
    .promise.then((pdf) => pdf.getPage(1))
    .then((page) => {
      const unscaled = page.getViewport({ scale: 1 })
      const scale = Math.min(THUMB_WIDTH / unscaled.width, THUMB_HEIGHT / unscaled.height)
      const viewport = page.getViewport({ scale })
      const canvas = document.createElement('canvas')
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Failed to get 2d canvas context')
      canvas.width = viewport.width
      canvas.height = viewport.height
      return page
        .render({ canvasContext: context, viewport, canvas })
        .promise.then(() => {
          const dataUrl = canvas.toDataURL('image/png')
          thumbCache.set(filename, dataUrl)
          return dataUrl
        })
    })
    .finally(() => {
      thumbInFlight.delete(filename)
    })

  thumbInFlight.set(filename, task)
  return task
}

interface Props {
  filename: string
  onClick?: () => void
  /** Display width (px) from the saved media layout; height follows the box's
   *  ~9:8 ratio. Omitted → the default 216×192 preview. */
  width?: number
}

export function PdfThumbnail({ filename, onClick, width }: Props) {
  const [src, setSrc] = useState<string | null>(() => thumbCache.get(filename) ?? null)
  const [error, setError] = useState(false)

  useEffect(() => {
    // Cache hit → paint synchronously, no pdf.js, no flash.
    const cached = thumbCache.get(filename)
    if (cached) {
      setSrc(cached)
      setError(false)
      return
    }
    let active = true
    setError(false)
    setSrc(null)
    renderThumbnail(filename)
      .then((dataUrl) => {
        if (active) setSrc(dataUrl)
      })
      .catch((err) => {
        console.error('Failed to render PDF thumbnail:', err)
        if (active) setError(true)
      })
    return () => {
      active = false
    }
  }, [filename])

  const style = width
    ? { width, height: Math.round((width * THUMB_HEIGHT) / THUMB_WIDTH) }
    : undefined

  return (
    <button type="button" className={styles.thumb} style={style} onClick={onClick} title="Open PDF">
      {error ? (
        <span className={styles.thumbError}>📄 Couldn't preview this PDF</span>
      ) : src ? (
        <img src={src} className={styles.thumbCanvas} alt="PDF preview" />
      ) : (
        <span className={styles.thumbLoading}>Loading…</span>
      )}
    </button>
  )
}
