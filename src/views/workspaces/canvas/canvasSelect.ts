// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Pure selection geometry for the canvas board — marquee (rubber-band) hit
// testing over nodes. World coordinates throughout.

import type { CanvasNode } from '../../../core/canvas'

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export function nodeRect(n: CanvasNode): Rect {
  return { x: n.x, y: n.y, w: n.width, h: n.height }
}

/** Standard axis-aligned bounding-box overlap test. */
export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

/** Ids of nodes whose box overlaps the marquee rect. */
export function nodesInMarquee(nodes: CanvasNode[], marquee: Rect): string[] {
  return nodes.filter((n) => rectsIntersect(nodeRect(n), marquee)).map((n) => n.id)
}

/** Normalize a drag from (x0,y0)→(x1,y1) into a positive-size Rect. */
export function rectFromPoints(x0: number, y0: number, x1: number, y1: number): Rect {
  return { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) }
}
