// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, it, expect, vi, beforeEach } from 'vitest'

const invokeMock = vi.fn()
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...args: unknown[]) => invokeMock(...args) }))

import { getMediaLayout, setMediaLayout, mediaLayoutStyle, alignmentTextAlign } from './mediaLayout'

describe('core/mediaLayout', () => {
  beforeEach(() => {
    invokeMock.mockReset()
  })

  it('setMediaLayout sends the layout as a JSON string', async () => {
    invokeMock.mockResolvedValueOnce(undefined)
    await setMediaLayout('note1', 'jnana-asset://a.png#0', { width: 320, alignment: 'center' })
    expect(invokeMock).toHaveBeenCalledWith('set_media_layout', {
      noteId: 'note1',
      mediaKey: 'jnana-asset://a.png#0',
      json: JSON.stringify({ width: 320, alignment: 'center' }),
    })
  })

  it('getMediaLayout parses rows into a Map keyed by media_key', async () => {
    invokeMock.mockResolvedValueOnce([
      { mediaKey: 'jnana-asset://a.png#0', json: JSON.stringify({ width: 200 }) },
      { mediaKey: 'jnana-asset://a.png#1', json: JSON.stringify({ alignment: 'right' }) },
    ])
    const map = await getMediaLayout('note1')
    expect(map.get('jnana-asset://a.png#0')).toEqual({ width: 200 })
    expect(map.get('jnana-asset://a.png#1')).toEqual({ alignment: 'right' })
  })

  it('getMediaLayout skips a corrupt row rather than throwing', async () => {
    invokeMock.mockResolvedValueOnce([{ mediaKey: 'bad', json: '{not json' }])
    const map = await getMediaLayout('note1')
    expect(map.size).toBe(0)
  })
})

describe('mediaLayoutStyle', () => {
  it('returns undefined when there is no saved layout', () => {
    expect(mediaLayoutStyle(undefined)).toBeUndefined()
  })

  it('sizes as inline-block when only a width is set, so embeds can share a row', () => {
    expect(mediaLayoutStyle({ width: 240 })).toEqual({ width: 240, display: 'inline-block', verticalAlign: 'top', maxWidth: '100%' })
  })

  it('stays inline-block when aligned (alignment is applied to the container, not the embed)', () => {
    // Alignment must NOT force display:block — that's what used to break a
    // side-by-side row. It's applied as the container's text-align instead.
    expect(mediaLayoutStyle({ width: 240, alignment: 'right' })).toEqual({
      width: 240,
      display: 'inline-block',
      verticalAlign: 'top',
      maxWidth: '100%',
    })
    expect(mediaLayoutStyle({ alignment: 'center' })).toEqual({
      display: 'inline-block',
      verticalAlign: 'top',
      maxWidth: '100%',
    })
  })
})

describe('alignmentTextAlign', () => {
  it('maps a saved alignment to the container text-align value', () => {
    expect(alignmentTextAlign('left')).toBe('left')
    expect(alignmentTextAlign('center')).toBe('center')
    expect(alignmentTextAlign('right')).toBe('right')
    expect(alignmentTextAlign(undefined)).toBeUndefined()
  })
})
