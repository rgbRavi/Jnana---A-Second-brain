// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, it, expect, afterEach, vi } from 'vitest'
import { registerPluginAction, unregisterPluginActions } from '../lib/pluginActions'
import { pluginNoteMenuItems } from './pluginNoteMenu'

describe('plugin note-menu items', () => {
  afterEach(() => unregisterPluginActions('p.one'))

  it('is empty with no plugin items', () => {
    expect(pluginNoteMenuItems('n1')).toEqual([])
  })

  it('labels each item with its glyph, separates the group, runs with the note', () => {
    const run = vi.fn()
    registerPluginAction('p.one', 'One', { id: 'a', slot: 'note.menu', label: 'Word count', icon: '🔢', run })
    registerPluginAction('p.one', 'One', { id: 'b', slot: 'note.menu', label: 'Summarise', run: vi.fn() })
    const items = pluginNoteMenuItems('n1')
    expect(items.map((i) => i.label)).toEqual(['🔢 Word count', '🔌 Summarise'])
    expect(items[0].separator).toBe(true)
    expect(items[1].separator).toBeFalsy()
    items[0].onClick?.()
    expect(run).toHaveBeenCalledWith({ noteId: 'n1' })
  })
})
