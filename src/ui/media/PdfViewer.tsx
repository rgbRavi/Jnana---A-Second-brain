// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// src/ui/media/PdfViewer.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import { usePdfAnnotations } from '../../hooks/usePdfAnnotations'
import { toast } from '../../lib/toast'
import { strokePath } from '../../core/ink'
import { ContextMenu, type MenuItem } from '../ContextMenu'
import styles from './PdfViewer.module.css'

// Use Vite's asset import to bundle the worker correctly for offline use
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

type Tool = 'select' | 'highlight' | 'pen' | 'eraser' | 'text'

// Pen defaults mirror the canvas board (useCanvasPrefs).
const PEN_COLORS = ['#7c6af7', '#e5484d', '#f5a623', '#30a46c', '#111111']
const DEFAULT_PEN_COLOR = '#7c6af7'
const DEFAULT_PEN_SIZE = 4
// Text box default size, in PDF points, so it zooms with the page.
const DEFAULT_FONT_PT = 14

// Right-click "Text colour" choices; `value: undefined` reverts to auto-contrast.
const TEXT_COLORS: { label: string; value: string | undefined }[] = [
  { label: 'Auto (contrast)', value: undefined },
  { label: 'White', value: '#ffffff' },
  { label: 'Black', value: '#111111' },
  { label: 'Red', value: '#e5484d' },
  { label: 'Blue', value: '#4c6ef5' },
  { label: 'Green', value: '#30a46c' },
  { label: 'Yellow', value: '#f5a623' },
]

/** Relative luminance (0–1) of a #rrggbb colour. */
function luminance(r: number, g: number, b: number): number {
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255
}

function isLightColor(hex: string): boolean {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
  if (!m) return true
  return luminance(parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)) > 0.5
}

interface PdfViewerProps {
  filename: string
  noteId: string
  /** Called once so the parent can jump this viewer to a specific page */
  onRegisterPageSetter?: (setter: (page: number) => void) => void
  /** Render-only: hide the markup tools + overlay interactions (e.g. on the
   *  canvas, where there is no note to scope annotations to). */
  readOnly?: boolean
}

function assetUrl(filename: string): string {
  return `http://jnana-asset.localhost/${filename}`
}

