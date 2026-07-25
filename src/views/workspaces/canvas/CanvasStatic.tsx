// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Read-only, non-interactive canvas preview for the note-type View (gallery
// cards + NoteModal peek). Deliberately lightweight — nodes render as labelled
// boxes (no media players / web embeds), ink reuses DrawLayer, edges are simple
// straight lines — so a card that shows a canvas note stays cheap to mount.

import { useMemo } from 'react'
import { parseDoc, type CanvasNode } from '../../../core/canvas'
import type { Note } from '../../../types'
import { preview } from '../../home/dashboard/format'
import { DrawLayer } from './DrawLayer'
import styles from './canvas.module.css'

interface Props {
  content: string
  /** Preview height in px (card default; the modal peek can pass more). */
  height?: number
  allNotes: Note[]
}

const PAD = 40

function bounds(nodes: CanvasNode[], drawings: { points: [number, number, number][] }[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const n of nodes) {
    minX = Math.min(minX, n.x); minY = Math.min(minY, n.y)
    maxX = Math.max(maxX, n.x + n.width); maxY = Math.max(maxY, n.y + n.height)
  }
  for (const d of drawings) for (const [x, y] of d.points) {
    minX = Math.min(minX, x); minY = Math.min(minY, y)
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y)
  }
  if (!isFinite(minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0 }
  return { minX, minY, maxX, maxY }
}

function nodeLabel(n: CanvasNode, noteMap: Map<string, Note>): string {
  if (n.type === 'note') return (n.noteId ? noteMap.get(n.noteId)?.title : '') || 'Note'
  if (n.type === 'text') return n.text ? preview(n.text) : ''
  if (n.type === 'link') return n.url ?? 'Web page'
  if (n.type === 'media') return n.mediaType ? `${n.mediaType}` : 'Media'
  return ''
}

export function CanvasStatic({ content, height = 220, allNotes }: Props) {
  const doc = useMemo(() => parseDoc(content), [content])
  const noteMap = useMemo(() => new Map(allNotes.map((n) => [n.id, n])), [allNotes])

  const isEmpty = doc.nodes.length === 0 && doc.drawings.length === 0
  const { minX, minY, maxY } = useMemo(() => bounds(doc.nodes, doc.drawings), [doc])

  // Fit the content box into the preview area (width unknown until layout, so we
  // fit by height and let CSS width follow; scale is clamped for tiny/huge docs).
  const contentH = maxY - minY + PAD * 2
  const scale = isEmpty ? 1 : Math.min(1, height / Math.max(contentH, 1))
  const tx = -(minX - PAD) * scale
  const ty = -(minY - PAD) * scale

  const centerOf = (n: CanvasNode) => ({ x: n.x + n.width / 2, y: n.y + n.height / 2 })

  if (isEmpty) {
    return (
      <div className={styles.staticPreview} style={{ height }}>
        <span className={styles.staticEmpty}>Empty canvas</span>
      </div>
    )
  }

  return (
    <div className={styles.staticPreview} style={{ height }}>
      <div className={styles.world} style={{ transform: `translate(${tx}px, ${ty}px) scale(${scale})` }}>
        <svg className={styles.edgeSvg} aria-hidden="true">
          {doc.edges.flatMap((e) => {
            const from = doc.nodes.find((n) => n.id === e.fromNode)
            const to = doc.nodes.find((n) => n.id === e.toNode)
            if (!from || !to) return []
            const a = centerOf(from), b = centerOf(to)
            return [<line key={e.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--text-3)" strokeWidth={2} />]
          })}
        </svg>
        {doc.nodes.map((n) => (
          <div
            key={n.id}
            className={styles.staticNode}
            style={{
              left: n.x, top: n.y, width: n.width, height: n.height,
              background: n.color || 'var(--surface-2)',
            }}
          >
            {nodeLabel(n, noteMap)}
          </div>
        ))}
        <DrawLayer drawings={doc.drawings} live={null} />
      </div>
    </div>
  )
}
