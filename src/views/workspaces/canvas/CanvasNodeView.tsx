import { memo, type CSSProperties } from 'react'
import type { CanvasNode, Side } from '../../../core/canvas'
import type { Note } from '../../../types'
import { AsyncImage } from '../../../ui/AsyncImage'
import { AsyncVideo } from '../../../ui/AsyncVideo'
import { AsyncAudio } from '../../../ui/AsyncAudio'
import { WebEmbed } from '../../../ui/WebEmbed'
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
const TYPE_ICON: Record<string, string> = { text: '📝', note: '📄', media: '🖼️', link: '🌐' }

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
  if (node.mediaType === 'video') return <div className={styles.mediaWrap}><AsyncVideo filename={file} controls preload="metadata" /></div>
  if (node.mediaType === 'audio') return <div className={styles.mediaWrap}><AsyncAudio filename={file} controls preload="metadata" /></div>
  if (node.mediaType === 'pdf') return <div className={styles.notePreview}>📕 {file}</div>
  return <div className={styles.mediaWrap}><AsyncImage filename={file} alt="" /></div>
}

function CanvasNodeViewInner({ node, selected, scale, note, onOpenNote, onChangeText }: Props) {
  const titleText =
    node.type === 'note' ? note?.title || 'Untitled' : node.type === 'media' ? 'Media' : node.type === 'link' ? 'Web page' : 'Note'

  return (
    <div
      data-node-id={node.id}
      className={`${styles.node} ${selected ? styles.nodeSelected : ''}`}
      style={{ left: node.x, top: node.y, width: node.width, height: node.height, borderColor: node.color }}
    >
      <div className={styles.nodeHeader} data-drag>
        <span className={styles.nodeIcon} aria-hidden="true">{TYPE_ICON[node.type] ?? '📝'}</span>
        <span className={styles.nodeTitle}>{titleText}</span>
      </div>

      <div className={styles.nodeBody}>
        {node.type === 'text' && (
          <textarea
            className={styles.nodeText}
            value={node.text ?? ''}
            placeholder="Type…"
            onChange={(e) => onChangeText?.(node.id, e.target.value)}
          />
        )}
        {node.type === 'note' && (
          <>
            <div className={styles.noteTitleBig}>{note?.title || 'Untitled'}</div>
            <div className={styles.notePreview}>{note ? preview(note.content, 200) || 'No content' : 'Note not found'}</div>
            {note && onOpenNote && (
              <button className={styles.openBtn} onClick={() => onOpenNote(note)}>Open</button>
            )}
          </>
        )}
        {node.type === 'media' && <MediaBody node={node} />}
        {node.type === 'link' && node.url && <WebEmbed url={node.url} compact />}
      </div>

      {selected && (
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
