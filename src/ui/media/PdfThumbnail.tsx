// A small, first-page-only PDF preview (~3"x2", no controls) for note cards
// and the modal's read view — the full PdfViewer renders every page with a
// controls bar and is far too tall/heavy for a preview context. Clicking
// opens the full viewer (the caller owns the fullscreen overlay).

import { useEffect, useRef, useState } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import styles from './PdfThumbnail.module.css'

import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

function assetUrl(filename: string): string {
  return `http://jnana-asset.localhost/${filename}`
}

const THUMB_WIDTH = 216
const THUMB_HEIGHT = 192

interface Props {
  filename: string
  onClick?: () => void
}

export function PdfThumbnail({ filename, onClick }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let active = true
    let renderTask: ReturnType<pdfjsLib.PDFPageProxy['render']> | null = null
    setLoading(true)
    setError(false)

    pdfjsLib
      .getDocument(assetUrl(filename))
      .promise.then((pdf) => pdf.getPage(1))
      .then((page) => {
        if (!active || !canvasRef.current) return
        const unscaled = page.getViewport({ scale: 1 })
        const scale = Math.min(THUMB_WIDTH / unscaled.width, THUMB_HEIGHT / unscaled.height)
        const viewport = page.getViewport({ scale })
        const canvas = canvasRef.current
        const context = canvas.getContext('2d')
        if (!context) return
        canvas.width = viewport.width
        canvas.height = viewport.height
        renderTask = page.render({ canvasContext: context, viewport, canvas })
        return renderTask.promise
      })
      .then(() => {
        if (active) setLoading(false)
      })
      .catch((err) => {
        console.error('Failed to render PDF thumbnail:', err)
        if (active) {
          setError(true)
          setLoading(false)
        }
      })

    return () => {
      active = false
      renderTask?.cancel()
    }
  }, [filename])

  return (
    <button type="button" className={styles.thumb} onClick={onClick} title="Open PDF">
      {error ? (
        <span className={styles.thumbError}>📄 Couldn't preview this PDF</span>
      ) : (
        <canvas ref={canvasRef} className={styles.thumbCanvas} />
      )}
      {loading && !error && <span className={styles.thumbLoading}>Loading…</span>}
    </button>
  )
}
