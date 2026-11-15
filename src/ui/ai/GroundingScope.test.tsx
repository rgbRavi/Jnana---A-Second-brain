// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

vi.mock('../../hooks/useWorkspaces', () => ({
  useWorkspaces: () => ({ workspaces: [{ id: 'w1', name: 'Biology', icon: '' }] }),
}))
vi.mock('../../hooks/useActiveWorkspace', () => ({ getActiveWorkspaceId: () => null }))

import { GroundingScope } from './GroundingScope'

describe('GroundingScope', () => {
  it('shows the current scope and lets the user switch it', () => {
    render(<GroundingScope />)
    expect(screen.getByText('Entire vault')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Notes source/ }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: /Biology/ }))
    expect(screen.getByText('Biology')).toBeTruthy()
    const saved = JSON.parse(localStorage.getItem('jnana.ai.scope') ?? '{}')
    expect(saved).toMatchObject({ mode: 'workspace', workspaceId: 'w1' })
  })
})
