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
}

const MIN_WIDTH = 80

export function ResizableMediaFrame({ noteId, mediaKey, layout, children, onMoveUp, onMoveDown }: Props) {
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
    if (effective?.alignment === alignment) {
      persist({ ...effective, alignment: undefined }, true)
    } else {
      // block + margin-auto centering requires an explicit width; grab the
      // current rendered width when the user hasn't resized yet so the
      // alignment is actually visible.
      const width = effective?.width ?? Math.round(frameRef.current?.getBoundingClientRect().width ?? 320)
      persist({ ...effective, alignment, width }, true)
    }
  }

  return (
    <span className={styles.frame} ref={frameRef} onClick={(e) => e.stopPropagation()}>
      <span className={styles.toolbar}>
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
