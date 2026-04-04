// src/ui/media/PdfViewer.tsx
import React, { useEffect, useRef, useState, useMemo } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import { useAnnotations } from '../../hooks/useAnnotations'
import { makePdfAnnotation } from '../../core/annotations'

// Use Vite's asset import to bundle the worker correctly for offline use
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

interface PdfViewerProps {
  filename: string
  noteId: string
  /** Called once so the parent can jump this viewer to a specific page */
  onRegisterPageSetter?: (setter: (page: number) => void) => void
}

function assetUrl(filename: string): string {
  return `http://jnana-asset.localhost/${filename}`
}

export function PdfViewer({ filename, noteId, onRegisterPageSetter }: PdfViewerProps) {
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
  
  // Custom Selection State
  const [isSelecting, setIsSelecting] = useState(false)
  const [startPos, setStartPos] = useState<{ x: number; y: number } | null>(null)
  const [currentRect, setCurrentRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null)

  // Use the global note annotations hook
  const { annotations, create, update } = useAnnotations(noteId)

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
  
  // Filter annotations for this specific 'pdf_highlight' on this page
  const pageAnnotations = useMemo(() => {
    return annotations.filter(a => {
      if (a.kind !== 'pdf_highlight') return false
      // For MVP, we use filename as mediaId since the true media UUID isn't exposed yet
      if (a.mediaId !== filename) return false
      try {
        const pos = JSON.parse(a.position)
        return pos.page === pageNumber
      } catch (e) {
        return false
      }
    })
  }, [annotations, filename, pageNumber])

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

    let renderTask = page.render(renderContext)
    
    return () => {
      renderTask.cancel()
    }
  }, [page, scale, containerRef.current?.clientWidth])

  // --- Interaction / Selection Logic ---
  
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!overlayRef.current) return
    const rect = overlayRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    setIsSelecting(true)
    setStartPos({ x, y })
    setCurrentRect({ x, y, w: 0, h: 0 })
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isSelecting || !startPos || !overlayRef.current) return
    const rect = overlayRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    setCurrentRect({
      x: Math.min(x, startPos.x),
      y: Math.min(y, startPos.y),
      w: Math.abs(x - startPos.x),
      h: Math.abs(y - startPos.y),
    })
  }

  const handleMouseUp = async () => {
    setIsSelecting(false)
    if (!currentRect || !viewport || currentRect.w < 10 || currentRect.h < 10) {
      setCurrentRect(null)
      return
    }

    // Translate DOM bounding box to PDF coordinates
    // viewport.convertToPdfPoint takes [x, y]
    const [pdfX1, pdfY1] = viewport.convertToPdfPoint(currentRect.x, currentRect.y)
    const [pdfX2, pdfY2] = viewport.convertToPdfPoint(currentRect.x + currentRect.w, currentRect.y + currentRect.h)

    // PDF coordinate system is bottom-left origin, so Y scales differently
    const rectBox = [
      Math.min(pdfX1, pdfX2),
      Math.min(pdfY1, pdfY2),
      Math.abs(pdfX2 - pdfX1),
      Math.abs(pdfY2 - pdfY1),
    ] as [number, number, number, number]

    try {
      // Create and save the annotation through the existing backend pipeline
      const newAnnotation = makePdfAnnotation(noteId, filename, pageNumber, rectBox, '')
      await create(newAnnotation)
    } catch (err) {
      console.error('Failed to create annotation:', err)
      alert('Failed to save highlight.')
    } finally {
      setCurrentRect(null)
    }
  }

  // Render bounding boxes from backend
  const renderAnnotations = () => {
    if (!viewport) return null
    
    return pageAnnotations.map(a => {
      try {
        const pos = JSON.parse(a.position)
        const [pdfX, pdfY, pdfW, pdfH] = pos.rect
        
        // Convert from PDF internal scaling back to current viewport
        const [domX1, domY1] = viewport.convertToViewportPoint(pdfX, pdfY)
        const [domX2, domY2] = viewport.convertToViewportPoint(pdfX + pdfW, pdfY + pdfH)
        
        return (
          <div
            key={a.id}
            title={a.content || 'Highlight'}
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
              // Using a high z-index to overlay nicely
              zIndex: 10,
            }}
            onClick={(e) => {
              e.stopPropagation()
              const newContent = window.prompt('Edit highlight note:', a.content || '')
              if (newContent !== null && newContent !== a.content) {
                update(a.id, newContent)
              }
            }}
          />
        )
      } catch (err) {
        return null
      }
    })
  }

  if (error) {
    return <div className="pdf-error">{error}</div>
  }

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
        gap: '15px'
      }}
    >
      {/* Controls Bar */}
      <div className="pdf-controls" style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
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
        
        <div style={{ marginLeft: '10px', height: '24px', width: '1px', background: 'var(--border, #3a3a4a)' }} />
        
        <button 
          onClick={() => setScale(s => s === 'fit-width' ? 1.5 : (typeof s === 'number' ? s + 0.5 : 1.5))}
          style={{ padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', backgroundColor: 'var(--surface-3, #2a2a35)', color: 'white', border: 'none' }}
        >
          Zoom In
        </button>
        <button 
          onClick={() => setScale(s => typeof s === 'number' ? Math.max(0.5, s - 0.5) : 1.0)}
          style={{ padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', backgroundColor: 'var(--surface-3, #2a2a35)', color: 'white', border: 'none' }}
        >
          Zoom Out
        </button>
        <button 
          onClick={() => setScale('fit-width')}
          style={{ padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', backgroundColor: 'var(--surface-3, #2a2a35)', color: 'white', border: 'none' }}
        >
          Fit Width
        </button>
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
        
        {/* Transparent Overlay for Drawing Bounding Boxes */}
        <div
          ref={overlayRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp} // cancel if dragging out
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            cursor: 'crosshair',
            zIndex: 20
          }}
        >
          {/* Active Drawing Selection Box */}
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
              }}
            />
          )}

          {/* Render Persistent Annotations */}
          {renderAnnotations()}
        </div>
      </div>
    </div>
  )
}
