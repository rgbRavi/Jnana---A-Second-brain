// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react'
import type { FormatKind } from '../../core/markdown/format'
import { COLOR_PALETTE } from '../../core/markdown/colors'
import type { LiveEditorHandle } from './LiveEditor'
import styles from './FormatToolbar.module.css'

interface Props {
  editorRef: RefObject<LiveEditorHandle | null>
  disabled?: boolean
}

const BUTTONS: { kind: FormatKind; label: string; title: string; style?: CSSProperties }[] = [
  { kind: 'bold', label: 'B', title: 'Bold', style: { fontWeight: 700 } },
  { kind: 'italic', label: 'I', title: 'Italic', style: { fontStyle: 'italic' } },
  { kind: 'strike', label: 'S', title: 'Strikethrough', style: { textDecoration: 'line-through' } },
  { kind: 'code', label: '</>', title: 'Inline code' },
  { kind: 'h1', label: 'H1', title: 'Heading 1' },
  { kind: 'h2', label: 'H2', title: 'Heading 2' },
  { kind: 'ul', label: '•', title: 'Bullet list' },
  { kind: 'ol', label: '1.', title: 'Numbered list' },
  { kind: 'quote', label: '❝', title: 'Quote' },
  { kind: 'codeblock', label: '{ }', title: 'Code block' },
  { kind: 'link', label: '🔗', title: 'Link' },
]

/** A row of markdown formatting buttons that wrap/prefix the live editor's
 *  current selection (see core/markdown/format.ts) — shared by NoteCreator,
 *  NoteItem's edit mode, and NoteModal's edit mode. */
export function FormatToolbar({ editorRef, disabled }: Props) {
  return (
    <div className={styles.toolbar}>
      {BUTTONS.map((b) => (
        <button
          key={b.kind}
          type="button"
          className={styles.btn}
          style={b.style}
          title={b.title}
          disabled={disabled}
          onClick={() => editorRef.current?.applyFormatAtSelection(b.kind)}
        >
          {b.label}
        </button>
      ))}
      <SwatchDropdown
        title="Text colour"
        glyph={<span className={styles.colorGlyph} aria-hidden="true">A</span>}
        onPick={(color) => editorRef.current?.applyColorAtSelection(color)}
        disabled={disabled}
      />
      <SwatchDropdown
        title="Highlight"
        glyph={<span className={styles.highlightGlyph} aria-hidden="true">A</span>}
        onPick={(color) => editorRef.current?.applyHighlightAtSelection(color)}
        disabled={disabled}
      />
    </div>
  )
}

interface SwatchDropdownProps {
  title: string
  glyph: ReactNode
  onPick: (color: string) => void
  disabled?: boolean
}

/** A colour-swatch dropdown — the curated palette plus a native custom-colour
 *  picker. `onPick` receives a palette name or a raw `#hex` (both understood by
 *  colors.ts). Closes on pick, Escape, or an outside press. Shared by the text-
 *  colour and highlight buttons. */
function SwatchDropdown({ title, glyph, onPick, disabled }: SwatchDropdownProps) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const pick = (color: string) => {
    onPick(color)
    setOpen(false)
  }

  return (
    <div className={styles.colorWrap} ref={wrapRef}>
      <button
        type="button"
        className={styles.btn}
        title={title}
        disabled={disabled}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {glyph}
      </button>
      {open && (
        <div className={styles.palette} role="menu">
          {COLOR_PALETTE.map((c) => (
            <button
              key={c.name}
              type="button"
              className={styles.swatch}
              style={{ background: c.hex }}
              title={c.label}
              aria-label={c.label}
              onClick={() => pick(c.name)}
            />
          ))}
          {/* Custom colour — a directly-styled native picker (no opacity-0
              overlay, which didn't reliably forward clicks in the webview). The
              token accepts a raw #hex (see colors.ts). `change` fires once, on
              commit, so it applies + closes exactly once. */}
          <input
            type="color"
            className={styles.customSwatch}
            title="Custom colour…"
            aria-label="Custom colour"
            onChange={(e) => pick(e.currentTarget.value)}
          />
        </div>
      )}
    </div>
  )
}
