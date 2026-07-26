// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, expect, it } from 'vitest'
import { formatDate, formatDateTime } from './dateFormat'

// 2026-03-09 (a fixed UTC noon so no TZ rollover on the date part)
const MS = Date.UTC(2026, 2, 9, 12, 0, 0)

describe('formatDate', () => {
  it('iso is YYYY-MM-DD', () => {
    expect(formatDate(MS, 'iso')).toBe('2026-03-09')
  })
  it('us is M/D/YYYY', () => {
    expect(formatDate(MS, 'us')).toBe('3/9/2026')
  })
  it('eu is D/M/YYYY', () => {
    expect(formatDate(MS, 'eu')).toBe('9/3/2026')
  })
  it('locale defers to the runtime toLocaleDateString', () => {
    expect(formatDate(MS, 'locale')).toBe(new Date(MS).toLocaleDateString())
  })
})

describe('formatDateTime', () => {
  it('appends the local time to the formatted date', () => {
    const expected = `${formatDate(MS, 'iso')} ${new Date(MS).toLocaleTimeString()}`
    expect(formatDateTime(MS, 'iso')).toBe(expected)
  })
})
