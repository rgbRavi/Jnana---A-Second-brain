// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// A canvas text card's text with its [[wikilinks]] rendered as clickable links —
// shared by the live board (CanvasNodeView) and the read-only preview
// (CanvasStatic). Everything but the links lets pointer events pass through, so
// dragging/selecting the card (or clicking a gallery card) still works.

import styles from './canvas.module.css'

export function CanvasWikilinkText({ text, onOpen }: { text: string; onOpen: (title: string) => void }) {
  return (
    <>
      {text.split(/(\[\[.*?\]\])/g).map((part, i) => {
        const title = /^\[\[(.*)\]\]$/.exec(part)?.[1].trim()
        if (!title) return part
        return (
          <button
            key={i}
            type="button"
            className={styles.wikilink}
            title={`Open “${title}”`}
            onPointerDown={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              onOpen(title)
            }}
          >
            {title}
          </button>
        )
      })}
    </>
  )
}
