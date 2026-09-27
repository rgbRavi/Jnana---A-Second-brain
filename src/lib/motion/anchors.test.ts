// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Anchors are the public contract motion plugins target. The source scan is the
// tripwire: delete or rename an anchor in JSX and this fails before a published
// plugin silently stops working.

import { describe, it, expect, afterEach } from 'vitest'
// @ts-expect-error Node.js types not available in this project
import { readFileSync, readdirSync, statSync } from 'node:fs'
// @ts-expect-error Node.js types not available in this project
import { join, dirname } from 'node:path'
// @ts-expect-error Node.js types not available in this project
import { fileURLToPath } from 'node:url'
import { MOTION_ANCHORS, anchorSelector, findAnchor, findAnchors } from './anchors'

const srcRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

function tsxSources(dir: string): string[] {
  return readdirSync(dir).flatMap((name: string) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return tsxSources(path)
    return path.endsWith('.tsx') && !path.endsWith('.test.tsx') ? [readFileSync(path, 'utf8')] : []
  })
}

describe('motion anchors', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('every published anchor is still rendered somewhere', () => {
    const all = tsxSources(srcRoot).join('\n')
    for (const name of Object.keys(MOTION_ANCHORS)) {
      expect(all, `data-anchor="${name}" missing from src/`).toContain(`data-anchor="${name}"`)
    }
  })

  it('refuses names that could break out of the selector', () => {
    expect(anchorSelector('note"],body')).toBeNull()
    expect(anchorSelector('note', 'x"]')).toBeNull()
    expect(anchorSelector('sidebar.notes')).toBe('[data-anchor="sidebar.notes"]')
    expect(anchorSelector('note', 'a1-b2')).toBe('[data-anchor="note"][data-anchor-key="a1-b2"]')
  })

  it('finds by name and key, null when absent', () => {
    document.body.innerHTML =
      '<div data-anchor="note" data-anchor-key="n1"></div><div data-anchor="note" data-anchor-key="n2"></div>'
    expect(findAnchor('note', 'n2')?.getAttribute('data-anchor-key')).toBe('n2')
    expect(findAnchors('note')).toHaveLength(2)
    expect(findAnchor('trash')).toBeNull()
    expect(findAnchor('bad name!')).toBeNull()
  })
})
