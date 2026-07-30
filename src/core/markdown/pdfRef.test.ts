// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, it, expect } from 'vitest'
import { buildDocRefToken, parseDocRefToken, nthPdfFilename } from './pdfRef'

describe('pdfRef', () => {
  it('build → parse round-trips', () => {
    const t = buildDocRefToken(0, 4, 0.4237, 0.6811)
    expect(t).toBe('[D0::p4@0.4237,0.6811]')
    expect(parseDocRefToken(t)).toEqual({ index: 0, page: 4, x: 0.4237, y: 0.6811 })
  })
  it('parse rejects junk', () => {
    expect(parseDocRefToken('[D0::p4]')).toBeNull()
  })
  it('nthPdfFilename 0-based, null out of range', () => {
    const c = 'a ![pdf](jnana-asset://one.pdf) b ![pdf](jnana-asset://two.pdf)'
    expect(nthPdfFilename(c, 0)).toBe('one.pdf')
    expect(nthPdfFilename(c, 1)).toBe('two.pdf')
    expect(nthPdfFilename(c, 2)).toBeNull()
  })
})
