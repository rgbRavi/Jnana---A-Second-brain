import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { open } from '@tauri-apps/plugin-dialog'
import { useNotesContext } from '../../../context/NotesContext'
import { useWorkspaceNotes } from '../../../hooks/useWorkspaceNotes'
import { useCanvas } from '../../../hooks/useCanvas'
import { useCanvasList } from '../../../hooks/useCanvasList'
import { importMedia } from '../../../core/media'
import { newId, type CanvasEdge, type CanvasNode, type Side } from '../../../core/canvas'
import { showPromptDialog } from '../../../lib/dialog'
import { toast } from '../../../lib/toast'
import { NoteModal } from '../../../ui/NoteModal'
import type { Note } from '../../../types'
import { CanvasNodeView } from './CanvasNodeView'
import { CanvasToolbar, type CanvasMode, type DrawTool } from './CanvasToolbar'
import { CanvasNotePicker } from './CanvasNotePicker'
import { CanvasSwitcher } from './CanvasSwitcher'
import { DrawLayer } from './DrawLayer'
import styles from './canvas.module.css'

interface Props {
  workspaceId: string
}

type Pt = { x: number; y: number }
type View = { tx: number; ty: number; scale: number }

type Gesture =
  | { kind: 'pan'; sx: number; sy: number; tx: number; ty: number }
  | { kind: 'node'; id: string; sx: number; sy: number; ox: number; oy: number }
  | { kind: 'resize'; id: string; sx: number; sy: number; ow: number; oh: number }
  | { kind: 'edge'; from: string; fromSide: Side }
  | { kind: 'draw' }
  | { kind: 'erase' }

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

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

function mediaTypeFromExt(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (['mp4', 'webm', 'mov', 'avi', 'mkv'].includes(ext)) return 'video'
  if (['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg'].includes(ext)) return 'audio'
  if (ext === 'pdf') return 'pdf'
  return 'image'
}

/** Append a single [[wikilink]] under a "## Links" section (created if absent). */
function appendWikilink(content: string, targetTitle: string): string {
  const wl = `[[${targetTitle}]]`
  if (content.includes(wl)) return content
  const heading = '## Links'
  if (content.includes(heading)) return content.replace(heading, `${heading}\n${wl}`)
  return `${content.trimEnd()}\n\n${heading}\n${wl}\n`
}

