// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))

import { PanelBoundary } from '../../ui/settings/PanelBoundary'

function Boom(): never {
  throw new Error('kaboom')
}

describe('PanelBoundary', () => {
  it('shows a fallback instead of throwing, and siblings survive', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <div>
        <nav>nav still here</nav>
        <PanelBoundary>
          <Boom />
        </PanelBoundary>
      </div>,
    )
    expect(screen.getByText('nav still here')).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toContain('This section ran into a problem.')
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
  })
})
