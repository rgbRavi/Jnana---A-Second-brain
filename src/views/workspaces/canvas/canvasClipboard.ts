// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Pure copy/duplicate of a canvas sub-graph: extract the selected nodes plus the
// edges wholly between them, then clone with fresh ids + remapped endpoints + an
// offset. Used by the board's internal Ctrl+C / Ctrl+V / Ctrl+D clipboard.

import { newId, type CanvasDoc, type CanvasEdge, type CanvasNode } from '../../../core/canvas'

export interface CanvasFragment {
  nodes: CanvasNode[]
  edges: CanvasEdge[]
}

/** Nodes with ids in `ids`, plus only the edges whose BOTH endpoints are in `ids`. */
export function extractFragment(doc: CanvasDoc, ids: Set<string>): CanvasFragment {
  return {
    nodes: doc.nodes.filter((n) => ids.has(n.id)),
    edges: doc.edges.filter((e) => ids.has(e.fromNode) && ids.has(e.toNode)),
  }
}

/** Clone a fragment: new node + edge ids, edge endpoints remapped, positions offset. */
export function cloneFragment(frag: CanvasFragment, dx: number, dy: number): CanvasFragment {
  const idMap = new Map<string, string>()
  const nodes = frag.nodes.map((n) => {
    const id = newId()
    idMap.set(n.id, id)
    return { ...n, id, x: n.x + dx, y: n.y + dy }
  })
  const edges = frag.edges.map((e) => ({
    ...e,
    id: newId(),
    fromNode: idMap.get(e.fromNode)!,
    toNode: idMap.get(e.toNode)!,
    // A cloned edge is a fresh canvas-only connection, never a live graph link.
    linkedInGraph: undefined,
  }))
  return { nodes, edges }
}
