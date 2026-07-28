// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getQuizSettings, setQuizSettings } from './useQuizSettings'

describe('useQuizSettings store', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => vi.restoreAllMocks())

  it('returns defaults before anything is set', () => {
    const s = getQuizSettings()
    expect(s.count).toBe(6)
    expect(s.formats).toEqual({ mcq: true, mcma: true, descriptive: true })
    expect(s.weights).toEqual({ mcq: 1, mcma: 1, descriptive: 1 })
    expect(s.negativeMarking).toBe(true)
    expect(s.negativeFraction).toBe(0.25)
    expect(s.mcmaRule).toBe('partial')
    expect(s.feedback).toBe('end')
    expect(s.source).toBe('retrieval')
    expect(s.difficulty).toBe('mix')
    expect(s.showToolbar).toBe(true)
  })

  it('merges a partial patch and persists it', () => {
    setQuizSettings({ count: 12, difficulty: 'hard' })
    expect(getQuizSettings().count).toBe(12)
    expect(getQuizSettings().difficulty).toBe('hard')
    // untouched fields keep defaults
    expect(getQuizSettings().mcmaRule).toBe('partial')
    expect(localStorage.getItem('jnana.quiz.settings.v1')).toContain('"count":12')
  })

  it('merges nested format/weight maps without dropping keys', () => {
    setQuizSettings({ formats: { ...getQuizSettings().formats, mcma: false } })
    expect(getQuizSettings().formats).toEqual({ mcq: true, mcma: false, descriptive: true })
  })

  it('falls back to defaults when the stored JSON is corrupt', async () => {
    localStorage.setItem('jnana.quiz.settings.v1', '{ not valid json')
    vi.resetModules()
    const mod = await import('./useQuizSettings')
    expect(mod.getQuizSettings().count).toBe(6)
  })

  it('keeps the in-memory value and does not throw when persistence fails', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage unavailable')
    })
    expect(() => setQuizSettings({ negativeMarking: false })).not.toThrow()
    expect(getQuizSettings().negativeMarking).toBe(false)
  })
})
