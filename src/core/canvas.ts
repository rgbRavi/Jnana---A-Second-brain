// Workspace canvases — invoke wrappers + the board document model. The whole
// board is one JSON document (JSON-Canvas-compatible shape + Jnana extensions:
// note-cards reference notes by id; freehand `drawings` are an extension) stored
// in `Canvas.data`. Mirrors core/workspaces.ts.

import { invoke } from '@tauri-apps/api/core'

export type CanvasNodeType = 'text' | 'note' | 'media' | 'link'
export type Side = 'top' | 'right' | 'bottom' | 'left'

export interface CanvasNode {
  id: string
  type: CanvasNodeType
  x: number
  y: number
  width: number
  height: number
  color?: string
  /** text node */
  text?: string
  /** note node — references a global note */
  noteId?: string
  /** media node — a jnana-asset filename + its kind */
  file?: string
  mediaType?: string
  /** link node (Phase B) — an embedded web page */
  url?: string
  /** Locks the node against accidental move/resize (toggled from the context menu). */
  pinned?: boolean
  /** Stacking relative to the freehand ink layer. Default/undefined = 'below'
   *  (ink draws over the node); 'above' lifts the node on top of the ink. */
  layer?: 'below' | 'above'
}

export interface CanvasEdge {
  id: string
  fromNode: string
  toNode: string
  fromSide?: Side
  toSide?: Side
  label?: string
  color?: string
  /** True once this note↔note edge has been promoted to a real [[wikilink]]. */
  linkedInGraph?: boolean
}

/** A freehand stroke: [x, y, pressure] points in world coordinates. */
export interface Drawing {
  id: string
  points: [number, number, number][]
  color: string
  size: number
}

/** Custom board backdrop. 'color' is a flat fill; 'image' is a jnana-asset
 *  filename (uploaded via import_media), stretched to cover the viewport.
 *  Undefined/missing = the default dot-grid backdrop. */
export interface CanvasBackground {
  type: 'color' | 'image'
  value: string
}

export interface CanvasDoc {
  nodes: CanvasNode[]
  edges: CanvasEdge[]
  drawings: Drawing[]
  background?: CanvasBackground
}

/** A canvas row as returned by Rust (camelCase). `data` is a JSON CanvasDoc. */
export interface Canvas {
  id: string
  workspaceId: string
  title: string
  data: string
  createdAt: number
  updatedAt: number
}

export const EMPTY_DOC: CanvasDoc = { nodes: [], edges: [], drawings: [] }

/** Parse a canvas's stored JSON into a doc, tolerating missing/old fields. */
export function parseDoc(data: string): CanvasDoc {
  try {
    const d = JSON.parse(data) as Partial<CanvasDoc>
    return {
      nodes: Array.isArray(d.nodes) ? d.nodes : [],
      edges: Array.isArray(d.edges) ? d.edges : [],
      drawings: Array.isArray(d.drawings) ? d.drawings : [],
      background: d.background,
    }
  } catch {
    return { ...EMPTY_DOC }
  }
}

export function serializeDoc(doc: CanvasDoc): string {
  return JSON.stringify(doc)
}

// ── Z-ordering ──────────────────────────────────────────────────────────────
// Stacking is encoded by array order (later = higher) split across two groups by
// `node.layer`: 'below' (default) paints under the ink, 'above' paints over it.
// These return a new doc and are no-ops if the node is missing.

const nodeLayer = (n: CanvasNode): 'below' | 'above' => n.layer ?? 'below'

function reorderNodes(doc: CanvasDoc, id: string, fn: (nodes: CanvasNode[], idx: number) => CanvasNode[]): CanvasDoc {
  const idx = doc.nodes.findIndex((n) => n.id === id)
  if (idx === -1) return doc
  return { ...doc, nodes: fn([...doc.nodes], idx) }
}

/** Lift to the very top: above the ink layer and last in paint order. */
export function bringToFront(doc: CanvasDoc, id: string): CanvasDoc {
  return reorderNodes(doc, id, (nodes, idx) => {
    const [n] = nodes.splice(idx, 1)
    nodes.push({ ...n, layer: 'above' })
    return nodes
  })
}

/** Drop to the very bottom: below the ink layer and first in paint order. */
export function sendToBack(doc: CanvasDoc, id: string): CanvasDoc {
  return reorderNodes(doc, id, (nodes, idx) => {
    const [n] = nodes.splice(idx, 1)
    nodes.unshift({ ...n, layer: 'below' })
    return nodes
  })
}

/** Swap one step up among same-layer siblings. */
export function bringForward(doc: CanvasDoc, id: string): CanvasDoc {
  return reorderNodes(doc, id, (nodes, idx) => {
    for (let j = idx + 1; j < nodes.length; j++) {
      if (nodeLayer(nodes[j]) === nodeLayer(nodes[idx])) {
        ;[nodes[idx], nodes[j]] = [nodes[j], nodes[idx]]
        break
      }
    }
    return nodes
  })
}

/** Swap one step down among same-layer siblings. */
export function sendBackward(doc: CanvasDoc, id: string): CanvasDoc {
  return reorderNodes(doc, id, (nodes, idx) => {
    for (let j = idx - 1; j >= 0; j--) {
      if (nodeLayer(nodes[j]) === nodeLayer(nodes[idx])) {
        ;[nodes[idx], nodes[j]] = [nodes[j], nodes[idx]]
        break
      }
    }
    return nodes
  })
}

// ── Erasing ──────────────────────────────────────────────────────────────────

export type EraserMode = 'touch' | 'stroke'

/**
 * Remove ink near a point. 'stroke' drops any whole stroke that passes within
 * `r` of `p` (the original behavior). 'touch' removes only the touched points,
 * splitting the surviving points of each stroke into separate `Drawing`s per
 * contiguous run (runs shorter than 2 points are dropped as not worth keeping).
 */
export function eraseAt(drawings: Drawing[], p: { x: number; y: number }, r: number, mode: EraserMode): Drawing[] {
  if (mode === 'stroke') {
    return drawings.filter((d) => !d.points.some(([x, y]) => Math.hypot(x - p.x, y - p.y) <= r))
  }
  const result: Drawing[] = []
  for (const d of drawings) {
    const runs: Drawing['points'][] = []
    let run: Drawing['points'] = []
    for (const pt of d.points) {
      const hit = Math.hypot(pt[0] - p.x, pt[1] - p.y) <= r
      if (hit) {
        if (run.length >= 2) runs.push(run)
        run = []
      } else {
        run.push(pt)
      }
    }
    if (run.length >= 2) runs.push(run)
    runs.forEach((points, i) => result.push({ ...d, id: i === 0 ? d.id : newId(), points }))
  }
  return result
}

export function getOrCreateWorkspaceCanvas(workspaceId: string): Promise<Canvas> {
  return invoke<Canvas>('get_or_create_workspace_canvas', { workspaceId })
}

export function listCanvases(workspaceId: string): Promise<Canvas[]> {
  return invoke<Canvas[]>('list_canvases', { workspaceId })
}

export function getCanvas(id: string): Promise<Canvas | null> {
  return invoke<Canvas | null>('get_canvas', { id })
}

export function saveCanvas(canvas: Canvas): Promise<void> {
  return invoke('save_canvas', { canvas })
}

export function renameCanvas(id: string, title: string): Promise<void> {
  return invoke('rename_canvas', { id, title })
}

export function deleteCanvas(id: string): Promise<void> {
  return invoke('delete_canvas', { id })
}

/** Stable id generator (matches the pattern used in core/workspaces.ts). */
export function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`
}
