import type { CSSProperties, RefObject } from 'react'
import type { FormatKind } from '../../core/markdown/format'
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
    </div>
  )
}
