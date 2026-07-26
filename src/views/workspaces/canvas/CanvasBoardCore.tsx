// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// The controlled, doc-agnostic canvas board. It owns view transform, gestures,
// undo/redo, all doc mutators, edge rendering, link-in-graph, and paste — but
// takes its document (`doc`/`setDoc`), notes, and note-persistence callbacks as
// props. It is driven by the canvas note-type editor (CanvasNoteEditor), which
// feeds it a serialized CanvasDoc from the note's content.

import {
  useCallback, useEffect, useMemo, useRef, useState,
  type ReactNode, type PointerEvent as ReactPointerEvent, type MouseEvent as ReactMouseEvent,
} from 'react'
import { Check, Link2, Maximize2, Minimize2 } from 'lucide-react'
import { open } from '@tauri-apps/plugin-dialog'
import { openUrl, openPath } from '@tauri-apps/plugin-opener'
import { readText, readImage } from '@tauri-apps/plugin-clipboard-manager'
import { importMedia, getAssetPath } from '../../../core/media'
import { uploadAsset } from '../../../core/notes'
import {
  newId, bringToFront, bringForward, sendBackward, sendToBack, eraseAt,
  type CanvasDoc, type CanvasEdge, type CanvasNode, type Side,
} from '../../../core/canvas'
import { showPromptDialog } from '../../../lib/dialog'
import { toast } from '../../../lib/toast'
import { NoteModal } from '../../../ui/NoteModal'
import { useSidebarPrefs } from '../../../hooks/useSidebarPrefs'
import type { Note } from '../../../types'
import type { useNotes } from '../../../hooks/useNotes'
import { CanvasNodeView } from './CanvasNodeView'
import { CanvasToolbar, type CanvasMode, type DrawTool } from './CanvasToolbar'
import { useCanvasPrefs } from './useCanvasPrefs'
import { CanvasNotePicker } from './CanvasNotePicker'
import { CanvasContextMenu, type MenuItem } from './CanvasContextMenu'
import { CanvasColorPicker } from './CanvasColorPicker'
import { DrawLayer } from './DrawLayer'
import { nodesInMarquee, rectFromPoints, nodeRect, type Rect } from './canvasSelect'
import { extractFragment, cloneFragment, type CanvasFragment } from './canvasClipboard'
import { snapDrag } from './canvasSnap'
import { deriveWikilinkEdges } from './canvasWikilinkEdges'
import { renderCanvasToPng } from './canvasExport'
import { savePngFile } from '../../../core/savePng'
import styles from './canvas.module.css'

type NotesApi = ReturnType<typeof useNotes>

export interface CanvasBoardCoreProps {
  doc: CanvasDoc
  setDoc: (updater: CanvasDoc | ((prev: CanvasDoc) => CanvasDoc)) => void
  /** Candidate notes for the "add note card" picker (already vault/workspace-scoped by the caller). */
  notesPool: Note[]
  /** All notes, for resolving placed note-card ids + link-in-graph target titles. */
  allNotes: Note[]
  /** Persist a note edit — the NotesContext `update(id, title, content, userTags?)`. */
  update: NotesApi['update']
  /** Persist note tag changes — used by the read-peek NoteModal. */
  updateTags: NotesApi['updateTags']
  /** Chrome injected above the board (e.g. the workspace canvas switcher). */
  headerSlot?: ReactNode
  /** Shows a loading placeholder instead of the board (workspace canvas list load). */
  loading?: boolean
  /** When this changes, the undo/redo history resets (a different doc source). */
  resetKey?: string
}

type Pt = { x: number; y: number }
type View = { tx: number; ty: number; scale: number }
type DocUpdater = CanvasDoc | ((prev: CanvasDoc) => CanvasDoc)

type Gesture =
  | { kind: 'pan'; sx: number; sy: number; tx: number; ty: number }
  | { kind: 'node'; id: string; sx: number; sy: number; ox: number; oy: number; origins: Map<string, Pt> }
  | { kind: 'resize'; id: string; sx: number; sy: number; ow: number; oh: number }
  | { kind: 'edge'; from: string; fromSide: Side }
  | { kind: 'marquee'; sx: number; sy: number }
  | { kind: 'draw' }
  | { kind: 'erase' }

const MAX_HISTORY = 100

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

// Custom cursors (hotspot at the nib / corner) for the draw tools.
const PEN_CURSOR =
  `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Cpath d='M3 21l3.5-1L18 8.5 15.5 6 4 17.5z' fill='%23222' stroke='white' stroke-width='1.2'/%3E%3Cpath d='M15.5 6L18 8.5l2-2L17.5 4z' fill='%237c6af7' stroke='white' stroke-width='1.2'/%3E%3C/svg%3E") 3 21, crosshair`
const ERASER_CURSOR =
  `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Crect x='3' y='11' width='13' height='8' rx='2' transform='rotate(-45 9 15)' fill='%23f4d35e' stroke='%23333' stroke-width='1.2'/%3E%3C/svg%3E") 6 18, cell`

function center(n: CanvasNode): Pt {
  return { x: n.x + n.width / 2, y: n.y + n.height / 2 }
}
function anchor(n: CanvasNode, side: Side): Pt {
  const c = center(n)
  if (side === 'top') return { x: c.x, y: n.y }
  if (side === 'bottom') return { x: c.x, y: n.y + n.height }
  if (side === 'left') return { x: n.x, y: c.y }
  return { x: n.x + n.width, y: c.y }
}
function sideToward(n: CanvasNode, p: Pt): Side {
  const c = center(n)
  const dx = p.x - c.x
  const dy = p.y - c.y
  return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'bottom' : 'top'
}
function normal(side: Side): Pt {
  if (side === 'right') return { x: 1, y: 0 }
  if (side === 'left') return { x: -1, y: 0 }
  if (side === 'top') return { x: 0, y: -1 }
  return { x: 0, y: 1 }
}
function edgePath(p1: Pt, s1: Side, p2: Pt, s2: Side): string {
  const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y)
  const off = clamp(dist / 2, 40, 140)
  const n1 = normal(s1)
  const n2 = normal(s2)
  const c1 = { x: p1.x + n1.x * off, y: p1.y + n1.y * off }
  const c2 = { x: p2.x + n2.x * off, y: p2.y + n2.y * off }
  return `M ${p1.x} ${p1.y} C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${p2.x} ${p2.y}`
}

function assetUrl(filename: string): string {
  return `http://jnana-asset.localhost/${filename}`
}

function mediaTypeFromExt(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (['mp4', 'webm', 'mov', 'avi', 'mkv'].includes(ext)) return 'video'
  if (['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg'].includes(ext)) return 'audio'
  if (ext === 'pdf') return 'pdf'
  return 'image'
}

