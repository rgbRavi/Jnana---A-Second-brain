// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, expect, it } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { Tooltip } from './Tooltip'

describe('Tooltip keyboard support', () => {
  it('shows on focus, Esc hides it and restores the title', async () => {
    render(<><Tooltip /><button title="Hint text">b</button></>)
    const b = screen.getByRole('button')
    await act(async () => {
      b.focus()
      await new Promise((r) => setTimeout(r, 150))
    })
    expect(screen.getByRole('tooltip').textContent).toBe('Hint text')
    expect(b.hasAttribute('title')).toBe(false)
    let notPrevented = true
    act(() => {
      notPrevented = fireEvent.keyDown(b, { key: 'Escape' })
    })
    expect(notPrevented).toBe(false)
    expect(screen.queryByRole('tooltip')).toBeNull()
    expect(b.getAttribute('title')).toBe('Hint text')
  })
})
