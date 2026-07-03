// A live, Obsidian/Typora-style markdown editor: a thin React wrapper around
// a vanilla CodeMirror 6 EditorView. The stored value is always the literal
// markdown string — CM6 decorations (see LiveEditor.decorations.tsx) are a
// pure visual overlay that never touches it, so every other consumer of note
// content (export, tags, AI chunking, search, Rust sync_links) keeps reading
// exactly what's typed, unchanged.
//
// The EditorView is created once and never torn down/rebuilt on parent
// re-renders — callbacks are read through refs so a fresh inline arrow from
// the parent doesn't reset cursor/undo history.

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { EditorSelection, EditorState } from '@codemirror/state'
import { EditorView, keymap, placeholder as placeholderExt } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { commonmarkLanguage, markdown } from '@codemirror/lang-markdown'
import { GFM } from '@lezer/markdown'
import { writeText, readText } from '@tauri-apps/plugin-clipboard-manager'
import type { Note } from '../../types'
import { applyFormat, escapeMarkdownText, moveMediaBlock, type FormatKind } from '../../core/markdown/format'
import { lezerJnana } from '../../core/markdown/lezerJnana'
import { getMediaLayout, type MediaLayout } from '../../core/mediaLayout'
import type { ComposerToolbarProps } from '../../hooks/useComposer'
import { showPromptDialog } from '../../lib/dialog'
import { toast } from '../../lib/toast'
import { ContextMenu, type MenuItem } from '../ContextMenu'
import { liveDecorations, forceRebuildMediaLayout, type LiveContext } from './LiveEditor.decorations'
import styles from './LiveEditor.module.css'

export interface LiveEditorHandle {
  focus(): void
  applyFormatAtSelection(kind: FormatKind): void
  insertAtCursor(markdown: string): void
  cut(): Promise<void>
  copy(): Promise<void>
  paste(): Promise<void>
  pastePlain(): Promise<void>
}

interface Props {
  value: string
  onChange: (value: string) => void
  /** Cmd/Ctrl+Enter — typically "save". */
  onSubmit?: () => void
  /** Escape — typically "cancel edit". */
  onCancel?: () => void
  onPaste?: (e: ClipboardEvent) => void
  placeholder?: string
  className?: string
  autoFocus?: boolean
  noteId?: string
  notes: Note[]
  /** Gate clicking a wikilink through to the linked note (false for an
   *  unsaved draft, e.g. NoteCreator, where navigating away doesn't apply). */
  allowNavigate?: boolean
  lazy?: boolean
  /** Powers the right-click menu's Import submenu — wired by the parent as a
   *  second `useComposer` instance whose inserts route to the click position
   *  instead of appending. Omitted hides that submenu. */
  importHandlers?: Pick<ComposerToolbarProps, 'onImageUpload' | 'onVideoUpload' | 'onAudioUpload' | 'onDocumentUpload'>
}

/** Find the document offset of the `![alt](url)` token whose media_key
 *  (url#ordinal) matches `targetMediaKey`. Used by `moveMedia` so the widget
 *  can pass a stable identity string instead of a shifting position number. */
function findMediaPositionByKey(doc: string, targetMediaKey: string): number | null {
  const regex = /!\[[^\]]*\]\(([^)]+)\)/g
  const urlOrdinals = new Map<string, number>()
  let match: RegExpExecArray | null
  while ((match = regex.exec(doc)) !== null) {
    const url = match[1]
    const ordinal = urlOrdinals.get(url) ?? 0
    urlOrdinals.set(url, ordinal + 1)
    if (`${url}#${ordinal}` === targetMediaKey) return match.index
  }
  return null
}

const jnanaTheme = EditorView.theme({
  '&': { backgroundColor: 'transparent' },
})

const FORMAT_MENU_ITEMS: { kind: FormatKind; label: string }[] = [
  { kind: 'bold', label: 'Bold' },
  { kind: 'italic', label: 'Italic' },
  { kind: 'strike', label: 'Strikethrough' },
  { kind: 'code', label: 'Inline code' },
  { kind: 'h1', label: 'Heading 1' },
  { kind: 'h2', label: 'Heading 2' },
  { kind: 'ul', label: 'Bullet list' },
  { kind: 'ol', label: 'Numbered list' },
  { kind: 'quote', label: 'Quote' },
  { kind: 'codeblock', label: 'Code block' },
  { kind: 'link', label: 'Link' },
]

