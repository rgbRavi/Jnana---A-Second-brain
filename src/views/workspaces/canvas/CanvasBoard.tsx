import {
  useCallback, useEffect, useMemo, useRef, useState,
  type PointerEvent as ReactPointerEvent, type MouseEvent as ReactMouseEvent,
} from 'react'
import { open } from '@tauri-apps/plugin-dialog'
import { openUrl, openPath } from '@tauri-apps/plugin-opener'
import { readText, readImage } from '@tauri-apps/plugin-clipboard-manager'
import { useNotesContext } from '../../../context/NotesContext'
import { useWorkspaceNotes } from '../../../hooks/useWorkspaceNotes'
import { useCanvas } from '../../../hooks/useCanvas'
import { useCanvasList } from '../../../hooks/useCanvasList'
import { importMedia, getAssetPath } from '../../../core/media'
import { uploadAsset } from '../../../core/notes'
import {
  newId, bringToFront, bringForward, sendBackward, sendToBack, eraseAt,
  type CanvasDoc, type CanvasEdge, type CanvasNode, type Side,
} from '../../../core/canvas'
import { showPromptDialog } from '../../../lib/dialog'
import { toast } from '../../../lib/toast'
import { NoteModal } from '../../../ui/NoteModal'
import type { Note } from '../../../types'
import { CanvasNodeView } from './CanvasNodeView'
import { CanvasToolbar, type CanvasMode, type DrawTool } from './CanvasToolbar'
import { useCanvasPrefs } from './useCanvasPrefs'
import { CanvasNotePicker } from './CanvasNotePicker'
import { CanvasSwitcher } from './CanvasSwitcher'
import { CanvasContextMenu, type MenuItem } from './CanvasContextMenu'
import { CanvasColorPicker } from './CanvasColorPicker'
import { DrawLayer } from './DrawLayer'
import styles from './canvas.module.css'

interface Props {
  workspaceId: string
}

type Pt = { x: number; y: number }
type View = { tx: number; ty: number; scale: number }
type DocUpdater = CanvasDoc | ((prev: CanvasDoc) => CanvasDoc)

type Gesture =
  | { kind: 'pan'; sx: number; sy: number; tx: number; ty: number }
  | { kind: 'node'; id: string; sx: number; sy: number; ox: number; oy: number }
  | { kind: 'resize'; id: string; sx: number; sy: number; ow: number; oh: number }
  | { kind: 'edge'; from: string; fromSide: Side }
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

export function CanvasBoard({ workspaceId }: Props) {
  const { canvases, activeId, setActiveId, loading: listLoading, create, rename, remove } = useCanvasList(workspaceId)
  const { doc, setDoc } = useCanvas(activeId)
  const { notes: allNotes, update, updateTags } = useNotesContext()
  const { notes: wsNotes } = useWorkspaceNotes(workspaceId)
  const [prefs, setPrefs] = useCanvasPrefs()

  const [view, setView] = useState<View>({ tx: 0, ty: 0, scale: 1 })
  const [mode, setMode] = useState<CanvasMode>('select')
  const [drawTool, setDrawTool] = useState<DrawTool>('pen')
  const [panning, setPanning] = useState(false)
  const [selectedNode, setSelectedNode] = useState<string | null>(null)
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null)
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

  // ── Undo / redo history (snapshots kept in refs — no extra renders) ──
  const pastRef = useRef<CanvasDoc[]>([])
  const futureRef = useRef<CanvasDoc[]>([])
  const coalescingRef = useRef(false)

  // Reset history when switching canvases — past snapshots from another board
  // don't make sense here.
  useEffect(() => {
    pastRef.current = []
    futureRef.current = []
    setCanUndo(false)
    setCanRedo(false)
  }, [activeId])

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
      const tag = (document.activeElement?.tagName ?? '').toLowerCase()
      if (tag === 'input' || tag === 'textarea') return
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
      setSelectedNode(node.id); setSelectedEdge(null)
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
      board.setPointerCapture(e.pointerId)
      beginGesture()
      gesture.current = { kind: 'node', id: node.id, sx: e.clientX, sy: e.clientY, ox: node.x, oy: node.y }
      setSelectedNode(node.id); setSelectedEdge(null)
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
      setSelectedNode(null); setSelectedEdge(null)
      board.setPointerCapture(e.pointerId)
      const v = viewRef.current
      gesture.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, tx: v.tx, ty: v.ty }
      setPanning(true)
    }
    if (mode === 'pan') { startPan(); return }

    // Select mode: edge click → select edge; node body → select node; else pan.
    const edgeEl = el.closest('[data-edge-id]') as HTMLElement | null
    if (edgeEl) {
      setSelectedEdge(edgeEl.dataset.edgeId!)
      setSelectedNode(null)
      return
    }
    if (nodeId) {
      setSelectedNode(nodeId); setSelectedEdge(null)
      return
    }
    startPan()
  }

  const onPointerMove = (e: ReactPointerEvent) => {
    const g = gesture.current
    if (!g) return
    if (g.kind === 'pan') {
      setView((v) => ({ ...v, tx: g.tx + (e.clientX - g.sx), ty: g.ty + (e.clientY - g.sy) }))
    } else if (g.kind === 'node') {
      const s = viewRef.current.scale
      updateNode(g.id, { x: g.ox + (e.clientX - g.sx) / s, y: g.oy + (e.clientY - g.sy) / s })
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
    }
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
      setSelectedNode(node.id); setSelectedEdge(null)
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
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName ?? '').toLowerCase()
      if (tag === 'input' || tag === 'textarea') return
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo(); else undo()
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        redo()
        return
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedNode) { e.preventDefault(); removeNode(selectedNode); setSelectedNode(null) }
        else if (selectedEdge) { e.preventDefault(); removeEdge(selectedEdge); setSelectedEdge(null) }
        return
      }
      const k = e.key.toLowerCase()
      if (k === 'v') setMode('select')
      else if (k === 'h') setMode('pan')
      else if (k === 'd') setMode('draw')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedNode, selectedEdge, removeNode, removeEdge, undo, redo])

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

  if (listLoading) return <div className={styles.loading}>Loading canvas…</div>

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
      selected={n.id === selectedNode}
      scale={view.scale}
      note={n.noteId ? noteMap.get(n.noteId) : undefined}
      onOpenNote={setOpenNote}
      onChangeText={onChangeText}
    />
  )

  return (
    <div
      ref={boardRef}
      className={styles.board}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onContextMenu={onContextMenu}
      style={boardStyle}
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
              {selEdge.linkedInGraph ? '✓ Linked' : '🔗 Link in graph'}
            </button>
          )}
          <button className={styles.edgeMenuBtn} onClick={() => { removeEdge(selEdge.id); setSelectedEdge(null) }}>
            Delete
          </button>
        </div>
      )}

      <CanvasSwitcher
        canvases={canvases}
        activeId={activeId}
        onSelect={setActiveId}
        onNew={create}
        onRename={rename}
        onDelete={remove}
      />

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
          notes={wsNotes}
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