export function PdfViewer({ filename, noteId, onRegisterPageSetter, readOnly = false }: PdfViewerProps) {
  const [pdf, setPdf] = useState<pdfjsLib.PDFDocumentProxy | null>(null)
  const [page, setPage] = useState<pdfjsLib.PDFPageProxy | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pageNumber, setPageNumber] = useState(1)
  const [numPages, setNumPages] = useState(0)
  const [scale, setScale] = useState<number | 'fit-width'>('fit-width')

  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)

  // Markup tool + pen prefs
  const [tool, setTool] = useState<Tool>('select')
  const [penColor, setPenColor] = useState(DEFAULT_PEN_COLOR)
  const [penSize, setPenSize] = useState(DEFAULT_PEN_SIZE)

  // Highlight drag-selection state (overlay-pixel coords)
  const [isSelecting, setIsSelecting] = useState(false)
  const [startPos, setStartPos] = useState<{ x: number; y: number } | null>(null)
  const [currentRect, setCurrentRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null)

  // Live freehand stroke (overlay-pixel coords) while drawing
  const [liveStroke, setLiveStroke] = useState<{ points: [number, number, number][]; color: string; size: number } | null>(null)
  const gestureRef = useRef<'none' | 'highlight' | 'pen' | 'erase'>('none')

  const [editingTextId, setEditingTextId] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null)
  // Inline highlight-note editor (positioned over the highlight, inside the
  // viewer) — replaces the old centred prompt dialog.
  const [editingHl, setEditingHl] = useState<{ id: string; left: number; top: number; draft: string; orig: string } | null>(null)

  const {
    highlights,
    inks,
    texts,
    createHighlight,
    createInk,
    createText,
    updateText,
    writeText,
    remove,
  } = usePdfAnnotations(noteId, filename, pageNumber)

  // Register the page setter for external control (e.g., [D1::Page 4] jumps)
  useEffect(() => {
    if (onRegisterPageSetter) {
      onRegisterPageSetter((p: number) => {
        if (p >= 1 && (numPages === 0 || p <= numPages)) {
          setPageNumber(p)
        }
      })
    }
  }, [onRegisterPageSetter, numPages])

  // 1. Load the PDF Document
  useEffect(() => {
    let active = true
    setLoading(true)
    pdfjsLib.getDocument(assetUrl(filename)).promise
      .then((pdfDoc) => {
        if (!active) return
        setPdf(pdfDoc)
        setNumPages(pdfDoc.numPages)
        setLoading(false)
      })
      .catch((err) => {
        console.error('Failed to load PDF:', err)
        if (active) {
          setError('Failed to load PDF document.')
          setLoading(false)
        }
      })
    return () => { active = false }
  }, [filename])

  // 2. Load the specific page when pdf or pageNumber changes
  useEffect(() => {
    if (!pdf) return
    let active = true
    pdf.getPage(pageNumber).then((p) => {
      if (active) setPage(p)
    }).catch(console.error)
    return () => { active = false }
  }, [pdf, pageNumber])

  // 3. Render the page to Canvas
  const [viewport, setViewport] = useState<pdfjsLib.PageViewport | null>(null)
  // Bumped once the canvas has actually painted, so text-colour auto-contrast
  // (which samples canvas pixels) re-runs against the finished page, not a
  // blank/stale bitmap.
  const [renderTick, setRenderTick] = useState(0)

  useEffect(() => {
    if (!page || !canvasRef.current || !containerRef.current) return

    const canvas = canvasRef.current
    const context = canvas.getContext('2d')
    if (!context) return

    // Calculate scale
    const unscaledViewport = page.getViewport({ scale: 1.0 })
    let computedScale = typeof scale === 'number' ? scale : 1.0

    if (scale === 'fit-width') {
      const parentWidth = containerRef.current.clientWidth - 40 // padding
      computedScale = parentWidth / unscaledViewport.width
    }

    const vp = page.getViewport({ scale: computedScale })
    setViewport(vp)

    canvas.height = vp.height
    canvas.width = vp.width

    const renderContext = {
      canvasContext: context,
      viewport: vp,
      canvas,
    }

    let cancelled = false
    const renderTask = page.render(renderContext)
    renderTask.promise.then(() => { if (!cancelled) setRenderTick((t) => t + 1) }).catch(() => {})

    return () => {
      cancelled = true
      renderTask.cancel()
    }
  }, [page, scale, containerRef.current?.clientWidth])

  // --- Coordinate helpers -----------------------------------------------------

  const overlayXY = (e: React.PointerEvent): { x: number; y: number } => {
    const rect = overlayRef.current!.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  /** Nearest ink annotation whose stroke passes within a small radius of a PDF
   *  point — used by the eraser and the right-click "delete drawing". */
  const inkAtPoint = (pdfX: number, pdfY: number): string | null => {
    if (!viewport) return null
    const thresh = 12 / viewport.scale
    for (const ink of inks) {
      const r = thresh + ink.size / 2
      for (const [px, py] of ink.points) {
        if (Math.hypot(px - pdfX, py - pdfY) <= r) return ink.id
      }
    }
    return null
  }

  // Sample the rendered page under a box (canvas pixels) and return a text
  // colour that contrasts the average background there. `renderTick` is read so
  // callers recompute after the canvas repaints.
  const contrastColorAt = (x: number, y: number, w: number, h: number): string => {
    void renderTick
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d', { willReadFrequently: true } as CanvasRenderingContext2DSettings)
    if (!canvas || !ctx) return '#111111'
    const sx = Math.max(0, Math.min(Math.round(x), canvas.width - 1))
    const sy = Math.max(0, Math.min(Math.round(y), canvas.height - 1))
    const sw = Math.max(1, Math.min(Math.round(w), canvas.width - sx))
    const sh = Math.max(1, Math.min(Math.round(h), canvas.height - sy))
    let data: Uint8ClampedArray
    try {
      data = ctx.getImageData(sx, sy, sw, sh).data
    } catch {
      return '#111111'
    }
    let r = 0, g = 0, b = 0, count = 0
    // Stride over pixels (every 8th) — plenty for an average, far cheaper.
    for (let i = 0; i < data.length; i += 4 * 8) {
      r += data[i]; g += data[i + 1]; b += data[i + 2]; count++
    }
    if (!count) return '#111111'
    return luminance(r / count, g / count, b / count) > 0.5 ? '#111111' : '#f5f5f5'
  }

  const createTextAt = (overlayX: number, overlayY: number) => {
    if (!viewport) return
    const [pdfX, pdfY] = viewport.convertToPdfPoint(overlayX, overlayY)
    createText(pdfX, pdfY, '', DEFAULT_FONT_PT).then((ann) => {
      setTool('select')
      setEditingTextId(ann.id)
    })
  }

  const eraseAtOverlay = (overlayX: number, overlayY: number) => {
    if (!viewport) return
    const [pdfX, pdfY] = viewport.convertToPdfPoint(overlayX, overlayY)
    const id = inkAtPoint(pdfX, pdfY)
    if (id) void remove(id)
  }

  // --- Overlay pointer handling (tool-dependent) ------------------------------

  const onOverlayPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (readOnly || e.button !== 0 || !viewport) return
    const { x, y } = overlayXY(e)
    if (tool === 'highlight') {
      gestureRef.current = 'highlight'
      overlayRef.current?.setPointerCapture(e.pointerId)
      setIsSelecting(true)
      setStartPos({ x, y })
      setCurrentRect({ x, y, w: 0, h: 0 })
    } else if (tool === 'pen') {
      gestureRef.current = 'pen'
      overlayRef.current?.setPointerCapture(e.pointerId)
      setLiveStroke({ points: [[x, y, e.pressure || 0.5]], color: penColor, size: penSize })
    } else if (tool === 'eraser') {
      gestureRef.current = 'erase'
      overlayRef.current?.setPointerCapture(e.pointerId)
      eraseAtOverlay(x, y)
    } else if (tool === 'text') {
      createTextAt(x, y)
    }
    // 'select': let annotations handle their own clicks
  }

  const onOverlayPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = gestureRef.current
    if (g === 'none') return
    const { x, y } = overlayXY(e)
    if (g === 'highlight' && startPos) {
      setCurrentRect({
        x: Math.min(x, startPos.x),
        y: Math.min(y, startPos.y),
        w: Math.abs(x - startPos.x),
        h: Math.abs(y - startPos.y),
      })
    } else if (g === 'pen') {
      setLiveStroke((prev) => (prev ? { ...prev, points: [...prev.points, [x, y, e.pressure || 0.5]] } : prev))
    } else if (g === 'erase') {
      eraseAtOverlay(x, y)
    }
  }

  const onOverlayPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = gestureRef.current
    gestureRef.current = 'none'
    overlayRef.current?.releasePointerCapture(e.pointerId)
    if (g === 'highlight') void commitHighlight()
    else if (g === 'pen') void commitStroke()
  }

  const commitHighlight = async () => {
    setIsSelecting(false)
    if (!currentRect || !viewport || currentRect.w < 10 || currentRect.h < 10) {
      setCurrentRect(null)
      return
    }
    const [pdfX1, pdfY1] = viewport.convertToPdfPoint(currentRect.x, currentRect.y)
    const [pdfX2, pdfY2] = viewport.convertToPdfPoint(currentRect.x + currentRect.w, currentRect.y + currentRect.h)
    const rectBox: [number, number, number, number] = [
      Math.min(pdfX1, pdfX2),
      Math.min(pdfY1, pdfY2),
      Math.abs(pdfX2 - pdfX1),
      Math.abs(pdfY2 - pdfY1),
    ]
    try {
      await createHighlight(rectBox)
    } catch (err) {
      console.error('Failed to create annotation:', err)
      toast.error('Failed to save highlight.')
    } finally {
      setCurrentRect(null)
    }
  }

  const commitStroke = async () => {
    const stroke = liveStroke
    setLiveStroke(null)
    if (!stroke || !viewport || stroke.points.length < 2) return
    // Store points + size in PDF space so the stroke stays anchored + scales with zoom.
    const pdfPoints = stroke.points.map(([px, py, pr]) => {
      const [X, Y] = viewport.convertToPdfPoint(px, py)
      return [X, Y, pr] as [number, number, number]
    })
    try {
      await createInk(pdfPoints, stroke.color, stroke.size / viewport.scale)
    } catch (err) {
      console.error('Failed to save ink:', err)
      toast.error('Failed to save drawing.')
    }
  }

  // --- Context menus ----------------------------------------------------------

  const onOverlayContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault()
    if (readOnly || !viewport || !overlayRef.current) return
    const rect = overlayRef.current.getBoundingClientRect()
    const ox = e.clientX - rect.left
    const oy = e.clientY - rect.top
    const [pdfX, pdfY] = viewport.convertToPdfPoint(ox, oy)
    const inkId = inkAtPoint(pdfX, pdfY)
    const items: MenuItem[] = [
      { label: 'Add text box here', onClick: () => createTextAt(ox, oy) },
      { label: 'Pen', separator: true, onClick: () => setTool('pen') },
      { label: 'Highlighter', onClick: () => setTool('highlight') },
      { label: 'Eraser', onClick: () => setTool('eraser') },
      { label: 'Select', onClick: () => setTool('select') },
    ]
    if (inkId) {
      items.push({ label: 'Delete drawing', separator: true, danger: true, onClick: () => void remove(inkId) })
    }
    setMenu({ x: e.clientX, y: e.clientY, items })
  }

  const setTextColor = (id: string, color: string | undefined) => {
    const t = texts.find((x) => x.id === id)
    if (t) void writeText(t.id, t.x, t.y, t.fontSize, color)
  }

  const onTextContextMenu = (e: React.MouseEvent, id: string) => {
    e.preventDefault()
    e.stopPropagation()
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        { label: 'Edit text', onClick: () => setEditingTextId(id) },
        { label: 'Text colour', children: TEXT_COLORS.map((c) => ({ label: c.label, onClick: () => setTextColor(id, c.value) })) },
        { label: 'Delete', danger: true, onClick: () => void remove(id) },
      ],
    })
  }

  // --- Derived render data -----------------------------------------------------

  // Committed ink paths, converted PDF-space → current-viewport pixels.
  const committedInk = useMemo(() => {
    if (!viewport) return [] as { id: string; color: string; d: string }[]
    return inks.map((ink) => {
      const pts = ink.points.map(([X, Y, pr]) => {
        const [px, py] = viewport.convertToViewportPoint(X, Y)
        return [px, py, pr] as [number, number, number]
      })
      return { id: ink.id, color: ink.color, d: strokePath(pts, ink.size * viewport.scale) }
    })
  }, [inks, viewport])

  // Open the inline note editor anchored just below the clicked highlight,
  // clamped to stay within the page so it never spills outside the viewer.
  const openHighlightEditor = (id: string, content: string, hlLeft: number, hlBottom: number) => {
    if (!viewport) return
    const left = Math.max(0, Math.min(hlLeft, viewport.width - 220))
    const top = Math.max(0, Math.min(hlBottom + 6, viewport.height - 40))
    setEditingHl({ id, left, top, draft: content, orig: content })
  }

  const commitHighlightNote = () => {
    setEditingHl((cur) => {
      if (cur && cur.draft !== cur.orig) void updateText(cur.id, cur.draft)
      return null
    })
  }

  if (error) {
    return <div className="pdf-error">{error}</div>
  }

  const overlayCursor: Record<Tool, string> = {
    select: 'default',
    highlight: 'crosshair',
    pen: 'crosshair',
    eraser: 'cell',
    text: 'text',
  }

  const toolButtons: { tool: Tool; label: string; title: string }[] = [
    { tool: 'select', label: '⇱ Select', title: 'Select / edit annotations' },
    { tool: 'highlight', label: '🖍 Highlight', title: 'Drag to highlight' },
    { tool: 'pen', label: '✎ Pen', title: 'Draw freehand ink' },
    { tool: 'eraser', label: '⌫ Erase', title: 'Erase ink strokes' },
  ]

  return (
    <div
      ref={containerRef}
      className="pdf-viewer-container"
      style={{
        background: 'var(--surface-2, #1a1a1f)',
        borderRadius: '8px',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '12px',
      }}
    >
      {/* Controls Bar */}
      <div className="pdf-controls" style={{ display: 'flex', gap: '15px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
        <button
          onClick={() => setPageNumber(p => Math.max(1, p - 1))}
          disabled={pageNumber <= 1 || loading}
          style={{ padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', backgroundColor: 'var(--surface-3, #2a2a35)', color: 'white', border: 'none' }}
        >
          Previous
        </button>
        <span style={{ color: 'var(--text-1, #f0eff5)', fontSize: '0.9rem' }}>
          Page {pageNumber} of {numPages || '-'}
        </span>
        <button
          onClick={() => setPageNumber(p => Math.min(numPages, p + 1))}
          disabled={pageNumber >= numPages || loading}
          style={{ padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', backgroundColor: 'var(--surface-3, #2a2a35)', color: 'white', border: 'none' }}
        >
          Next
        </button>

        <div style={{ height: '24px', width: '1px', background: 'var(--border, #3a3a4a)' }} />

        <button onClick={() => setScale(s => s === 'fit-width' ? 1.5 : (typeof s === 'number' ? s + 0.5 : 1.5))} style={{ padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', backgroundColor: 'var(--surface-3, #2a2a35)', color: 'white', border: 'none' }}>
          Zoom In
        </button>
        <button onClick={() => setScale(s => typeof s === 'number' ? Math.max(0.5, s - 0.5) : 1.0)} style={{ padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', backgroundColor: 'var(--surface-3, #2a2a35)', color: 'white', border: 'none' }}>
          Zoom Out
        </button>
        <button onClick={() => setScale('fit-width')} style={{ padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', backgroundColor: 'var(--surface-3, #2a2a35)', color: 'white', border: 'none' }}>
          Fit Width
        </button>

        {!readOnly && (
          <>
            <div style={{ height: '24px', width: '1px', background: 'var(--border, #3a3a4a)' }} />
            {toolButtons.map(({ tool: t, label, title }) => (
              <button
                key={t}
                title={title}
                onClick={() => setTool(t)}
                className={`${styles.toolBtn} ${tool === t ? styles.toolBtnActive : ''}`}
              >
                {label}
              </button>
            ))}
            <button title="Add a text box at the page centre" onClick={() => viewport && createTextAt(viewport.width / 2, viewport.height / 2)} className={styles.toolBtn}>
              ＋ Text
            </button>
            {tool === 'pen' && (
              <span className={styles.penControls}>
                {PEN_COLORS.map((c) => (
                  <button
                    key={c}
                    aria-label={`Pen colour ${c}`}
                    onClick={() => setPenColor(c)}
                    className={`${styles.swatch} ${penColor === c ? styles.swatchActive : ''}`}
                    style={{ background: c }}
                  />
                ))}
                <input
                  type="range"
                  min={1}
                  max={16}
                  value={penSize}
                  onChange={(e) => setPenSize(Number(e.target.value))}
                  title={`Pen size: ${penSize}`}
                />
              </span>
            )}
          </>
        )}
      </div>

      {loading && <div style={{ color: 'var(--text-2, #9896a4)', padding: '40px' }}>Loading PDF Document...</div>}

      {/* Canvas Layer & Interaction Overlay */}
      <div
        style={{
          position: 'relative',
          boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
          overflow: 'hidden',
          display: loading ? 'none' : 'block',
        }}
      >
        <canvas ref={canvasRef} style={{ display: 'block' }} />

        <div
          ref={overlayRef}
          onPointerDown={readOnly ? undefined : onOverlayPointerDown}
          onPointerMove={readOnly ? undefined : onOverlayPointerMove}
          onPointerUp={readOnly ? undefined : onOverlayPointerUp}
          onContextMenu={readOnly ? undefined : onOverlayContextMenu}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            cursor: readOnly ? 'default' : overlayCursor[tool],
            pointerEvents: readOnly ? 'none' : 'auto',
            zIndex: 20,
            touchAction: 'none',
          }}
        >
          {/* Ink layer (below annotation hit-targets; pointer passes through) */}
          {viewport && (
            <svg
              className={styles.inkLayer}
              width={viewport.width}
              height={viewport.height}
              style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
            >
              {committedInk.map((s) => (
                <path key={s.id} d={s.d} fill={s.color} />
              ))}
              {liveStroke && <path d={strokePath(liveStroke.points, liveStroke.size)} fill={liveStroke.color} />}
            </svg>
          )}

          {/* Highlights */}
          {viewport && highlights.map((h) => {
            const [domX1, domY1] = viewport.convertToViewportPoint(h.rect[0], h.rect[1])
            const [domX2, domY2] = viewport.convertToViewportPoint(h.rect[0] + h.rect[2], h.rect[1] + h.rect[3])
            return (
              <div
                key={h.id}
                title={h.content || 'Highlight'}
                style={{
                  position: 'absolute',
                  left: Math.min(domX1, domX2),
                  top: Math.min(domY1, domY2),
                  width: Math.abs(domX2 - domX1),
                  height: Math.abs(domY2 - domY1),
                  backgroundColor: 'rgba(255, 230, 0, 0.4)',
                  border: '2px solid rgba(255, 210, 0, 0.8)',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  zIndex: 10,
                  pointerEvents: tool === 'select' ? 'auto' : 'none',
                }}
                onClick={(e) => {
                  e.stopPropagation()
                  openHighlightEditor(h.id, h.content, Math.min(domX1, domX2), Math.max(domY1, domY2))
                }}
                onContextMenu={(e) => {
                  e.preventDefault(); e.stopPropagation()
                  setMenu({ x: e.clientX, y: e.clientY, items: [{ label: 'Delete highlight', danger: true, onClick: () => void remove(h.id) }] })
                }}
              />
            )
          })}

          {/* Text boxes */}
          {viewport && texts.map((t) => {
            const [domX, domY] = viewport.convertToViewportPoint(t.x, t.y)
            const fontSizePx = t.fontSize * viewport.scale
            // Explicit colour wins; otherwise contrast the page bg under the box.
            const color = t.color ?? contrastColorAt(domX, domY, Math.max(fontSizePx * 6, 40), Math.max(fontSizePx * 1.4, 16))
            return (
              <PdfTextBox
                key={t.id}
                domX={domX}
                domY={domY}
                fontSizePx={fontSizePx}
                text={t.text}
                color={color}
                editing={!readOnly && editingTextId === t.id}
                interactive={!readOnly && tool === 'select'}
                onStartEdit={() => setEditingTextId(t.id)}
                onCommit={(val) => {
                  if (!val.trim()) void remove(t.id)
                  else void updateText(t.id, val)
                  setEditingTextId(null)
                }}
                onMove={(newDomX, newDomY) => {
                  if (!viewport) return
                  const [pdfX, pdfY] = viewport.convertToPdfPoint(newDomX, newDomY)
                  void writeText(t.id, pdfX, pdfY, t.fontSize, t.color)
                }}
                onContextMenu={(e) => onTextContextMenu(e, t.id)}
              />
            )
          })}

          {/* Active highlight drag box */}
          {isSelecting && currentRect && (
            <div
              style={{
                position: 'absolute',
                left: currentRect.x,
                top: currentRect.y,
                width: currentRect.w,
                height: currentRect.h,
                backgroundColor: 'rgba(124, 106, 247, 0.3)',
                border: '1px solid rgba(124, 106, 247, 0.8)',
                pointerEvents: 'none',
                zIndex: 15,
              }}
            />
          )}

          {/* Inline highlight-note editor — lives inside the viewer overlay */}
          {editingHl && (
            <input
              className={styles.hlNoteInput}
              autoFocus
              value={editingHl.draft}
              placeholder="Add a note for this highlight…"
              style={{ position: 'absolute', left: editingHl.left, top: editingHl.top, zIndex: 30 }}
              onChange={(e) => setEditingHl((cur) => (cur ? { ...cur, draft: e.target.value } : cur))}
              onPointerDown={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); commitHighlightNote() }
                else if (e.key === 'Escape') { e.preventDefault(); setEditingHl(null) }
              }}
              onBlur={commitHighlightNote}
            />
          )}
        </div>
      </div>

      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
    </div>
  )
}

// A single free-positioned text box: readonly textarea that toggles editable on
// double-click, drag-to-move while in select mode, commit on blur (empty →
// removed). Mirrors the canvas board's text-node UX.
function PdfTextBox({
  domX,
  domY,
  fontSizePx,
  text,
  color,
  editing,
  interactive,
  onStartEdit,
  onCommit,
  onMove,
  onContextMenu,
}: {
  domX: number
  domY: number
  fontSizePx: number
  text: string
  color: string
  editing: boolean
  interactive: boolean
  onStartEdit: () => void
  onCommit: (value: string) => void
  onMove: (newDomX: number, newDomY: number) => void
  onContextMenu: (e: React.MouseEvent) => void
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const [draft, setDraft] = useState(text)
  const [drag, setDrag] = useState<{ dx: number; dy: number } | null>(null)

  useEffect(() => {
    if (editing) {
      setDraft(text)
      ref.current?.focus()
      ref.current?.select()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing])

  const left = domX + (drag?.dx ?? 0)
  const top = domY + (drag?.dy ?? 0)

  const onPointerDown = (e: React.PointerEvent) => {
    if (editing || !interactive) return
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startY = e.clientY
    let moved = false
    const onMoveEv = (ev: PointerEvent) => {
      const dx = ev.clientX - startX
      const dy = ev.clientY - startY
      if (Math.abs(dx) + Math.abs(dy) > 3) moved = true
      setDrag({ dx, dy })
    }
    const onUpEv = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', onMoveEv)
      window.removeEventListener('pointerup', onUpEv)
      setDrag(null)
      if (moved) onMove(domX + (ev.clientX - startX), domY + (ev.clientY - startY))
    }
    window.addEventListener('pointermove', onMoveEv)
    window.addEventListener('pointerup', onUpEv)
  }

  return (
    <textarea
      ref={ref}
      className={styles.pdfTextBox}
      value={editing ? draft : text}
      readOnly={!editing}
      placeholder={editing ? 'Type…' : ''}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => onCommit(draft)}
      onPointerDown={onPointerDown}
      onDoubleClick={(e) => { e.stopPropagation(); onStartEdit() }}
      onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); e.currentTarget.blur() } }}
      onContextMenu={onContextMenu}
      style={{
        position: 'absolute',
        left,
        top,
        fontSize: fontSizePx,
        color,
        // While editing, back the text with a scrim that contrasts the text
        // colour so it stays readable regardless of the page underneath.
        background: editing ? (isLightColor(color) ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.85)') : 'transparent',
        zIndex: 12,
        pointerEvents: interactive || editing ? 'auto' : 'none',
        cursor: editing ? 'text' : 'move',
      }}
    />
  )
}
