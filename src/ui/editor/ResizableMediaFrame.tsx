// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Resize/align chrome for media widgets in the live editor (read-mode never
// shows this — see NoteEmbeds.tsx, which only ever applies the *saved* size).
// A thin wrapper around whatever embed it's given: shows a corner resize
// handle + L/C/R alignment buttons on hover, using the same pointer-capture
// gesture pattern as the canvas board's node resize. Writes are debounced and
// land in note_media_layout — the markdown text itself is never touched.

import { useRef, useState, type ReactNode } from 'react'
import { setMediaLayoutDebounced, type MediaAlignment, type MediaLayout } from '../../core/mediaLayout'
import styles from './ResizableMediaFrame.module.css'

interface Props {
  noteId: string
  mediaKey: string
  /** The size/alignment loaded from note_media_layout, if any. */
  layout: MediaLayout | undefined
  children: (layout: MediaLayout | undefined) => ReactNode
  onMoveUp?: () => void
  onMoveDown?: () => void
  /** Begins a pointer drag to reorder / row-up this embed. Owned by LiveEditor
   *  (which has the EditorView needed to hit-test the drop target). */
  onDragStart?: (e: React.PointerEvent) => void
  /** Reports a layout change back to the editor. Alignment needs this because
   *  it's rendered as the container's text-align (a line decoration derived
   *  from the editor's layout map), not the embed's own style. */
  onLayoutChange?: (mediaKey: string, layout: MediaLayout) => void
}

const MIN_WIDTH = 80

export function ResizableMediaFrame({ noteId, mediaKey, layout, children, onMoveUp, onMoveDown, onDragStart, onLayoutChange }: Props) {
  const frameRef = useRef<HTMLSpanElement>(null)
  const gestureRef = useRef<{ startX: number; startWidth: number } | null>(null)
  // Once the user resizes/aligns this session, that takes precedence over the
  // (now stale) `layout` prop — same pattern as the canvas's optimistic drag state.
  const [liveLayout, setLiveLayout] = useState<MediaLayout | undefined>(undefined)
  const effective = liveLayout ?? layout

  const persist = (next: MediaLayout, immediate: boolean) => {
    setLiveLayout(next)
    if (!mediaKey) return
    setMediaLayoutDebounced(noteId, mediaKey, next, immediate ? 0 : 400)
  }

  const handleResizeDown = (e: React.PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const startWidth = effective?.width ?? frameRef.current?.getBoundingClientRect().width ?? 320
    gestureRef.current = { startX: e.clientX, startWidth }

    const onMove = (ev: PointerEvent) => {
      if (!gestureRef.current) return
      const width = Math.max(MIN_WIDTH, Math.round(gestureRef.current.startWidth + (ev.clientX - gestureRef.current.startX)))
      setLiveLayout({ ...effective, width })
    }
    const onUp = () => {
      gestureRef.current = null
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      setLiveLayout((cur) => {
        if (cur) persist(cur, true)
        return cur
      })
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const setAlignment = (e: React.MouseEvent, alignment: MediaAlignment) => {
    e.preventDefault()
    e.stopPropagation()
    // Alignment justifies the embed's row/paragraph via the container's
    // text-align (see mediaLayoutStyle) — no width needed, and it never breaks
    // a side-by-side row. Click the active alignment again to clear it.
    const nextAlignment = effective?.alignment === alignment ? undefined : alignment
    const nextLayout = { ...effective, alignment: nextAlignment }
    persist(nextLayout, true)
    // The container's text-align is derived from the editor's layout map, so it
    // must be told about the change to rebuild — otherwise align wouldn't show
    // until reload (resize needs no such nudge; it styles the embed directly).
    onLayoutChange?.(mediaKey, nextLayout)
  }

  return (
    <span className={styles.frame} ref={frameRef} data-media-key={mediaKey} onClick={(e) => e.stopPropagation()}>
      <span className={styles.toolbar}>
        {onDragStart && (
          <>
            <button
              type="button"
              className={styles.dragHandle}
              title="Drag to move — drop beside another to place them side by side"
              aria-label="Drag to move media"
              onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); onDragStart(e) }}
            >
              ⠿
            </button>
            <span className={styles.toolbarSep} />
          </>
        )}
        <button
          type="button"
          className={`${styles.alignBtn} ${effective?.alignment === 'left' ? styles.alignBtnActive : ''}`}
          title="Align left"
          onClick={(e) => setAlignment(e, 'left')}
        >
          ⯇
        </button>
        <button
          type="button"
          className={`${styles.alignBtn} ${effective?.alignment === 'center' ? styles.alignBtnActive : ''}`}
          title="Align center"
          onClick={(e) => setAlignment(e, 'center')}
        >
          ▣
        </button>
        <button
          type="button"
          className={`${styles.alignBtn} ${effective?.alignment === 'right' ? styles.alignBtnActive : ''}`}
          title="Align right"
          onClick={(e) => setAlignment(e, 'right')}
        >
          ⯈
        </button>
        {(onMoveUp ?? onMoveDown) && <span className={styles.toolbarSep} />}
        {onMoveUp && (
          <button
            type="button"
            className={styles.alignBtn}
            title="Move up"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onMoveUp() }}
          >
            ▲
          </button>
        )}
        {onMoveDown && (
          <button
            type="button"
            className={styles.alignBtn}
            title="Move down"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onMoveDown() }}
          >
            ▼
          </button>
        )}
      </span>
      {children(effective)}
      <span className={styles.resizeHandle} onPointerDown={handleResizeDown} title="Drag to resize" />
    </span>
  )
}
