// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

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
import type { PointerEvent as ReactPointerEvent } from 'react'
import { EditorSelection, EditorState } from '@codemirror/state'
import { EditorView, keymap, placeholder as placeholderExt } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { commonmarkLanguage, markdown } from '@codemirror/lang-markdown'
import { GFM } from '@lezer/markdown'
import { writeText, readText } from '@tauri-apps/plugin-clipboard-manager'
import type { Note } from '../../types'
import { applyFormat, escapeMarkdownText, moveMediaBlock, rearrangeMedia, type FormatKind, type MediaPlacement } from '../../core/markdown/format'
import { lezerJnana } from '../../core/markdown/lezerJnana'
import { getMediaLayout, type MediaLayout } from '../../core/mediaLayout'
import type { ComposerToolbarProps } from '../../hooks/useComposer'
import { showPromptDialog } from '../../lib/dialog'
import { toast } from '../../lib/toast'
import { ContextMenu, type MenuItem } from '../ContextMenu'
import { SlashMenu } from './SlashMenu'
import { WikilinkMenu, buildWikilinkItems, type WikilinkItem } from './WikilinkMenu'
import { detectSlashContext, filterSlashCommands, type SlashCommand } from '../../core/markdown/slashCommands'
import { detectWikilinkContext } from '../../core/markdown/wikilinks'
import { liveDecorations, forceRebuildMediaLayout, type LiveContext } from './LiveEditor.decorations'
import styles from './LiveEditor.module.css'

/** Open-menu state for the `/` command popup. `from` is the `/`'s doc offset. */
interface SlashState {
  from: number
  query: string
  coords: { x: number; y: number }
  index: number
}

/** Open-menu state for the `[[` note-picker. `contentStart` is the offset just
 *  after the `[[`; `hasClose` records a `]]` already sitting after the cursor. */
