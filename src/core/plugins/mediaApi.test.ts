// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// The `media` permission's boundaries: the active vault for listing, and the size
// ceiling for writing. Reading is Rust's job to bound (it stats before it reads),
// so what matters here is that the call carries the plugin's own id — the grant is
// checked against that, so a plugin must not be able to name another.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Note } from '../../types'

const notes: Note[] = [
  {
    id: 'w1',
    title: 'Lecture',
    content: 'Notes\n\n![](jnana-asset://slide.png)\n![pdf](jnana-asset://paper.pdf)',
    tags: [],
    createdAt: 1,
    updatedAt: 1,
    vaultId: 'work',
  },
  {
    id: 'p1',
    title: 'Private',
    content: '![](jnana-asset://scan.jpg)',
    tags: [],
    createdAt: 2,
    updatedAt: 2,
    vaultId: 'personal',
  },
]

const invoked = vi.fn(async (_cmd: string, _args: unknown) => btoa('hello'))
const uploaded = vi.fn(async (_bytes: Uint8Array, _ext: string) => 'stored.png')

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (cmd: string, args: unknown) => invoked(cmd, args),
  convertFileSrc: (p: string) => p,
}))

vi.mock('../notes', () => ({
  getNote: async (id: string) => {
    const found = notes.find((n) => n.id === id)
    if (!found) throw new Error('no such note')
    return found
  },
  uploadAsset: (bytes: Uint8Array, ext: string) => uploaded(bytes, ext),
}))

import { makePluginMediaApi } from './mediaApi'
import { setActiveVaultId } from '../../lib/activeVault'

describe('plugin media API', () => {
  beforeEach(() => {
    setActiveVaultId('work')
    invoked.mockClear()
    uploaded.mockClear()
  })

  it('lists the attachments a note in the active vault embeds', async () => {
    const media = makePluginMediaApi('com.test.plugin')
    const found = await media.list('w1')
    expect(found.map((m) => m.target)).toEqual(['slide.png', 'paper.pdf'])
    expect(found[1].kind).toBe('pdf')
  })

  it('refuses a note in another vault, the same way ctx.notes does', async () => {
    const media = makePluginMediaApi('com.test.plugin')
    await expect(media.list('p1')).rejects.toThrow(/not in the active vault/)
  })

  it('reads bytes through Rust, naming the calling plugin', async () => {
    const media = makePluginMediaApi('com.test.plugin')
    const bytes = await media.read('slide.png')

    expect(invoked).toHaveBeenCalledWith('plugin_read_asset', {
      pluginId: 'com.test.plugin',
      filename: 'slide.png',
    })
    expect(new TextDecoder().decode(bytes)).toBe('hello')
  })

  it('writes an asset and refuses one over the ceiling', async () => {
    const media = makePluginMediaApi('com.test.plugin')
    expect(await media.write(new Uint8Array([1, 2, 3]), 'png')).toBe('stored.png')

    await expect(media.write(new Uint8Array(26 * 1024 * 1024), 'mp4')).rejects.toThrow(/capped/)
    expect(uploaded).toHaveBeenCalledTimes(1)
  })
})
