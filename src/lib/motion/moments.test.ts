// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, it, expect, afterEach } from 'vitest'
import {
  pickOwner,
  isUnresolvedConflict,
  setMomentOwner,
  getMomentOwner,
  __resetMomentsForTests,
} from './moments'

const builtin = { pluginId: 'jnana.motion', builtin: true }
const zeta = { pluginId: 'com.zeta', builtin: false }
const alpha = { pluginId: 'com.alpha', builtin: false }

describe('motion moments', () => {
  afterEach(() => __resetMomentsForTests())

  it('third-party beats built-in, then plugin-id order (stable, not load order)', () => {
    expect(pickOwner([builtin], undefined)).toBe('jnana.motion')
    expect(pickOwner([builtin, zeta], undefined)).toBe('com.zeta')
    expect(pickOwner([zeta, builtin, alpha], undefined)).toBe('com.alpha')
    expect(pickOwner([], undefined)).toBeNull()
  })

  it("the user's pick wins, 'none' silences, a pick for an absent plugin falls back", () => {
    expect(pickOwner([builtin, zeta], 'jnana.motion')).toBe('jnana.motion')
    expect(pickOwner([builtin, zeta], 'none')).toBeNull()
    expect(pickOwner([builtin, zeta], 'com.uninstalled')).toBe('com.zeta')
  })

  it('only two+ third-party claimants without a pick count as a conflict', () => {
    expect(isUnresolvedConflict([builtin, zeta], undefined)).toBe(false)
    expect(isUnresolvedConflict([zeta, alpha], undefined)).toBe(true)
    expect(isUnresolvedConflict([zeta, alpha], 'com.zeta')).toBe(false)
    expect(isUnresolvedConflict([zeta, alpha], 'none')).toBe(false)
  })

  it('persists picks, and can go back to automatic', () => {
    setMomentOwner('note:trashing', 'com.zeta')
    expect(getMomentOwner('note:trashing')).toBe('com.zeta')
    expect(JSON.parse(localStorage.getItem('jnana.motion.owners.v1')!)).toEqual({ 'note:trashing': 'com.zeta' })
    setMomentOwner('note:trashing', undefined)
    expect(getMomentOwner('note:trashing')).toBeUndefined()
  })
})