export function CanvasBoard({ workspaceId }: Props) {
  const { canvases, activeId, setActiveId, loading: listLoading, create, rename, remove } = useCanvasList(workspaceId)
  const { doc, setDoc } = useCanvas(activeId)
  const { notes: allNotes, update, updateTags } = useNotesContext()
  const { notes: wsNotes } = useWorkspaceNotes(workspaceId)

  const [view, setView] = useState<View>({ tx: 0, ty: 0, scale: 1 })
  const [mode, setMode] = useState<CanvasMode>('select')
  const [drawTool, setDrawTool] = useState<DrawTool>('pen')
  const [color, setColor] = useState('#7c6af7')
  const [selectedNode, setSelectedNode] = useState<string | null>(null)
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null)
  const [tempEdge, setTempEdge] = useState<{ from: string; fromSide: Side; x: number; y: number } | null>(null)
  const [live, setLive] = useState<{ points: [number, number, number][]; color: string; size: number } | null>(null)
  const [picking, setPicking] = useState(false)
  const [openNote, setOpenNote] = useState<Note | null>(null)

  const boardRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef(view)
  viewRef.current = view
  const gesture = useRef<Gesture | null>(null)
  const liveRef = useRef(live)
  liveRef.current = live

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

  // ── Doc mutators (stable) ──
  const addNode = useCallback((n: CanvasNode) => setDoc((d) => ({ ...d, nodes: [...d.nodes, n] })), [setDoc])
  const updateNode = useCallback(
    (id: string, patch: Partial<CanvasNode>) =>
      setDoc((d) => ({ ...d, nodes: d.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) })),
    [setDoc],
  )
  const removeNode = useCallback(
    (id: string) =>
      setDoc((d) => ({
        ...d,
        nodes: d.nodes.filter((n) => n.id !== id),
        edges: d.edges.filter((e) => e.fromNode !== id && e.toNode !== id),
      })),
    [setDoc],
  )
  const addEdge = useCallback(
    (e: CanvasEdge) =>
      setDoc((d) =>
        d.edges.some((x) => x.fromNode === e.fromNode && x.toNode === e.toNode) ? d : { ...d, edges: [...d.edges, e] },
      ),
    [setDoc],
  )
  const updateEdge = useCallback(
    (id: string, patch: Partial<CanvasEdge>) =>
      setDoc((d) => ({ ...d, edges: d.edges.map((e) => (e.id === id ? { ...e, ...patch } : e)) })),
    [setDoc],
  )
  const removeEdge = useCallback((id: string) => setDoc((d) => ({ ...d, edges: d.edges.filter((e) => e.id !== id) })), [setDoc])
  const eraseNear = useCallback(
    (p: Pt, r: number) =>
      setDoc((d) => ({ ...d, drawings: d.drawings.filter((dr) => !dr.points.some(([x, y]) => Math.hypot(x - p.x, y - p.y) <= r)) })),
    [setDoc],
  )

  const onChangeText = useCallback((id: string, text: string) => updateNode(id, { text }), [updateNode])

  // ── Toolbar actions ──
  const handleAddText = () => {
    const c = centerWorld()
    addNode({ id: newId(), type: 'text', x: c.x - 100, y: c.y - 70, width: 200, height: 140, text: '' })
  }
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
    const url = /^https?:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`
    const c = centerWorld()
    addNode({ id: newId(), type: 'link', url, x: c.x - 160, y: c.y - 120, width: 320, height: 240 })
  }

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

  // ── Pointer interaction ──
  const onPointerDown = (e: ReactPointerEvent) => {
    const board = boardRef.current
    if (!board) return
    const el = e.target as HTMLElement

    // Ignore presses on floating chrome (toolbar, switcher, edge menu, modals,
    // pickers) — only the background itself or the transformed world start a
    // gesture. Otherwise capturing the pointer here would steal their clicks.
    if (el !== board && !el.closest('[data-canvas-world]')) return

    if (mode === 'draw') {
      e.preventDefault()
      board.setPointerCapture(e.pointerId)
      const w = screenToWorld(e.clientX, e.clientY)
      if (drawTool === 'eraser') {
        gesture.current = { kind: 'erase' }
        eraseNear(w, 14 / viewRef.current.scale)
      } else {
        gesture.current = { kind: 'draw' }
        setLive({ points: [[w.x, w.y, e.pressure || 0.5]], color, size: 4 })
      }
      return
    }

    const edgeEl = el.closest('[data-edge-id]') as HTMLElement | null
    if (edgeEl) {
      setSelectedEdge(edgeEl.dataset.edgeId!)
      setSelectedNode(null)
      return
    }

    const nodeRoot = el.closest('[data-node-id]') as HTMLElement | null
    const nodeId = nodeRoot?.dataset.nodeId ?? null

    if (nodeId && el.closest('[data-resize]')) {
      const n = nodeMap.get(nodeId)
      if (!n) return
      board.setPointerCapture(e.pointerId)
      gesture.current = { kind: 'resize', id: nodeId, sx: e.clientX, sy: e.clientY, ow: n.width, oh: n.height }
      setSelectedNode(nodeId); setSelectedEdge(null)
      return
    }
    const sideEl = el.closest('[data-side]') as HTMLElement | null
    if (nodeId && sideEl) {
      board.setPointerCapture(e.pointerId)
      const w = screenToWorld(e.clientX, e.clientY)
      gesture.current = { kind: 'edge', from: nodeId, fromSide: sideEl.dataset.side as Side }
      setTempEdge({ from: nodeId, fromSide: sideEl.dataset.side as Side, x: w.x, y: w.y })
      return
    }
    if (nodeId && el.closest('[data-drag]')) {
      const n = nodeMap.get(nodeId)
      if (!n) return
      board.setPointerCapture(e.pointerId)
      gesture.current = { kind: 'node', id: nodeId, sx: e.clientX, sy: e.clientY, ox: n.x, oy: n.y }
      setSelectedNode(nodeId); setSelectedEdge(null)
      return
    }
    if (nodeId) {
      setSelectedNode(nodeId); setSelectedEdge(null)
      return
    }
    // background → pan
    setSelectedNode(null); setSelectedEdge(null)
    board.setPointerCapture(e.pointerId)
    const v = viewRef.current
    gesture.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, tx: v.tx, ty: v.ty }
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
      eraseNear(screenToWorld(e.clientX, e.clientY), 14 / viewRef.current.scale)
    }
  }

  const onPointerUp = (e: ReactPointerEvent) => {
    const g = gesture.current
    gesture.current = null
    try { boardRef.current?.releasePointerCapture(e.pointerId) } catch { /* already released */ }
    if (g?.kind === 'edge') {
      const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null
      const toId = (el?.closest('[data-node-id]') as HTMLElement | null)?.dataset.nodeId
      if (toId && toId !== g.from) addEdge({ id: newId(), fromNode: g.from, toNode: toId, fromSide: g.fromSide })
      setTempEdge(null)
    } else if (g?.kind === 'draw') {
      const ls = liveRef.current
      if (ls && ls.points.length > 1) setDoc((d) => ({ ...d, drawings: [...d.drawings, { id: newId(), ...ls }] }))
      setLive(null)
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

  // Delete the selected node / edge (unless typing in a field).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      const tag = (document.activeElement?.tagName ?? '').toLowerCase()
      if (tag === 'input' || tag === 'textarea') return
      if (selectedNode) { e.preventDefault(); removeNode(selectedNode); setSelectedNode(null) }
      else if (selectedEdge) { e.preventDefault(); removeEdge(selectedEdge); setSelectedEdge(null) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedNode, selectedEdge, removeNode, removeEdge])

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

  return (
    <div
      ref={boardRef}
      className={styles.board}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      style={{ cursor: mode === 'draw' ? 'crosshair' : 'default' }}
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

        {/* Freehand ink */}
        <DrawLayer drawings={doc.drawings} live={live} />

        {/* Nodes */}
        {doc.nodes.map((n) => (
          <CanvasNodeView
            key={n.id}
            node={n}
            selected={n.id === selectedNode}
            scale={view.scale}
            note={n.noteId ? noteMap.get(n.noteId) : undefined}
            onOpenNote={setOpenNote}
            onChangeText={onChangeText}
          />
        ))}
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
        color={color}
        onColor={setColor}
        onAddText={handleAddText}
        onAddNote={() => setPicking(true)}
        onAddMedia={handleAddMedia}
        onAddWeb={handleAddWeb}
        scale={view.scale}
        onZoom={handleZoom}
        onFit={handleFit}
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
    </div>
  )
}