interface WikilinkState {
  contentStart: number
  query: string
  hasClose: boolean
  coords: { x: number; y: number }
  index: number
}

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
  const [slash, setSlash] = useState<SlashState | null>(null)
  const [wl, setWl] = useState<WikilinkState | null>(null)
  // Read by the mount-once updateListener / capture keydown handlers, which
  // can't close over fresh render state.
  const slashRef = useRef<SlashState | null>(slash)
  slashRef.current = slash
  const wlRef = useRef<WikilinkState | null>(wl)
  wlRef.current = wl
  const updateSlashRef = useRef((_state: EditorState, _head: number) => {})
  const runSlashRef = useRef((_item: SlashCommand) => {})
  const updateWikilinkRef = useRef((_state: EditorState, _head: number, _docChanged: boolean) => {})
  const runWikilinkRef = useRef((_item: WikilinkItem) => {})

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

  // Pointer-driven drag to rearrange media: grab a frame's grip and drop it
  // onto another embed — left/right edge = same-row (side by side), top/bottom
  // edge = stacked. LiveEditor owns this (not the widget) because it needs the
  // EditorView + DOM to hit-test drop targets. A fixed-position bar previews
  // where the embed will land.
  const dragRef = useRef<{ sourceKey: string; target: { key: string; placement: MediaPlacement } | null } | null>(null)
  const [dropBar, setDropBar] = useState<{ x: number; y: number; w: number; h: number } | null>(null)

  const onMediaDragStart = useCallback((mediaKey: string, e: ReactPointerEvent) => {
    const view = viewRef.current
    const host = hostRef.current
    if (!view || !host) return
    dragRef.current = { sourceKey: mediaKey, target: null }

    const BAR = 3
    const computeTarget = (clientX: number, clientY: number) => {
      const frames = Array.from(host.querySelectorAll<HTMLElement>('[data-media-key]'))
      let best: { key: string; rect: DOMRect; dist: number } | null = null
      for (const el of frames) {
        const key = el.getAttribute('data-media-key')
        if (!key || key === mediaKey) continue
        const rect = el.getBoundingClientRect()
        if (rect.width === 0 && rect.height === 0) continue
        const cx = rect.left + rect.width / 2
        const cy = rect.top + rect.height / 2
        const inside = clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom
        const dist = inside ? -1 : Math.hypot(clientX - cx, clientY - cy)
        if (!best || dist < best.dist) best = { key, rect, dist }
      }
      if (!best) {
        if (dragRef.current) dragRef.current.target = null
        setDropBar(null)
        return
      }
      const { rect } = best
      const dxN = (clientX - (rect.left + rect.width / 2)) / (rect.width / 2 || 1)
      const dyN = (clientY - (rect.top + rect.height / 2)) / (rect.height / 2 || 1)
      let placement: MediaPlacement
      let bar: { x: number; y: number; w: number; h: number }
      if (Math.abs(dxN) >= Math.abs(dyN)) {
        placement = dxN < 0 ? 'left' : 'right'
        bar = { x: (placement === 'left' ? rect.left : rect.right) - BAR / 2, y: rect.top, w: BAR, h: rect.height }
      } else {
        placement = dyN < 0 ? 'above' : 'below'
        bar = { x: rect.left, y: (placement === 'above' ? rect.top : rect.bottom) - BAR / 2, w: rect.width, h: BAR }
      }
      if (dragRef.current) dragRef.current.target = { key: best.key, placement }
      setDropBar(bar)
    }

    const onMove = (ev: PointerEvent) => {
      ev.preventDefault()
      computeTarget(ev.clientX, ev.clientY)
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      document.body.classList.remove('jnanaMediaDragging')
      const drag = dragRef.current
      dragRef.current = null
      setDropBar(null)
      if (drag?.target) {
        const doc = view.state.doc.toString()
        const next = rearrangeMedia(doc, drag.sourceKey, drag.target.key, drag.target.placement)
        if (next != null && next !== doc) {
          view.dispatch({ changes: { from: 0, to: doc.length, insert: next } })
        }
      }
      view.focus()
    }

    document.body.classList.add('jnanaMediaDragging')
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    computeTarget(e.clientX, e.clientY)
  }, [])

  // Live context for the decorations plugin — same ref-read pattern, since
  // `notes`/`allowNavigate` can change without the doc/selection changing.
  const [mediaLayout, setMediaLayout] = useState<Map<string, MediaLayout>>(new Map())

  // Fold an align change from a media frame back into the layout map so the
  // decoration plugin rebuilds (via the forceRebuildMediaLayout effect below)
  // and re-derives the line-level text-align. Other entries keep their object
  // identity, so only the changed embed's widget can fail eq() / remount.
  const onLayoutChange = useCallback((mediaKey: string, layout: MediaLayout) => {
    setMediaLayout((prev) => {
      const nextMap = new Map(prev)
      nextMap.set(mediaKey, layout)
      return nextMap
    })
  }, [])

  const contextRef = useRef<LiveContext>({ notes, noteId, allowNavigate, lazy, mediaLayout, moveMedia, onMediaDragStart, onLayoutChange })
  contextRef.current = { notes, noteId, allowNavigate, lazy, mediaLayout, moveMedia, onMediaDragStart, onLayoutChange }

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

  // While the slash menu is open, own the nav keys in the capture phase — before
  // CM6's own bubble-phase keydown handlers — so Arrow/Enter/Tab drive the menu
  // and Escape closes it without triggering the composer's Cmd+Enter save or
  // Escape cancel. Character keys fall through to CM6, extend the doc, and the
  // updateListener re-filters.
  const slashOpen = slash != null
  useEffect(() => {
    if (!slashOpen) return
    const onKey = (e: KeyboardEvent) => {
      const s = slashRef.current
      if (!s) return
      const items = filterSlashCommands(s.query)
      if (items.length === 0) return
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault(); e.stopPropagation()
          setSlash((cur) => (cur ? { ...cur, index: (cur.index + 1) % items.length } : cur))
          break
        case 'ArrowUp':
          e.preventDefault(); e.stopPropagation()
          setSlash((cur) => (cur ? { ...cur, index: (cur.index - 1 + items.length) % items.length } : cur))
          break
        case 'Enter':
        case 'Tab':
          e.preventDefault(); e.stopPropagation()
          runSlashRef.current(items[s.index] ?? items[0])
          break
        case 'Escape':
          e.preventDefault(); e.stopPropagation()
          setSlash(null)
          break
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [slashOpen])

  // Same capture-phase nav ownership for the `[[` note picker.
  const wlOpen = wl != null
  useEffect(() => {
    if (!wlOpen) return
    const onKey = (e: KeyboardEvent) => {
      const s = wlRef.current
      if (!s) return
      const items = buildWikilinkItems(s.query, contextRef.current.notes)
      if (items.length === 0) return
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault(); e.stopPropagation()
          setWl((cur) => (cur ? { ...cur, index: (cur.index + 1) % items.length } : cur))
          break
        case 'ArrowUp':
          e.preventDefault(); e.stopPropagation()
          setWl((cur) => (cur ? { ...cur, index: (cur.index - 1 + items.length) % items.length } : cur))
          break
        case 'Enter':
        case 'Tab':
          e.preventDefault(); e.stopPropagation()
          runWikilinkRef.current(items[s.index] ?? items[0])
          break
        case 'Escape':
          e.preventDefault(); e.stopPropagation()
          setWl(null)
          break
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [wlOpen])

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
    insertAtCursor(`\n\n![youtube](https://youtube.com/watch?v=${videoId})`)
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
    insertAtCursor(`\n\n![webpage](${url})`)
  }

  // --- Slash (`/`) command menu ---------------------------------------------
  // Recompute the open/closed state from the current doc + caret. Runs from the
  // updateListener on every doc/selection change. The `/query` is real document
  // text, so this is pure inspection — detection never mutates the doc.
  const updateSlash = (state: EditorState, head: number) => {
    const view = viewRef.current
    const sel = state.selection.main
    if (!view || !sel.empty) {
      setSlash((prev) => (prev ? null : prev))
      return
    }
    const ctx = detectSlashContext(state.doc.toString(), head)
    const coords = ctx ? view.coordsAtPos(ctx.from) : null
    if (!ctx || !coords || filterSlashCommands(ctx.query).length === 0) {
      setSlash((prev) => (prev ? null : prev))
      return
    }
    const filteredLen = filterSlashCommands(ctx.query).length
    setSlash((prev) => ({
      from: ctx.from,
      query: ctx.query,
      coords: { x: coords.left, y: coords.top },
      // Keep the highlight while narrowing the same query; else reset to the top.
      index: prev && prev.query === ctx.query ? Math.min(prev.index, filteredLen - 1) : 0,
    }))
  }
  updateSlashRef.current = updateSlash

  // Delete the typed `/query`, then run the command against the helpers this
  // component already owns (format / insert / the shared import handlers).
  const runSlashCommand = (item: SlashCommand) => {
    const view = viewRef.current
    const s = slashRef.current
    if (!view || !s) return
    const cursor = view.state.selection.main.head
    view.dispatch({ changes: { from: s.from, to: cursor, insert: '' }, selection: { anchor: s.from } })
    setSlash(null)
    view.focus()
    const action = item.action
    if (action.kind === 'format') {
      applyFormatAtSelection(action.format)
    } else if (action.kind === 'insert') {
      insertAtCursor(action.markdown)
    } else if (action.kind === 'wikilink') {
      // Insert `[[]]` and drop the caret between the brackets — the `[[`
      // detector then opens the note picker automatically.
      const pos = view.state.selection.main.head
      view.dispatch({ changes: { from: pos, to: pos, insert: '[[]]' }, selection: { anchor: pos + 2 } })
      view.focus()
    } else {
      switch (action.which) {
        case 'image': imageInputRef.current?.click(); break
        case 'video': importHandlers?.onVideoUpload(); break
        case 'audio': importHandlers?.onAudioUpload(); break
        case 'document': importHandlers?.onDocumentUpload(); break
        case 'youtube': void handleYouTubeImport(); break
        case 'webpage': void handleWebpageImport(); break
      }
    }
  }
  runSlashRef.current = runSlashCommand

  // --- Wikilink (`[[`) note picker ------------------------------------------
  // Same real-document-text model as the slash menu: `[[` and the query are
  // literal text, so this is pure inspection. `contextRef.current.notes` gives
  // the always-fresh note list without adding it to any closure deps.
  const updateWikilink = (state: EditorState, head: number, docChanged: boolean) => {
    const view = viewRef.current
    const sel = state.selection.main
    if (!view || !sel.empty) {
      setWl((prev) => (prev ? null : prev))
      return
    }
    const ctx = detectWikilinkContext(state.doc.toString(), head)
    const coords = ctx ? view.coordsAtPos(ctx.contentStart) : null
    if (!ctx || !coords || buildWikilinkItems(ctx.query, contextRef.current.notes).length === 0) {
      setWl((prev) => (prev ? null : prev))
      return
    }
    // Only *open* on a doc change (typing `[[…` or the slash "Link to note"
    // insert) — never spontaneously when the caret merely lands inside an
    // existing `[[Foo]]`. Once open, keep tracking so navigating out closes it.
    if (!docChanged && !wlRef.current) return
    const len = buildWikilinkItems(ctx.query, contextRef.current.notes).length
    setWl((prev) => ({
      contentStart: ctx.contentStart,
      query: ctx.query,
      hasClose: ctx.hasClose,
      coords: { x: coords.left, y: coords.top },
      index: prev && prev.query === ctx.query ? Math.min(prev.index, len - 1) : 0,
    }))
  }
  updateWikilinkRef.current = updateWikilink

  // Complete the `[[…` to `[[Title]]` — replacing the typed query and consuming
  // an existing `]]` so it isn't duplicated. A 'create' pick inserts the typed
  // title verbatim; the note itself is materialized later (clicking the missing
  // wikilink, or its faded pseudo-node in the graph).
  const completeWikilink = (item: WikilinkItem) => {
    const view = viewRef.current
    const s = wlRef.current
    if (!view || !s) return
    const cursor = view.state.selection.main.head
    const to = s.hasClose ? cursor + 2 : cursor
    const insert = `${item.title}]]`
    view.dispatch({
      changes: { from: s.contentStart, to, insert },
      selection: { anchor: s.contentStart + insert.length },
    })
    setWl(null)
    view.focus()
  }
  runWikilinkRef.current = completeWikilink

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
          if (update.docChanged || update.selectionSet) {
            const head = update.state.selection.main.head
            updateSlashRef.current(update.state, head)
            updateWikilinkRef.current(update.state, head, update.docChanged)
          }
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
      {dropBar && (
        <div
          className={styles.dropBar}
          style={{ position: 'fixed', left: dropBar.x, top: dropBar.y, width: dropBar.w, height: dropBar.h }}
        />
      )}
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
      {slash && (
        <SlashMenu
          items={filterSlashCommands(slash.query)}
          activeIndex={slash.index}
          coords={slash.coords}
          onPick={(item) => runSlashCommand(item)}
          onHover={(i) => setSlash((cur) => (cur ? { ...cur, index: i } : cur))}
          onClose={() => setSlash(null)}
        />
      )}
      {wl && (
        <WikilinkMenu
          items={buildWikilinkItems(wl.query, notes)}
          activeIndex={wl.index}
          coords={wl.coords}
          onPick={(item) => completeWikilink(item)}
          onHover={(i) => setWl((cur) => (cur ? { ...cur, index: i } : cur))}
          onClose={() => setWl(null)}
        />
      )}
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
