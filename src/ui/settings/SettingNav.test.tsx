// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { SettingTabs } from './SettingNav'

function Tabs() {
  const [v, setV] = useState<'a' | 'b' | 'c'>('a')
  return (
    <SettingTabs
      items={[{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }]}
      value={v}
      onChange={setV}
      ariaLabel="Sections"
      idPrefix="t"
      panelId="t-panel"
    />
  )
}

describe('SettingTabs', () => {
  it('roves selection and focus with arrow/Home/End keys', () => {
    render(<Tabs />)
    const a = screen.getByRole('tab', { name: 'A' })
    a.focus()
    fireEvent.keyDown(a, { key: 'ArrowLeft' }) // wraps to the end
    const c = screen.getByRole('tab', { name: 'C' })
    expect(c).toHaveAttribute('aria-selected', 'true')
    expect(document.activeElement).toBe(c)
    fireEvent.keyDown(c, { key: 'Home' })
    expect(document.activeElement).toBe(a)
    expect(a).toHaveAttribute('tabindex', '0')
    expect(c).toHaveAttribute('tabindex', '-1')
  })
})
