import { describe, it, expect, vi, beforeEach } from 'vitest'

const invokeMock = vi.fn()
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...args: unknown[]) => invokeMock(...args) }))

import { getMediaLayout, setMediaLayout, mediaLayoutStyle } from './mediaLayout'

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
    expect(mediaLayoutStyle({ width: 240 })).toEqual({ width: 240, display: 'inline-block', verticalAlign: 'top' })
  })

  it('forces block + margin positioning once an alignment is set', () => {
    expect(mediaLayoutStyle({ width: 240, alignment: 'right' })).toEqual({
      width: 240,
      display: 'block',
      marginLeft: 'auto',
    })
    expect(mediaLayoutStyle({ alignment: 'center' })).toEqual({
      display: 'block',
      marginLeft: 'auto',
      marginRight: 'auto',
    })
    expect(mediaLayoutStyle({ alignment: 'left' })).toEqual({ display: 'block', marginRight: 'auto' })
  })
})
