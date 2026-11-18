// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, it, expect, vi, beforeEach } from 'vitest'

beforeEach(() => vi.resetModules())

async function loadWith(raw: string) {
  localStorage.setItem('jnana.ai.connectionStatus', raw)
  return import('./connectionStatus')
}

describe('connectionStatus storage guard', () => {
  it.each(['null', '5', '[1]', '{"chat":5}', '{"chat":{"ok":"y","at":1,"signature":"s"}}', 'not json'])('survives %s', async (raw) => {
    const m = await loadWith(raw)
    expect(() => m.recordConnectionTest('chat', true, 's')).not.toThrow()
  })
  it('keeps a well-formed record', async () => {
    const m = await loadWith('{"chat":{"ok":true,"at":5,"signature":"s"}}')
    m.recordConnectionTest('embedding', false, 'e')
    expect(JSON.parse(localStorage.getItem('jnana.ai.connectionStatus')!).chat.at).toBe(5)
  })
})
