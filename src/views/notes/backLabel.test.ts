// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, it, expect } from 'vitest'
import { backLabelFor } from './backLabel'

describe('backLabelFor', () => {
  it('maps routes to names', () => {
    expect(backLabelFor('/')).toBe('Back to Home')
    expect(backLabelFor('/ai')).toBe('Back to AI')
    expect(backLabelFor('/workspaces/abc')).toBe('Back to workspace')
    expect(backLabelFor('/settings/ai')).toBe('Back to Settings')
    expect(backLabelFor('/nope')).toBe('Back to previous page')
  })
})
