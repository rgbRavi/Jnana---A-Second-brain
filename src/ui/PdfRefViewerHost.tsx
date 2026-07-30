// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { eventBus } from '../lib/eventBus'
import { PdfViewer } from './media/PdfViewer'
import MdStyles from './editor/MarkdownLite.module.css'

interface OpenReq { filename: string; noteId: string; page: number; x: number; y: number }

/** Global listener: a DocRefChip's `pdf:open` opens the referenced PDF in a
 *  fullscreen overlay, jumps to the page and pulses the point. Mounted once. */
export function PdfRefViewerHost() {
  const [req, setReq] = useState<OpenReq | null>(null)
  const setPage = useRef<((p: number) => void) | null>(null)
  const reveal = useRef<((p: number, x: number, y: number) => void) | null>(null)

  useEffect(() => {
    const handler = (payload: OpenReq) => setReq(payload)
    eventBus.on('pdf:open', handler)
    return () => eventBus.off('pdf:open', handler)
  }, [])

  useEffect(() => {
    if (!req) return
    // Give the viewer a tick to register its setters + render the page.
    const t = setTimeout(() => {
      if (reveal.current) reveal.current(req.page, req.x, req.y)
      else setPage.current?.(req.page)
    }, 150)
    return () => clearTimeout(t)
  }, [req])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setReq(null) }
    if (req) document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [req])

  if (!req) return null
  return createPortal(
    <div className={MdStyles.fullscreenOverlay} onClick={() => setReq(null)}>
      <div className={MdStyles.fullscreenContent} onClick={(e) => e.stopPropagation()}>
        <button className={MdStyles.fullscreenClose} onClick={() => setReq(null)} aria-label="Close"><X size={18} /></button>
        <PdfViewer
          filename={req.filename}
          noteId={req.noteId}
          onRegisterPageSetter={(fn) => { setPage.current = fn }}
          onRegisterReveal={(fn) => { reveal.current = fn }}
        />
      </div>
    </div>,
    document.body,
  )
}
