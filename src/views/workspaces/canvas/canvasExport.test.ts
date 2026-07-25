// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, it, expect } from 'vitest'
import { computeExportBounds } from './canvasExport'

describe('computeExportBounds', () => {
  it('wraps all nodes with padding', () => {
    const doc = {
      nodes: [
        { id: 'a', type: 'text' as const, x: 0, y: 0, width: 100, height: 50 },
        { id: 'b', type: 'text' as const, x: 200, y: 100, width: 100, height: 50 },
      ],
      edges: [],
      drawings: [],
    }
    expect(computeExportBounds(doc, 10)).toEqual({ x: -10, y: -10, w: 320, h: 170 })
  })
  it('empty doc → zero rect, no throw', () => {
    expect(() => computeExportBounds({ nodes: [], edges: [], drawings: [] }, 10)).not.toThrow()
    expect(computeExportBounds({ nodes: [], edges: [], drawings: [] }, 10)).toEqual({ x: 0, y: 0, w: 0, h: 0 })
  })
})
