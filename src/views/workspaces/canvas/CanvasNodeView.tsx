import { memo, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import type { CanvasNode, Side } from '../../../core/canvas'
import type { Note } from '../../../types'
import { AsyncImage } from '../../../ui/AsyncImage'
import { AsyncVideo } from '../../../ui/AsyncVideo'
import { AsyncAudio } from '../../../ui/AsyncAudio'
import { WebEmbed } from '../../../ui/WebEmbed'
import { PdfViewer } from '../../../ui/media/PdfViewer'
import { preview } from '../../home/dashboard/format'
import styles from './canvas.module.css'

interface Props {
  node: CanvasNode
  selected: boolean
  /** Current zoom — chrome (handles) is counter-scaled to stay a constant size. */
  scale: number
  /** Resolved note for `note` nodes. */
  note?: Note
  onOpenNote?: (note: Note) => void
  onChangeText?: (id: string, text: string) => void
}

const SIDES: Side[] = ['top', 'right', 'bottom', 'left']

function sideStyle(side: Side, s: number): CSSProperties {
  const sz = 11 / s
  const off = -sz / 2
  const base: CSSProperties = { width: sz, height: sz }
  if (side === 'top') return { ...base, top: off, left: `calc(50% - ${sz / 2}px)` }
  if (side === 'bottom') return { ...base, bottom: off, left: `calc(50% - ${sz / 2}px)` }
  if (side === 'left') return { ...base, left: off, top: `calc(50% - ${sz / 2}px)` }
  return { ...base, right: off, top: `calc(50% - ${sz / 2}px)` }
}

function MediaBody({ node }: { node: CanvasNode }) {
  const file = node.file ?? ''
  if (node.mediaType === 'video') return <div className={styles.mediaWrap} data-nodrag><AsyncVideo filename={file} controls preload="metadata" /></div>
  if (node.mediaType === 'audio') return <div className={styles.mediaWrap} data-nodrag><AsyncAudio filename={file} controls preload="metadata" /></div>
  if (node.mediaType === 'pdf') return <div className={styles.pdfWrap} data-nodrag><PdfViewer filename={file} noteId="" readOnly /></div>
  return <div className={styles.mediaWrap}><AsyncImage filename={file} alt="" /></div>
}

function CanvasNodeViewInner({ node, selected, scale, note, onOpenNote, onChangeText }: Props) {
  const [editing, setEditing] = useState(false)
  const textRef = useRef<HTMLTextAreaElement>(null)
  const isNote = node.type === 'note'
  const isText = node.type === 'text'

  // Drop into edit mode focuses the (now-interactive) textarea.
  useEffect(() => {
    if (editing) textRef.current?.focus()
  }, [editing])

  const onTextKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') { e.preventDefault(); setEditing(false) }
  }

  const onCardDoubleClick = isText && !editing
    ? () => setEditing(true)
    : isNote && note && onOpenNote
      ? () => onOpenNote(note)
      : undefined

  return (
    <div
      data-node-id={node.id}
      data-drag={!isNote && !(isText && editing) ? true : undefined}
      className={`${styles.node} ${selected ? styles.nodeSelected : ''}`}
      style={{
        left: node.x, top: node.y, width: node.width, height: node.height,
        borderColor: node.color,
        background: node.color ? `color-mix(in srgb, ${node.color} 16%, var(--surface))` : undefined,
      }}
      onDoubleClick={onCardDoubleClick}
    >
      {isNote ? (
        <div
          className={styles.nodeHeader}
          data-drag
          style={node.color ? { background: `color-mix(in srgb, ${node.color} 22%, var(--surface-2))` } : undefined}
        >
          <span className={styles.nodeIcon} aria-hidden="true">📄</span>
          <span className={styles.nodeTitle}>{note?.title || 'Untitled'}</span>
          {node.pinned && <span className={styles.pinBadge} title="Pinned" aria-label="Pinned">📌</span>}
        </div>
      ) : (
        node.pinned && <span className={styles.pinBadgeFloating} title="Pinned" aria-label="Pinned">📌</span>
      )}

      {isNote && note && onOpenNote && (
        <button
          className={styles.openCorner}
          title="Open note"
          // Stop the press from starting a board gesture / node selection.
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onOpenNote(note) }}
        >
          ⤢
        </button>
      )}

      <div className={styles.nodeBody}>
        {isText && (
          <textarea
            ref={textRef}
            className={styles.nodeText}
            data-nodrag={editing ? true : undefined}
            value={node.text ?? ''}
            placeholder="Double-click to edit…"
            readOnly={!editing}
            style={{ pointerEvents: editing ? 'auto' : 'none', cursor: editing ? 'text' : 'inherit' }}
            onChange={(e) => onChangeText?.(node.id, e.target.value)}
            onBlur={() => setEditing(false)}
            onKeyDown={onTextKeyDown}
          />
        )}
        {isNote && (
          <>
            <div className={styles.noteTitleBig}>{note?.title || 'Untitled'}</div>
            <div className={styles.notePreview}>{note ? preview(note.content, 200) || 'No content' : 'Note not found'}</div>
          </>
        )}
        {node.type === 'media' && <MediaBody node={node} />}
        {node.type === 'link' && node.url && (
          <div className={styles.webWrap} data-nodrag><WebEmbed url={node.url} compact /></div>
        )}
      </div>

      {selected && !node.pinned && (
        <>
          {SIDES.map((side) => (
            <span key={side} data-side={side} className={styles.sideHandle} style={sideStyle(side, scale)} />
          ))}
          <span data-resize className={styles.resizeHandle} style={{ width: 14 / scale, height: 14 / scale }} />
        </>
      )}
    </div>
  )
}

export const CanvasNodeView = memo(CanvasNodeViewInner)
