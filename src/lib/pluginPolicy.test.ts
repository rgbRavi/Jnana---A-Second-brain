// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// "Sandboxed plugins only": the posture where the worker runtime stops being a
// preference and starts being a requirement.

import { describe, it, expect, afterEach } from 'vitest'
import { isSandboxOnly, setSandboxOnly, policyRefusal } from './pluginPolicy'

const worker = { name: 'Sandboxed One', runtime: 'worker' }
const main = { name: 'Main Thread One', runtime: 'main' }

describe('plugin policy', () => {
  afterEach(() => setSandboxOnly(false))

  it('allows both runtimes by default', () => {
    expect(isSandboxOnly()).toBe(false)
    expect(policyRefusal(worker)).toBeNull()
    expect(policyRefusal(main)).toBeNull()
  })

  it('refuses main-thread plugins, by name, once the policy is on', () => {
    setSandboxOnly(true)
    expect(policyRefusal(worker)).toBeNull()
    // The refusal is shown to the user, so it names the plugin and the reason.
    expect(policyRefusal(main)).toMatch(/Main Thread One.*only allows sandboxed/)
  })

  it('persists the choice', () => {
    setSandboxOnly(true)
    expect(localStorage.getItem('jnana.plugins.sandboxOnly.v1')).toBe('true')
    setSandboxOnly(false)
    expect(localStorage.getItem('jnana.plugins.sandboxOnly.v1')).toBe('false')
  })
})