function normalizeUrl(raw: string): string {
  const t = raw.trim()
  return /^https?:\/\//i.test(t) ? t : `https://${t}`
}
function looksLikeUrl(raw: string): boolean {
  const t = raw.trim()
  return /^https?:\/\/\S+$/i.test(t) || /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(t)
}

/** Append a single [[wikilink]] under a "## Links" section (created if absent). */
function appendWikilink(content: string, targetTitle: string): string {
  const wl = `[[${targetTitle}]]`
  if (content.includes(wl)) return content
  const heading = '## Links'
  if (content.includes(heading)) return content.replace(heading, `${heading}\n${wl}`)
  return `${content.trimEnd()}\n\n${heading}\n${wl}\n`
}

/** PNG-encode raw RGBA via a canvas (fallback path for the Tauri clipboard image). */
async function rgbaToPng(rgba: Uint8Array, width: number, height: number): Promise<Uint8Array> {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  ctx.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0)
  const blob: Blob = await new Promise((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error('toBlob failed'))), 'image/png'),
  )
  return new Uint8Array(await blob.arrayBuffer())
}

/** Read an image off the clipboard as PNG bytes — prefers the async web clipboard
 *  (gives a PNG blob), falling back to the Tauri plugin (RGBA → PNG). */
async function readClipboardImage(): Promise<Uint8Array | null> {
  try {
    if (navigator.clipboard?.read) {
      const items = await navigator.clipboard.read()
      for (const it of items) {
        const type = it.types.find((t) => t.startsWith('image/'))
        if (type) return new Uint8Array(await (await it.getType(type)).arrayBuffer())
      }
    }
  } catch { /* fall through to the Tauri plugin */ }
  try {
    const img = await readImage()
    const { width, height } = await img.size()
    return await rgbaToPng(new Uint8Array(await img.rgba()), width, height)
  } catch {
    return null
  }
}

