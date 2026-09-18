// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, it, expect, beforeAll } from 'vitest'
import { outgoingLinks, backlinks } from './noteLinks'
import { registerNoteType } from './noteTypes'
import { canvasToLinkText } from '../plugins/canvas/canvasNote'
import { serializeDoc } from '../core/canvas'
import type { Note } from '../types'

const note = (id: string, title: string, content = '', over: Partial<Note> = {}): Note => ({
  id, title, content, tags: [], createdAt: 0, updatedAt: 0, ...over,
})

describe('noteLinks', () => {
  // Just the canvas link projection — the full plugin pulls in pdf.js.
  beforeAll(() =>
    registerNoteType({
      id: 'canvas',
      label: 'Canvas',
      View: () => null,
      Editor: () => null,
      toLinkText: (n, titleOf) => canvasToLinkText(n.content, titleOf),
    }),
  )

  const alpha = note('a', 'Alpha', 'links [[Beta]], [[beta]] again, [[Nowhere]] and [[Alpha]]')
  const beta = note('b', 'Beta', 'back to [[alpha]]')
  const canvas = note(
    'c',
    'Board',
    serializeDoc({
      nodes: [{ id: 'card', type: 'note', x: 0, y: 0, width: 1, height: 1, noteId: 'a' }],
      edges: [],
      drawings: [],
    }),
    { kind: 'canvas' },
  )
  const elsewhere = note('d', 'Other vault', '[[Alpha]]', { vaultId: 'v2' })
  const all = [alpha, beta, canvas, elsewhere]

  it('outgoing links dedupe, resolve, keep unresolved, drop self-links', () => {
    const out = outgoingLinks(alpha, all)
    expect(out.map((l) => [l.title, l.note?.id])).toEqual([
      ['Beta', 'b'],
      ['Nowhere', undefined],
    ])
  })

  it('backlinks include canvas note cards and stay in the vault', () => {
    expect(backlinks(alpha, all).map((n) => n.id)).toEqual(['b', 'c'])
  })

  it('a canvas has outgoing links to its placed cards', () => {
    expect(outgoingLinks(canvas, all).map((l) => l.note?.id)).toEqual(['a'])
  })
})