export const LiveEditor = forwardRef<LiveEditorHandle, Props>(function LiveEditor(
  {
    value,
    onChange,
    onSubmit,
    onCancel,
    onPaste,
    placeholder,
    className,
    autoFocus,
    noteId = '',
    notes,
    allowNavigate = false,
    lazy = true,
    importHandlers,
  },
  ref,
) {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const [menuState, setMenuState] = useState<{ x: number; y: number; hasSelection: boolean } | null>(null)

  // Stable callback refs — read by extensions created once at mount.
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const onSubmitRef = useRef(onSubmit)
  onSubmitRef.current = onSubmit
  const onCancelRef = useRef(onCancel)
  onCancelRef.current = onCancel
  const onPasteRef = useRef(onPaste)
  onPasteRef.current = onPaste
  const showMenuRef = useRef((_x: number, _y: number, _hasSelection: boolean) => {})
  showMenuRef.current = (x, y, hasSelection) => setMenuState({ x, y, hasSelection })

  // Stable — closes only over `viewRef` (never changes), so widget `eq()`
  // checks comparing this reference stay `true` across decoration rebuilds.
  // Accepts `mediaKey` (url#ordinal) and finds the document position at
  // call-time, so `tokenFrom` never appears in widget props — otherwise every
  // keystroke above a media widget shifts its position, fails eq(), and
  // remounts the React root (video player reset, image flicker, etc.).
  const moveMedia = useCallback((mediaKey: string, direction: 'up' | 'down') => {
    const view = viewRef.current
    if (!view) return
    const doc = view.state.doc.toString()
    const tokenFrom = findMediaPositionByKey(doc, mediaKey)
    if (tokenFrom == null) return
    const result = moveMediaBlock(doc, tokenFrom, direction)
    if (!result) return
    view.dispatch({ changes: result })
    view.focus()
  }, [])

  // Live context for the decorations plugin — same ref-read pattern, since
  // `notes`/`allowNavigate` can change without the doc/selection changing.
  const [mediaLayout, setMediaLayout] = useState<Map<string, MediaLayout>>(new Map())
  const contextRef = useRef<LiveContext>({ notes, noteId, allowNavigate, lazy, mediaLayout, moveMedia })
  contextRef.current = { notes, noteId, allowNavigate, lazy, mediaLayout, moveMedia }

  // Loaded async (a local SQLite query, but still after first paint) — nudge
  // the decoration plugin to rebuild once it lands, since loading it doesn't
  // touch the doc/selection (the only two things that normally trigger a
  // rebuild) and resize affordances live entirely in the live editor.
  useEffect(() => {
    if (!noteId) return
    let active = true
    getMediaLayout(noteId)
      .then((map) => { if (active) setMediaLayout(map) })
      .catch(() => {})
    return () => { active = false }
  }, [noteId])

  useEffect(() => {
    viewRef.current?.dispatch({ effects: forceRebuildMediaLayout.of() })
  }, [mediaLayout])

  const applyFormatAtSelection = (kind: FormatKind) => {
    const view = viewRef.current
    if (!view) return
    const { from, to } = view.state.selection.main
    const text = view.state.doc.toString()
    const result = applyFormat(text, from, to, kind)
    view.dispatch({
      changes: { from: 0, to: text.length, insert: result.text },
      selection: { anchor: result.selStart, head: result.selEnd },
    })
    view.focus()
  }

  const insertAtCursor = (md: string) => {
    const view = viewRef.current
    if (!view) return
    const { from, to } = view.state.selection.main
    view.dispatch({ changes: { from, to, insert: md }, selection: { anchor: from + md.length } })
    view.focus()
  }

  const doCopy = async () => {
    const view = viewRef.current
    if (!view) return
    const { from, to } = view.state.selection.main
    if (from === to) return
    await writeText(view.state.sliceDoc(from, to))
  }

  const doCut = async () => {
    const view = viewRef.current
    if (!view) return
    const { from, to } = view.state.selection.main
    if (from === to) return
    await writeText(view.state.sliceDoc(from, to))
    view.dispatch({ changes: { from, to, insert: '' } })
    view.focus()
  }

  const doPaste = async (plain: boolean) => {
    let text: string
    try {
      text = await readText()
    } catch {
      return
    }
    insertAtCursor(plain ? escapeMarkdownText(text) : text)
  }

  const handleYouTubeImport = async () => {
    const url = await showPromptDialog({
      title: 'Embed YouTube video',
      message: 'Paste a YouTube link to embed the video in your note.',
      placeholder: 'https://youtube.com/watch?v=…',
      confirmLabel: 'Embed',
    })
    if (!url) return
    const shortMatch = url.match(/youtu\.be\/([a-zA-Z0-9_-]+)/)
    const watchMatch = url.match(/(?:youtube\.com\/watch\?v=|youtube\.com\/embed\/)([a-zA-Z0-9_-]+)/)
    const videoId = shortMatch?.[1] || watchMatch?.[1]
    if (!videoId) {
      toast.error('Could not extract a YouTube video ID from that URL.')
      return
    }
    insertAtCursor(`\n![youtube](https://youtube.com/watch?v=${videoId})`)
  }

  const handleWebpageImport = async () => {
    const raw = await showPromptDialog({
      title: 'Embed web page',
      message: 'Paste a link to embed it as a preview card in your note.',
      placeholder: 'https://example.com/article',
      confirmLabel: 'Embed',
    })
    if (!raw) return
    const url = /^https?:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`
    insertAtCursor(`\n![webpage](${url})`)
  }

  const buildMenuItems = (hasSelection: boolean): MenuItem[] => {
    const items: MenuItem[] = [
      {
        label: 'Formatting',
        children: FORMAT_MENU_ITEMS.map(({ kind, label }) => ({
          label,
          onClick: () => applyFormatAtSelection(kind),
        })),
      },
    ]
    if (importHandlers) {
      items.push({
        label: 'Import',
        children: [
          { label: 'Image', onClick: () => imageInputRef.current?.click() },
          { label: 'Video', onClick: importHandlers.onVideoUpload },
          { label: 'Audio', onClick: importHandlers.onAudioUpload },
          { label: 'Document / File', onClick: importHandlers.onDocumentUpload },
          { label: 'YouTube embed', onClick: () => void handleYouTubeImport() },
          { label: 'Web page', onClick: () => void handleWebpageImport() },
        ],
      })
    }
    items.push(
      { label: 'Cut', separator: true, disabled: !hasSelection, onClick: () => void doCut() },
      { label: 'Copy', disabled: !hasSelection, onClick: () => void doCopy() },
      { label: 'Paste', onClick: () => void doPaste(false) },
      { label: 'Paste as plain text', onClick: () => void doPaste(true) },
      { label: 'Add table', separator: true, onClick: () => toast.info('Tables are not implemented yet.') },
    )
    return items
  }

  useImperativeHandle(ref, () => ({
    focus() {
      viewRef.current?.focus()
    },
    applyFormatAtSelection,
    insertAtCursor,
    cut: doCut,
    copy: doCopy,
    paste: () => doPaste(false),
    pastePlain: () => doPaste(true),
  }), [])

  // Mount once. Intentionally empty deps — value/placeholder/autoFocus are
  // handled by the sync effects below, not by recreating the view.
  useEffect(() => {
    if (!hostRef.current) return

    const state = EditorState.create({
      doc: value,
      extensions: [
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        markdown({ base: commonmarkLanguage, extensions: [GFM, lezerJnana], completeHTMLTags: false }),
        EditorView.lineWrapping,
        placeholder ? placeholderExt(placeholder) : [],
        liveDecorations(contextRef),
        // domEventHandlers (not keymap) so we get the raw event and can
        // stopPropagation() — neither combo has a default CM6 binding, but
        // the composers also attach their own Cmd+Enter/Escape handling to
        // an ancestor element (e.g. for the title field), and preventDefault
        // alone doesn't stop bubbling, which would double-fire save/cancel.
        EditorView.domEventHandlers({
          keydown(event) {
            if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
              event.preventDefault()
              event.stopPropagation()
              onSubmitRef.current?.()
              return true
            }
            if (event.key === 'Escape') {
              event.preventDefault()
              event.stopPropagation()
              onCancelRef.current?.()
              return true
            }
            return false
          },
          paste(event) {
            onPasteRef.current?.(event)
          },
          contextmenu(event, view) {
            event.preventDefault()
            const pos = view.posAtCoords({ x: event.clientX, y: event.clientY })
            if (pos != null) {
              const sel = view.state.selection.main
              if (pos < sel.from || pos > sel.to) view.dispatch({ selection: EditorSelection.cursor(pos) })
            }
            showMenuRef.current(event.clientX, event.clientY, !view.state.selection.main.empty)
            return true
          },
        }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChangeRef.current(update.state.doc.toString())
        }),
        jnanaTheme,
      ],
    })

    const view = new EditorView({ state, parent: hostRef.current })
    viewRef.current = view
    if (autoFocus) view.focus()

    return () => {
      view.destroy()
      viewRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sync external changes (e.g. toolbar/AI-inserted markdown) into the view.
  // User-driven edits already match by the time this runs, so this is a
  // no-op for the common case — it only actually dispatches when `value`
  // diverges from the editor's own current document.
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const current = view.state.doc.toString()
    if (current === value) return
    view.dispatch({
      changes: { from: 0, to: current.length, insert: value },
      selection: { anchor: value.length },
    })
  }, [value])

  return (
    <>
      <div ref={hostRef} className={`${styles.host} ${className ?? ''}`} />
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => {
          void importHandlers?.onImageUpload(e.target.files?.[0], () => {
            if (imageInputRef.current) imageInputRef.current.value = ''
          })
        }}
      />
      {menuState && (
        <ContextMenu
          x={menuState.x}
          y={menuState.y}
          items={buildMenuItems(menuState.hasSelection)}
          onClose={() => setMenuState(null)}
        />
      )}
    </>
  )
})