export function CanvasBoardCore({
  doc, setDoc, notesPool, allNotes, update, updateTags, headerSlot, loading = false, resetKey,
}: CanvasBoardCoreProps) {
  const [prefs, setPrefs] = useCanvasPrefs()
  const { collapsed: sidebarCollapsed } = useSidebarPrefs()
  const [fullscreen, setFullscreen] = useState(false)

  const [view, setView] = useState<View>({ tx: 0, ty: 0, scale: 1 })
  const [mode, setMode] = useState<CanvasMode>('select')
  const [drawTool, setDrawTool] = useState<DrawTool>('pen')
  const [panning, setPanning] = useState(false)
  const [selection, setSelection] = useState<Set<string>>(new Set())
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null)
  // Live marquee rect (screen coords) + alignment guides (world coords) during a drag.
  const [marquee, setMarquee] = useState<Rect | null>(null)
  const [guides, setGuides] = useState<{ axis: 'x' | 'y'; at: number }[]>([])
  const [tempEdge, setTempEdge] = useState<{ from: string; fromSide: Side; x: number; y: number } | null>(null)
  const [live, setLive] = useState<{ points: [number, number, number][]; color: string; size: number } | null>(null)
  const [picking, setPicking] = useState(false)
  const [openNote, setOpenNote] = useState<Note | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null)
  const [colorPicker, setColorPicker] = useState<{ x: number; y: number; nodeId: string } | null>(null)
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)

  const boardRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef(view)
  viewRef.current = view
  const gesture = useRef<Gesture | null>(null)
  const liveRef = useRef(live)
  liveRef.current = live
  const docRef = useRef(doc)
  docRef.current = doc
  const selectionRef = useRef(selection)
  selectionRef.current = selection
  // Internal node/edge clipboard for Ctrl+C / Ctrl+V / Ctrl+D (distinct from the
  // system-clipboard paste). ponytail: per-board ref; make module-level if
  // cross-canvas paste is ever wanted.
  const clipboardRef = useRef<CanvasFragment | null>(null)
  // A node press waiting to become a drag. We don't capture the pointer (which
  // would swallow the native click/dblclick, breaking double-click-to-edit) until
  // the pointer moves past a small threshold.
  const pendingDragRef = useRef<{ id: string; sx: number; sy: number; origins: Map<string, Pt> } | null>(null)
  // Frame the board's content once after the doc first loads (and again on a new
  // doc source) so opening a canvas never leaves its cards off-screen / tiny.
  const didFitRef = useRef(false)
  const fullscreenRef = useRef(fullscreen)
  fullscreenRef.current = fullscreen

  const selectSingle = useCallback((id: string | null) => setSelection(id ? new Set([id]) : new Set()), [])
  const toggleSelect = useCallback(
    (id: string) =>
      setSelection((prev) => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      }),
    [],
  )

  // ── Undo / redo history (snapshots kept in refs — no extra renders) ──
  const pastRef = useRef<CanvasDoc[]>([])
  const futureRef = useRef<CanvasDoc[]>([])
  const coalescingRef = useRef(false)

  // Reset history when the doc source changes (switching canvases / notes) —
  // past snapshots from another board don't make sense here.
  useEffect(() => {
    pastRef.current = []
    futureRef.current = []
    setCanUndo(false)
    setCanRedo(false)
    setSelection(new Set())
    setSelectedEdge(null)
    didFitRef.current = false
  }, [resetKey])

  const pushHistory = useCallback((snapshot: CanvasDoc) => {
    pastRef.current.push(snapshot)
    if (pastRef.current.length > MAX_HISTORY) pastRef.current.shift()
    futureRef.current = []
    setCanUndo(true)
    setCanRedo(false)
  }, [])

  /** Route every content mutation through here so it's undoable. Calls made
   *  while `coalescingRef` is set (a drag/draw/erase gesture in progress) skip
   *  the snapshot — the gesture's `beginGesture()` already took one — so an
   *  entire drag/stroke is one undo step rather than one per pointermove. */
  const recordableSetDoc = useCallback(
    (updater: DocUpdater) => {
      if (!coalescingRef.current) pushHistory(docRef.current)
      setDoc(updater)
    },
    [setDoc, pushHistory],
  )

  const beginGesture = useCallback(() => {
    pushHistory(docRef.current)
    coalescingRef.current = true
  }, [pushHistory])
  const endGesture = useCallback(() => {
    coalescingRef.current = false
  }, [])

  const undo = useCallback(() => {
    if (pastRef.current.length === 0) return
    const prev = pastRef.current.pop()!
    futureRef.current.push(docRef.current)
    setDoc(prev)
    setCanUndo(pastRef.current.length > 0)
    setCanRedo(true)
  }, [setDoc])
  const redo = useCallback(() => {
    if (futureRef.current.length === 0) return
    const next = futureRef.current.pop()!
    pastRef.current.push(docRef.current)
    setDoc(next)
    setCanRedo(futureRef.current.length > 0)
    setCanUndo(true)
  }, [setDoc])

  const noteMap = useMemo(() => new Map(allNotes.map((n) => [n.id, n])), [allNotes])
  const nodeMap = useMemo(() => new Map(doc.nodes.map((n) => [n.id, n])), [doc.nodes])
  const placedNoteIds = useMemo(
    () => new Set(doc.nodes.filter((n) => n.type === 'note' && n.noteId).map((n) => n.noteId!)),
    [doc.nodes],
  )

  // ── Coordinate helpers ──
  const screenToWorld = useCallback((clientX: number, clientY: number): Pt => {
    const rect = boardRef.current!.getBoundingClientRect()
    const v = viewRef.current
    return { x: (clientX - rect.left - v.tx) / v.scale, y: (clientY - rect.top - v.ty) / v.scale }
  }, [])

  const centerWorld = useCallback((): Pt => {
    const rect = boardRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    return screenToWorld(rect.left + rect.width / 2, rect.top + rect.height / 2)
  }, [screenToWorld])

  // ── Doc mutators (stable, all undoable) ──
  const addNode = useCallback((n: CanvasNode) => recordableSetDoc((d) => ({ ...d, nodes: [...d.nodes, n] })), [recordableSetDoc])
  const updateNode = useCallback(
    (id: string, patch: Partial<CanvasNode>) =>
      recordableSetDoc((d) => ({ ...d, nodes: d.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) })),
    [recordableSetDoc],
  )
  const removeNode = useCallback(
    (id: string) =>
      recordableSetDoc((d) => ({
        ...d,
        nodes: d.nodes.filter((n) => n.id !== id),
        edges: d.edges.filter((e) => e.fromNode !== id && e.toNode !== id),
      })),
    [recordableSetDoc],
  )
  const addEdge = useCallback(
    (e: CanvasEdge) =>
      recordableSetDoc((d) =>
        d.edges.some((x) => x.fromNode === e.fromNode && x.toNode === e.toNode) ? d : { ...d, edges: [...d.edges, e] },
      ),
    [recordableSetDoc],
  )
  const updateEdge = useCallback(
    (id: string, patch: Partial<CanvasEdge>) =>
      recordableSetDoc((d) => ({ ...d, edges: d.edges.map((e) => (e.id === id ? { ...e, ...patch } : e)) })),
    [recordableSetDoc],
  )
  const removeEdge = useCallback(
    (id: string) => recordableSetDoc((d) => ({ ...d, edges: d.edges.filter((e) => e.id !== id) })),
    [recordableSetDoc],
  )
  const eraseNear = useCallback(
    (p: Pt, r: number) => recordableSetDoc((d) => ({ ...d, drawings: eraseAt(d.drawings, p, r, prefs.eraserMode) })),
    [recordableSetDoc, prefs.eraserMode],
  )

  const onChangeText = useCallback((id: string, text: string) => updateNode(id, { text }), [updateNode])

  // ── Multi-node ops (all undoable, one step each) ──
  const removeSelected = useCallback(() => {
    const ids = selectionRef.current
    if (ids.size === 0) return
    recordableSetDoc((d) => ({
      ...d,
      nodes: d.nodes.filter((n) => !ids.has(n.id)),
      edges: d.edges.filter((e) => !ids.has(e.fromNode) && !ids.has(e.toNode)),
    }))
    setSelection(new Set())
  }, [recordableSetDoc])

  const insertFragment = useCallback(
    (frag: CanvasFragment) => {
      if (frag.nodes.length === 0) return
      recordableSetDoc((d) => ({ ...d, nodes: [...d.nodes, ...frag.nodes], edges: [...d.edges, ...frag.edges] }))
      setSelection(new Set(frag.nodes.map((n) => n.id)))
    },
    [recordableSetDoc],
  )
  const copySelection = useCallback(() => {
    if (selectionRef.current.size > 0) clipboardRef.current = extractFragment(docRef.current, selectionRef.current)
  }, [])
  const pasteClipboard = useCallback(() => {
    if (clipboardRef.current) insertFragment(cloneFragment(clipboardRef.current, 24, 24))
  }, [insertFragment])
  const duplicateSelection = useCallback(() => {
    if (selectionRef.current.size === 0) return
    insertFragment(cloneFragment(extractFragment(docRef.current, selectionRef.current), 24, 24))
  }, [insertFragment])

  // ── Derived (unstored) dotted edges between wikilinked note cards ──
  const wikilinkEdges = useMemo(() => {
    if (!prefs.showWikilinkEdges) return []
    const cards = doc.nodes.filter((n) => n.type === 'note' && n.noteId)
    if (cards.length < 2) return []
    return deriveWikilinkEdges(doc.nodes, noteMap)
  }, [prefs.showWikilinkEdges, doc.nodes, noteMap])

  // ── PNG export ──
  const handleExport = useCallback(async () => {
    try {
      const titles = new Map(allNotes.map((n) => [n.id, n.title]))
      const blob = await renderCanvasToPng(docRef.current, { scale: 2, background: doc.background?.type === 'color' ? doc.background.value : undefined, titles })
      await savePngFile('canvas.png', blob)
    } catch (err) {
      toast.error('Could not export canvas: ' + String(err))
    }
  }, [allNotes, doc.background])

  // ── Board background (color / image / revert to the default dot grid) ──
  const setBackgroundColor = useCallback(
    (value: string) => recordableSetDoc((d) => ({ ...d, background: { type: 'color', value } })),
    [recordableSetDoc],
  )
  const resetBackground = useCallback(
    () => recordableSetDoc((d) => ({ ...d, background: undefined })),
    [recordableSetDoc],
  )
  const handleUploadBackground = useCallback(async () => {
    try {
      const sel = await open({ multiple: false, filters: [{ name: 'Image', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }] })
      if (!sel || typeof sel !== 'string') return
      const filename = await importMedia(sel, '')
      recordableSetDoc((d) => ({ ...d, background: { type: 'image', value: filename } }))
    } catch (err) {
      toast.error('Could not set background: ' + String(err))
    }
  }, [recordableSetDoc])

  // ── Element factories (used by the toolbar, context menu, and paste) ──
  const addTextAt = useCallback(
    (p: Pt, text = '') => addNode({ id: newId(), type: 'text', x: p.x - 100, y: p.y - 70, width: 200, height: 140, text }),
    [addNode],
  )
  const addLinkAt = useCallback(
    (url: string, p: Pt) => addNode({ id: newId(), type: 'link', url, x: p.x - 160, y: p.y - 120, width: 320, height: 240 }),
    [addNode],
  )
  const addImageBytesAt = useCallback(
    async (bytes: Uint8Array, p: Pt, ext = 'png') => {
      const filename = await uploadAsset(bytes, ext)
      addNode({ id: newId(), type: 'media', file: filename, mediaType: 'image', x: p.x - 140, y: p.y - 110, width: 280, height: 220 })
    },
    [addNode],
  )

  // ── Toolbar actions ──
  const handleAddText = () => addTextAt(centerWorld())
  const handlePickNotes = (ids: string[]) => {
    const c = centerWorld()
    let i = 0
    for (const noteId of ids) {
      const col = i % 3
      const row = Math.floor(i / 3)
      addNode({
        id: newId(), type: 'note', noteId,
        x: c.x - 240 + col * 250, y: c.y - 100 + row * 180, width: 230, height: 160,
      })
      i++
    }
  }
  const handleAddMedia = async () => {
    try {
      const sel = await open({
        multiple: false,
        filters: [{ name: 'Media', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'mp4', 'webm', 'mov', 'mp3', 'wav', 'm4a', 'ogg', 'pdf'] }],
      })
      if (!sel || typeof sel !== 'string') return
      const filename = await importMedia(sel, '')
      const mediaType = mediaTypeFromExt(filename)
      const c = centerWorld()
      addNode({ id: newId(), type: 'media', file: filename, mediaType, x: c.x - 140, y: c.y - 110, width: 280, height: 220 })
    } catch (err) {
      toast.error('Could not add media: ' + String(err))
    }
  }
  const handleAddWeb = async () => {
    const raw = await showPromptDialog({ title: 'Add web page', placeholder: 'https://example.com', confirmLabel: 'Add' })
    if (!raw) return
    addLinkAt(normalizeUrl(raw), centerWorld())
  }

  // ── Paste ──
  const pasteText = useCallback(async (p: Pt) => {
    try {
      const t = (await readText())?.trim()
      if (!t) { toast.error('Clipboard has no text.'); return }
      if (looksLikeUrl(t)) addLinkAt(normalizeUrl(t), p)
      else addTextAt(p, t)
    } catch (err) {
      toast.error('Could not read clipboard: ' + String(err))
    }
  }, [addLinkAt, addTextAt])

  const pasteUrl = useCallback(async (p: Pt) => {
    try {
      const t = (await readText())?.trim()
      if (!t || !looksLikeUrl(t)) { toast.error('Clipboard has no URL.'); return }
      addLinkAt(normalizeUrl(t), p)
    } catch (err) {
      toast.error('Could not read clipboard: ' + String(err))
    }
  }, [addLinkAt])

  const pasteImage = useCallback(async (p: Pt) => {
    try {
      const bytes = await readClipboardImage()
      if (!bytes) { toast.error('Clipboard has no image.'); return }
      await addImageBytesAt(bytes, p)
    } catch (err) {
      toast.error('Could not paste image: ' + String(err))
    }
  }, [addImageBytesAt])

  // Ctrl/⌘-V paste anywhere on the board (image or text) at the viewport center.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const active = document.activeElement as HTMLElement | null
      const tag = (active?.tagName ?? '').toLowerCase()
      if (tag === 'input' || tag === 'textarea' || active?.isContentEditable) return
      const dt = e.clipboardData
      if (!dt) return
      const imgItem = Array.from(dt.items).find((it) => it.type.startsWith('image/'))
      if (imgItem) {
        const file = imgItem.getAsFile()
        if (file) {
          e.preventDefault()
          const ext = file.type.split('/')[1] || 'png'
          file.arrayBuffer().then((b) => addImageBytesAt(new Uint8Array(b), centerWorld(), ext))
        }
        return
      }
      const text = dt.getData('text/plain')
      if (text) {
        e.preventDefault()
        const p = centerWorld()
        if (looksLikeUrl(text)) addLinkAt(normalizeUrl(text), p)
        else addTextAt(p, text)
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [addImageBytesAt, addLinkAt, addTextAt, centerWorld])

  const zoomAround = (cx: number, cy: number, dir: 1 | -1) =>
    setView((v) => {
      const factor = dir > 0 ? 1.1 : 1 / 1.1
      const scale = clamp(v.scale * factor, 0.2, 3)
      const k = scale / v.scale
      return { scale, tx: cx - (cx - v.tx) * k, ty: cy - (cy - v.ty) * k }
    })
  const handleZoom = (dir: 1 | -1) => {
    const rect = boardRef.current?.getBoundingClientRect()
    zoomAround((rect?.width ?? 0) / 2, (rect?.height ?? 0) / 2, dir)
  }
  const handleFit = () => {
    const rect = boardRef.current?.getBoundingClientRect()
    if (!rect || doc.nodes.length === 0) {
      setView({ tx: 0, ty: 0, scale: 1 })
      return
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const n of doc.nodes) {
      minX = Math.min(minX, n.x); minY = Math.min(minY, n.y)
      maxX = Math.max(maxX, n.x + n.width); maxY = Math.max(maxY, n.y + n.height)
    }
    const pad = 60
    const w = maxX - minX + pad * 2
    const h = maxY - minY + pad * 2
    const scale = clamp(Math.min(rect.width / w, rect.height / h), 0.2, 1.5)
    setView({ scale, tx: rect.width / 2 - (minX + (maxX - minX) / 2) * scale, ty: rect.height / 2 - (minY + (maxY - minY) / 2) * scale })
  }

  // Center the view on the content the first time a non-empty doc is available,
  // at natural scale (1) so text stays readable — the user pans for the rest and
  // can hit "Fit" to zoom-to-all. (Auto-fitting would shrink a spread-out board.)
  useEffect(() => {
    if (loading || didFitRef.current || doc.nodes.length === 0) return
    didFitRef.current = true
    const raf = requestAnimationFrame(() => {
      const rect = boardRef.current?.getBoundingClientRect()
      if (!rect) return
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      for (const n of docRef.current.nodes) {
        minX = Math.min(minX, n.x); minY = Math.min(minY, n.y)
        maxX = Math.max(maxX, n.x + n.width); maxY = Math.max(maxY, n.y + n.height)
      }
      if (!isFinite(minX)) return
      const cx = (minX + maxX) / 2
      const cy = (minY + maxY) / 2
      setView({ scale: 1, tx: rect.width / 2 - cx, ty: rect.height / 2 - cy })
    })
    return () => cancelAnimationFrame(raf)
  }, [loading, doc.nodes.length])

  // ── Link a note↔note edge into the knowledge graph ──
  const linkInGraph = useCallback(
    async (edge: CanvasEdge) => {
      const from = nodeMap.get(edge.fromNode)
      const to = nodeMap.get(edge.toNode)
      const fromNote = from?.noteId ? noteMap.get(from.noteId) : undefined
      const toNote = to?.noteId ? noteMap.get(to.noteId) : undefined
      if (!fromNote || !toNote) return
      if (!toNote.title.trim()) {
        toast.error('Give the target note a title before linking.')
        return
      }
      await update(fromNote.id, fromNote.title, appendWikilink(fromNote.content, toNote.title))
      updateEdge(edge.id, { linkedInGraph: true })
      toast.success(`Linked “${fromNote.title || 'Untitled'}” → “${toNote.title}”`)
    },
    [nodeMap, noteMap, update, updateEdge],
  )

  // ── Open a media / web node outside the canvas ──
  const openNodeExternally = useCallback(async (node: CanvasNode) => {
    try {
      if (node.type === 'link' && node.url) await openUrl(node.url)
      else if (node.type === 'media' && node.file) await openPath(await getAssetPath(node.file))
    } catch (err) {
      toast.error('Could not open: ' + String(err))
    }
  }, [])

  // ── Pointer interaction ──
  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.button !== 0) return // primary button only; the context menu closes itself
    const board = boardRef.current
    if (!board) return
    const el = e.target as HTMLElement

    // Ignore presses on floating chrome (toolbar, switcher, edge menu, modals,
    // pickers) — only the background itself or the transformed world start a gesture.
    if (el !== board && !el.closest('[data-canvas-world]')) return

    const nodeRoot = el.closest('[data-node-id]') as HTMLElement | null
    const nodeId = nodeRoot?.dataset.nodeId ?? null
    const node = nodeId ? nodeMap.get(nodeId) : null
    // Settings toggle: in Draw mode, manipulation can be disabled entirely so
    // drawing never accidentally moves/resizes a note or attachment.
    const allowManip = mode !== 'draw' || prefs.interactWhileDrawing

    // Node-manipulation handles work in every mode (unless disabled while
    // drawing). Pinned nodes only allow edge-linking, not move/resize.
    if (allowManip && node && el.closest('[data-resize]') && !node.pinned) {
      board.setPointerCapture(e.pointerId)
      beginGesture()
      gesture.current = { kind: 'resize', id: node.id, sx: e.clientX, sy: e.clientY, ow: node.width, oh: node.height }
      selectSingle(node.id); setSelectedEdge(null)
      return
    }
    const sideEl = el.closest('[data-side]') as HTMLElement | null
    if (allowManip && node && sideEl) {
      board.setPointerCapture(e.pointerId)
      const w = screenToWorld(e.clientX, e.clientY)
      gesture.current = { kind: 'edge', from: node.id, fromSide: sideEl.dataset.side as Side }
      setTempEdge({ from: node.id, fromSide: sideEl.dataset.side as Side, x: w.x, y: w.y })
      return
    }
    if (allowManip && node && el.closest('[data-drag]') && !node.pinned && !el.closest('[data-nodrag]')) {
      // Dragging a node that isn't in the current selection selects just it; a
      // node already in a multi-selection drags the whole group together.
      const groupIds = selectionRef.current.has(node.id) ? selectionRef.current : new Set([node.id])
      if (!selectionRef.current.has(node.id)) selectSingle(node.id)
      setSelectedEdge(null)
      const origins = new Map<string, Pt>()
      for (const n of docRef.current.nodes) if (groupIds.has(n.id) && !n.pinned) origins.set(n.id, { x: n.x, y: n.y })
      // Defer the actual drag (capture + history snapshot) until movement, so a
      // plain click / double-click on the node fires natively (double-click edits).
      pendingDragRef.current = { id: node.id, sx: e.clientX, sy: e.clientY, origins }
      return
    }

    // Draw / erase on a node body or empty space.
    if (mode === 'draw') {
      e.preventDefault()
      board.setPointerCapture(e.pointerId)
      const w = screenToWorld(e.clientX, e.clientY)
      beginGesture()
      if (drawTool === 'eraser') {
        gesture.current = { kind: 'erase' }
        eraseNear(w, prefs.eraserSize / 2 / viewRef.current.scale)
      } else {
        gesture.current = { kind: 'draw' }
        setLive({ points: [[w.x, w.y, e.pressure || 0.5]], color: prefs.penColor, size: prefs.penSize })
      }
      return
    }

    // Pan tool: drag anywhere pans.
    const startPan = () => {
      setSelection(new Set()); setSelectedEdge(null)
      board.setPointerCapture(e.pointerId)
      const v = viewRef.current
      gesture.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, tx: v.tx, ty: v.ty }
      setPanning(true)
    }
    if (mode === 'pan') { startPan(); return }

    // Select mode: edge click → select edge; node body → (shift-)select node;
    // empty space → start a marquee (rubber-band) selection.
    const edgeEl = el.closest('[data-edge-id]') as HTMLElement | null
    if (edgeEl) {
      setSelectedEdge(edgeEl.dataset.edgeId!)
      setSelection(new Set())
      return
    }
    if (nodeId) {
      if (e.shiftKey) toggleSelect(nodeId)
      else selectSingle(nodeId)
      setSelectedEdge(null)
      return
    }
    // Empty space: begin a marquee. A tiny drag collapses to a click that clears.
    board.setPointerCapture(e.pointerId)
    setSelectedEdge(null)
    gesture.current = { kind: 'marquee', sx: e.clientX, sy: e.clientY }
    const w0 = screenToWorld(e.clientX, e.clientY)
    setMarquee({ x: w0.x, y: w0.y, w: 0, h: 0 })
  }

  const onPointerMove = (e: ReactPointerEvent) => {
    // Promote a pending node press into a real drag once it clears the threshold.
    if (!gesture.current && pendingDragRef.current) {
      const p = pendingDragRef.current
      if (Math.hypot(e.clientX - p.sx, e.clientY - p.sy) < 4) return
      const primary = docRef.current.nodes.find((n) => n.id === p.id)
      if (primary) {
        try { boardRef.current?.setPointerCapture(e.pointerId) } catch { /* pointer already gone */ }
        beginGesture()
        gesture.current = { kind: 'node', id: p.id, sx: p.sx, sy: p.sy, ox: primary.x, oy: primary.y, origins: p.origins }
      }
      pendingDragRef.current = null
    }
    const g = gesture.current
    if (!g) return
    if (g.kind === 'pan') {
      setView((v) => ({ ...v, tx: g.tx + (e.clientX - g.sx), ty: g.ty + (e.clientY - g.sy) }))
    } else if (g.kind === 'node') {
      const s = viewRef.current.scale
      let dx = (e.clientX - g.sx) / s
      let dy = (e.clientY - g.sy) / s
      let nextGuides: { axis: 'x' | 'y'; at: number }[] = []
      if (prefs.snapEnabled) {
        const primary = docRef.current.nodes.find((n) => n.id === g.id)
        const origin = g.origins.get(g.id) ?? { x: g.ox, y: g.oy }
        if (primary) {
          const moved: Rect = { x: origin.x + dx, y: origin.y + dy, w: primary.width, h: primary.height }
          const others = docRef.current.nodes.filter((n) => !g.origins.has(n.id)).map(nodeRect)
          const res = snapDrag(moved, others, 8, 6 / s)
          dx = res.x - origin.x
          dy = res.y - origin.y
          nextGuides = res.guides
        }
      }
      recordableSetDoc((d) => ({
        ...d,
        nodes: d.nodes.map((n) => {
          const o = g.origins.get(n.id)
          return o ? { ...n, x: o.x + dx, y: o.y + dy } : n
        }),
      }))
      setGuides(nextGuides)
    } else if (g.kind === 'marquee') {
      const a = screenToWorld(g.sx, g.sy)
      const b = screenToWorld(e.clientX, e.clientY)
      setMarquee(rectFromPoints(a.x, a.y, b.x, b.y))
    } else if (g.kind === 'resize') {
      const s = viewRef.current.scale
      updateNode(g.id, { width: Math.max(140, g.ow + (e.clientX - g.sx) / s), height: Math.max(90, g.oh + (e.clientY - g.sy) / s) })
    } else if (g.kind === 'edge') {
      const w = screenToWorld(e.clientX, e.clientY)
      setTempEdge((te) => (te ? { ...te, x: w.x, y: w.y } : te))
    } else if (g.kind === 'draw') {
      const w = screenToWorld(e.clientX, e.clientY)
      setLive((ls) => (ls ? { ...ls, points: [...ls.points, [w.x, w.y, e.pressure || 0.5]] } : ls))
    } else if (g.kind === 'erase') {
      eraseNear(screenToWorld(e.clientX, e.clientY), prefs.eraserSize / 2 / viewRef.current.scale)
    }
  }

  const onPointerUp = (e: ReactPointerEvent) => {
    // A node press that never moved is a plain click — let the native click/
    // dblclick through (selection was already applied on pointerdown).
    pendingDragRef.current = null
    const g = gesture.current
    gesture.current = null
    try { boardRef.current?.releasePointerCapture(e.pointerId) } catch { /* already released */ }
    if (g?.kind === 'pan') {
      setPanning(false)
    } else if (g?.kind === 'edge') {
      const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null
      const toId = (el?.closest('[data-node-id]') as HTMLElement | null)?.dataset.nodeId
      if (toId && toId !== g.from) addEdge({ id: newId(), fromNode: g.from, toNode: toId, fromSide: g.fromSide })
      setTempEdge(null)
    } else if (g?.kind === 'draw') {
      const ls = liveRef.current
      if (ls && ls.points.length > 1) recordableSetDoc((d) => ({ ...d, drawings: [...d.drawings, { id: newId(), ...ls }] }))
      setLive(null)
    } else if (g?.kind === 'marquee') {
      const a = screenToWorld(g.sx, g.sy)
      const b = screenToWorld(e.clientX, e.clientY)
      const rect = rectFromPoints(a.x, a.y, b.x, b.y)
      // A negligible drag is a click on empty space → clear the selection.
      if (rect.w < 3 && rect.h < 3) setSelection(new Set())
      else setSelection(new Set(nodesInMarquee(docRef.current.nodes, rect)))
      setMarquee(null)
    }
    if (g?.kind === 'node') setGuides([])
    if (g?.kind === 'node' || g?.kind === 'resize' || g?.kind === 'draw' || g?.kind === 'erase') endGesture()
  }

  // ── Context menu ──
  const nodeMenuItems = useCallback((node: CanvasNode, pos: Pt): MenuItem[] => {
    const items: MenuItem[] = []
    if (node.type === 'note') {
      const note = node.noteId ? noteMap.get(node.noteId) : undefined
      if (note) items.push({ label: 'Open note', onClick: () => setOpenNote(note) })
    } else if (node.type === 'media' || node.type === 'link') {
      items.push({ label: 'Open', onClick: () => void openNodeExternally(node) })
    }
    items.push({
      label: 'Color…',
      separator: items.length > 0,
      onClick: () => setColorPicker({ x: pos.x, y: pos.y, nodeId: node.id }),
    })
    items.push({ label: node.pinned ? 'Unpin' : 'Pin', onClick: () => updateNode(node.id, { pinned: !node.pinned }) })
    items.push({ label: 'Bring to front', separator: true, onClick: () => recordableSetDoc((d) => bringToFront(d, node.id)) })
    items.push({ label: 'Bring forward', onClick: () => recordableSetDoc((d) => bringForward(d, node.id)) })
    items.push({ label: 'Send backward', onClick: () => recordableSetDoc((d) => sendBackward(d, node.id)) })
    items.push({ label: 'Send to back', onClick: () => recordableSetDoc((d) => sendToBack(d, node.id)) })
    items.push({ label: 'Remove from canvas', separator: true, danger: true, onClick: () => removeNode(node.id) })
    return items
  }, [noteMap, openNodeExternally, recordableSetDoc, removeNode, updateNode])

  const emptyMenuItems = useCallback((p: Pt): MenuItem[] => [
    { label: 'Add text box', onClick: () => addTextAt(p) },
    { label: 'Paste text box', separator: true, onClick: () => void pasteText(p) },
    { label: 'Paste image', onClick: () => void pasteImage(p) },
    { label: 'Paste URL', onClick: () => void pasteUrl(p) },
    { label: 'Reset view', separator: true, onClick: () => setView({ tx: 0, ty: 0, scale: 1 }) },
  ], [addTextAt, pasteImage, pasteText, pasteUrl])

  const onContextMenu = (e: ReactMouseEvent) => {
    const board = boardRef.current
    const el = e.target as HTMLElement
    if (!board || (el !== board && !el.closest('[data-canvas-world]'))) return
    e.preventDefault()
    const nodeRoot = el.closest('[data-node-id]') as HTMLElement | null
    const node = nodeRoot ? nodeMap.get(nodeRoot.dataset.nodeId!) : null
    if (node) {
      if (!selectionRef.current.has(node.id)) selectSingle(node.id)
      setSelectedEdge(null)
      setMenu({ x: e.clientX, y: e.clientY, items: nodeMenuItems(node, { x: e.clientX, y: e.clientY }) })
    } else {
      setMenu({ x: e.clientX, y: e.clientY, items: emptyMenuItems(screenToWorld(e.clientX, e.clientY)) })
    }
  }

  // Non-passive wheel zoom (React onWheel is passive — can't preventDefault).
  useEffect(() => {
    const el = boardRef.current
    if (!el) return
    const handler = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      zoomAround(e.clientX - rect.left, e.clientY - rect.top, e.deltaY < 0 ? 1 : -1)
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [])

  // Keyboard: tool shortcuts + undo/redo + delete the selected node / edge
  // (unless typing).
  const nudgeSelection = useCallback((dx: number, dy: number) => {
    const ids = selectionRef.current
    if (ids.size === 0) return
    recordableSetDoc((d) => ({
      ...d,
      nodes: d.nodes.map((n) => (ids.has(n.id) && !n.pinned ? { ...n, x: n.x + dx, y: n.y + dy } : n)),
    }))
  }, [recordableSetDoc])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const active = document.activeElement as HTMLElement | null
      const tag = (active?.tagName ?? '').toLowerCase()
      // Never hijack keys while typing — including a CM6 editor (contenteditable)
      // in an adjacent Working Notes split.
      if (tag === 'input' || tag === 'textarea' || active?.isContentEditable) return
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo(); else undo()
        return
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        redo()
        return
      }
      if (mod && e.key.toLowerCase() === 'c') { copySelection(); return }
      if (mod && e.key.toLowerCase() === 'v') { e.preventDefault(); pasteClipboard(); return }
      if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicateSelection(); return }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectionRef.current.size > 0) { e.preventDefault(); removeSelected() }
        else if (selectedEdge) { e.preventDefault(); removeEdge(selectedEdge); setSelectedEdge(null) }
        return
      }
      if (e.key === 'Escape') {
        if (fullscreenRef.current) { setFullscreen(false); return }
        setSelection(new Set()); setSelectedEdge(null); return
      }
      // Arrow-key nudge of the selection (Shift = ×10). Only when something's selected.
      if (selectionRef.current.size > 0 && e.key.startsWith('Arrow')) {
        e.preventDefault()
        const step = e.shiftKey ? 10 : 1
        if (e.key === 'ArrowLeft') nudgeSelection(-step, 0)
        else if (e.key === 'ArrowRight') nudgeSelection(step, 0)
        else if (e.key === 'ArrowUp') nudgeSelection(0, -step)
        else if (e.key === 'ArrowDown') nudgeSelection(0, step)
        return
      }
      // Tool shortcuts — plain keys only, never while a modifier is held.
      if (mod) return
      const k = e.key.toLowerCase()
      if (k === 'v') setMode('select')
      else if (k === 'h') setMode('pan')
      else if (k === 'd') setMode('draw')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedEdge, removeSelected, removeEdge, undo, redo, copySelection, pasteClipboard, duplicateSelection, nudgeSelection])

  // ── Edge geometry for rendering ──
  const edgeGeoms = useMemo(() => {
    return doc.edges.flatMap((e) => {
      const from = nodeMap.get(e.fromNode)
      const to = nodeMap.get(e.toNode)
      if (!from || !to) return []
      const fs = e.fromSide ?? sideToward(from, center(to))
      const ts = e.toSide ?? sideToward(to, center(from))
      const p1 = anchor(from, fs)
      const p2 = anchor(to, ts)
      return [{ edge: e, d: edgePath(p1, fs, p2, ts), mid: { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 } }]
    })
  }, [doc.edges, nodeMap])

  // Dotted connectors between wikilinked note cards (derived, not stored).
  const wikilinkGeoms = useMemo(
    () =>
      wikilinkEdges.flatMap((e) => {
        const from = nodeMap.get(e.fromNode)
        const to = nodeMap.get(e.toNode)
        if (!from || !to) return []
        const fs = sideToward(from, center(to))
        const ts = sideToward(to, center(from))
        return [{ key: `${e.fromNode}|${e.toNode}`, d: edgePath(anchor(from, fs), fs, anchor(to, ts), ts) }]
      }),
    [wikilinkEdges, nodeMap],
  )

  const selEdge = selectedEdge ? doc.edges.find((e) => e.id === selectedEdge) ?? null : null
  const selEdgeGeom = selEdge ? edgeGeoms.find((g) => g.edge.id === selEdge.id) ?? null : null
  const selEdgeNotes = selEdge
    ? Boolean(nodeMap.get(selEdge.fromNode)?.noteId && nodeMap.get(selEdge.toNode)?.noteId)
    : false

  const tempLine = useMemo(() => {
    if (!tempEdge) return null
    const from = nodeMap.get(tempEdge.from)
    if (!from) return null
    const p1 = anchor(from, tempEdge.fromSide)
    return `M ${p1.x} ${p1.y} L ${tempEdge.x} ${tempEdge.y}`
  }, [tempEdge, nodeMap])

  if (loading) return <div className={styles.loading}>Loading canvas…</div>

  const stroke = 2 / view.scale
  const isEmpty = doc.nodes.length === 0 && doc.drawings.length === 0
  const belowNodes = doc.nodes.filter((n) => n.layer !== 'above')
  const aboveNodes = doc.nodes.filter((n) => n.layer === 'above')
  const cursor =
    mode === 'draw' ? (drawTool === 'eraser' ? ERASER_CURSOR : PEN_CURSOR)
    : mode === 'pan' ? (panning ? 'grabbing' : 'grab')
    : 'default'
  const boardStyle = doc.background
    ? doc.background.type === 'color'
      ? { cursor, background: doc.background.value }
      : {
          cursor,
          backgroundImage: `url(${assetUrl(doc.background.value)})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
        }
    : { cursor }

  const renderNode = (n: CanvasNode) => (
    <CanvasNodeView
      key={n.id}
      node={n}
      selected={selection.has(n.id)}
      scale={view.scale}
      note={n.noteId ? noteMap.get(n.noteId) : undefined}
      onOpenNote={setOpenNote}
      onChangeText={onChangeText}
    />
  )

  return (
    <div
      ref={boardRef}
      className={`${styles.board}${fullscreen ? ' ' + styles.boardFullscreen : ''}`}
      tabIndex={0}
      role="application"
      aria-label="Canvas board — arrow keys nudge the selection, Delete removes it"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onContextMenu={onContextMenu}
      style={
        fullscreen
          ? { ...boardStyle, left: `var(${sidebarCollapsed ? '--sidebar-collapsed-width' : '--sidebar-width'})` }
          : boardStyle
      }
    >
      <div data-canvas-world className={styles.world} style={{ transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})` }}>
        {/* Edges */}
        <svg className={styles.edgeSvg}>
          <defs>
            <marker id="canvas-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--text-3)" />
            </marker>
          </defs>
          {edgeGeoms.map(({ edge, d, mid }) => {
            const selected = edge.id === selectedEdge
            const col = edge.color || (edge.linkedInGraph ? 'var(--accent)' : 'var(--text-3)')
            return (
              <g key={edge.id}>
                <path className={styles.edgeHit} data-edge-id={edge.id} d={d} style={{ strokeWidth: 16 / view.scale }} />
                <path
                  className={styles.edgePath}
                  d={d}
                  stroke={selected ? 'var(--accent)' : col}
                  strokeWidth={selected ? stroke * 2 : stroke}
                  strokeDasharray={edge.linkedInGraph ? undefined : `${6 / view.scale} ${4 / view.scale}`}
                  markerEnd="url(#canvas-arrow)"
                />
                {edge.label && (
                  <text className={styles.edgeLabel} x={mid.x} y={mid.y} textAnchor="middle" style={{ fontSize: 11 / view.scale }}>
                    {edge.label}
                  </text>
                )}
              </g>
            )
          })}
          {/* Derived wikilink connectors — dotted, non-interactive */}
          {wikilinkGeoms.map(({ key, d }) => (
            <path
              key={key}
              className={styles.wikilinkEdge}
              d={d}
              stroke="var(--accent)"
              strokeWidth={stroke}
              strokeDasharray={`${2 / view.scale} ${5 / view.scale}`}
              fill="none"
              pointerEvents="none"
            />
          ))}

          {/* Alignment guides while dragging */}
          {guides.map((g, i) =>
            g.axis === 'x' ? (
              <line key={`gx${i}`} x1={g.at} y1={-100000} x2={g.at} y2={100000} stroke="var(--accent)" strokeWidth={1 / view.scale} pointerEvents="none" />
            ) : (
              <line key={`gy${i}`} x1={-100000} y1={g.at} x2={100000} y2={g.at} stroke="var(--accent)" strokeWidth={1 / view.scale} pointerEvents="none" />
            ),
          )}

          {/* Marquee (rubber-band) selection rect */}
          {marquee && (
            <rect
              x={marquee.x}
              y={marquee.y}
              width={marquee.w}
              height={marquee.h}
              fill="color-mix(in srgb, var(--accent) 14%, transparent)"
              stroke="var(--accent)"
              strokeWidth={1 / view.scale}
              pointerEvents="none"
            />
          )}

          {tempLine && <path className={styles.edgePath} d={tempLine} stroke="var(--accent)" strokeWidth={stroke} strokeDasharray={`${4 / view.scale}`} />}
        </svg>

        {/* Below-ink nodes */}
        {belowNodes.map(renderNode)}

        {/* Freehand ink */}
        <DrawLayer drawings={doc.drawings} live={live} />

        {/* Above-ink nodes (brought to front) */}
        {aboveNodes.map(renderNode)}
      </div>

      {/* Edge menu (screen-space, anchored at the edge midpoint) */}
      {selEdge && selEdgeGeom && (
        <div
          className={styles.edgeMenu}
          style={{ left: selEdgeGeom.mid.x * view.scale + view.tx, top: selEdgeGeom.mid.y * view.scale + view.ty }}
        >
          <button
            className={styles.edgeMenuBtn}
            onClick={async () => {
              const label = await showPromptDialog({ title: 'Edge label', defaultValue: selEdge.label ?? '', confirmLabel: 'Set' })
              if (label !== null) updateEdge(selEdge.id, { label: label.trim() || undefined })
            }}
          >
            Label
          </button>
          {selEdgeNotes && (
            <button
              className={`${styles.edgeMenuBtn} ${selEdge.linkedInGraph ? styles.edgeMenuBtnOn : ''}`}
              onClick={() => !selEdge.linkedInGraph && linkInGraph(selEdge)}
              title="Insert a [[wikilink]] so this connection appears in the graph"
            >
              {selEdge.linkedInGraph
                ? <><Check size={14} /> Linked</>
                : <><Link2 size={14} /> Link in graph</>}
            </button>
          )}
          <button className={styles.edgeMenuBtn} onClick={() => { removeEdge(selEdge.id); setSelectedEdge(null) }}>
            Delete
          </button>
        </div>
      )}

      {headerSlot}

      <button
        className={styles.fsToggle}
        onClick={() => setFullscreen((v) => !v)}
        title={fullscreen ? 'Exit fullscreen' : 'Fullscreen canvas'}
        aria-label={fullscreen ? 'Exit fullscreen' : 'Fullscreen canvas'}
      >
        {fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
      </button>

      <CanvasToolbar
        mode={mode}
        onSetMode={setMode}
        drawTool={drawTool}
        onSetDrawTool={setDrawTool}
        color={prefs.penColor}
        onColor={(c) => setPrefs({ penColor: c })}
        penSize={prefs.penSize}
        onPenSize={(s) => setPrefs({ penSize: s })}
        eraserMode={prefs.eraserMode}
        onEraserMode={(m) => setPrefs({ eraserMode: m })}
        eraserSize={prefs.eraserSize}
        onEraserSize={(s) => setPrefs({ eraserSize: s })}
        interactWhileDrawing={prefs.interactWhileDrawing}
        onInteractWhileDrawing={(v) => setPrefs({ interactWhileDrawing: v })}
        snapEnabled={prefs.snapEnabled}
        onToggleSnap={(v) => setPrefs({ snapEnabled: v })}
        showWikilinkEdges={prefs.showWikilinkEdges}
        onToggleWikilinkEdges={(v) => setPrefs({ showWikilinkEdges: v })}
        onExport={() => void handleExport()}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={undo}
        onRedo={redo}
        onAddText={handleAddText}
        onAddNote={() => setPicking(true)}
        onAddMedia={handleAddMedia}
        onAddWeb={handleAddWeb}
        scale={view.scale}
        onZoom={handleZoom}
        onFit={handleFit}
        background={doc.background}
        onSetBackgroundColor={setBackgroundColor}
        onUploadBackgroundImage={() => void handleUploadBackground()}
        onResetBackground={resetBackground}
      />

      {isEmpty && (
        <div className={styles.hint}>Add a note or text card from the toolbar, drag between cards to connect, or Draw to sketch.</div>
      )}

      {picking && (
        <CanvasNotePicker
          notes={notesPool}
          placedIds={placedNoteIds}
          onPick={handlePickNotes}
          onClose={() => setPicking(false)}
        />
      )}

      {openNote && (
        <NoteModal note={openNote} isOpen={!!openNote} onClose={() => setOpenNote(null)} onUpdate={update} onUpdateTags={updateTags} />
      )}

      {menu && <CanvasContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}

      {colorPicker && (
        <CanvasColorPicker
          x={colorPicker.x}
          y={colorPicker.y}
          value={nodeMap.get(colorPicker.nodeId)?.color}
          onPick={(c) => updateNode(colorPicker.nodeId, { color: c })}
          onClose={() => setColorPicker(null)}
        />
      )}
    </div>
  )
}
