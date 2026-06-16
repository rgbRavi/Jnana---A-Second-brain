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

export interface CanvasDoc {
  nodes: CanvasNode[]
  edges: CanvasEdge[]
  drawings: Drawing[]
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
    }
  } catch {
    return { ...EMPTY_DOC }
  }
}

export function serializeDoc(doc: CanvasDoc): string {
  return JSON.stringify(doc)
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
