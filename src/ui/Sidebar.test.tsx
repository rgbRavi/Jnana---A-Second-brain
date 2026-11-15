// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, it, expect, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { setSidebarPrefs } from '../hooks/useSidebarPrefs'

vi.mock('../context/TranscriptionContext', () => ({ useTranscription: () => ({ jobs: [] }) }))
vi.mock('../hooks/useWorkspaces', () => ({ useWorkspaces: () => ({ allWorkspaces: [] }) }))
vi.mock('../hooks/usePluginActions', () => ({ usePluginActions: () => [] }))
vi.mock('./editor/NoteCreator', () => ({ openComposer: vi.fn() }))

describe('Sidebar auto-hide', () => {
  it('rests as the icon rail, expands on hover, and the same button turns it off', () => {
    act(() => setSidebarPrefs({ collapsed: false, autoHide: false }))
    const { container } = render(<MemoryRouter><Sidebar /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: 'Auto-hide sidebar' }))
    const slot = container.firstElementChild as HTMLElement
    const aside = () => container.querySelector('aside')!
    expect(aside().className).toMatch(/collapsed/)
    expect(screen.queryByRole('button', { name: /Expand sidebar|Collapse sidebar/ })).toBeNull()
    fireEvent.mouseEnter(slot)
    expect(aside().className).not.toMatch(/collapsed/)
    fireEvent.click(screen.getByRole('button', { name: 'Auto-hide sidebar' }))
    expect(screen.getByRole('button', { name: 'Collapse sidebar' })).toBeTruthy()
    act(() => setSidebarPrefs({ collapsed: false, autoHide: false }))
  })
})
