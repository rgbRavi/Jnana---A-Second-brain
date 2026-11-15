// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, it, expect, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { FileExplorer } from './FileExplorer'
import { setSidebarPrefs } from '../../hooks/useSidebarPrefs'
import { eventBus } from '../../lib/eventBus'

vi.mock('../../hooks/useVaults', () => ({
  useVaults: () => ({ vaults: [{ id: 'v', name: 'Vault' }], refresh: vi.fn() }),
  useActiveVaultId: () => 'v',
  setActiveVaultId: vi.fn(),
}))
vi.mock('./FolderTree', () => ({ FolderTree: () => null, requestReveal: vi.fn() }))

describe('FileExplorer auto-hide', () => {
  it('toggles on, reveals on hover, toggles back off with the same button', () => {
    const { container } = render(<FileExplorer />)
    fireEvent.click(screen.getByRole('button', { name: 'Auto-hide file explorer' }))
    const edge = container.firstElementChild as HTMLElement
    const float = edge.firstElementChild as HTMLElement
    expect(float.className).not.toMatch(/floatOpen/)
    expect(screen.queryByRole('button', { name: 'Hide file explorer' })).toBeNull()
    fireEvent.mouseEnter(edge)
    expect(float.className).toMatch(/floatOpen/)
    const toggle = screen.getByRole('button', { name: 'Auto-hide file explorer' })
    expect(toggle.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(toggle)
    expect(screen.getByRole('button', { name: 'Hide file explorer' })).toBeTruthy()
    act(() => setSidebarPrefs({ explorerAutoHide: false }))
  })
  it('"Reveal in file explorer" pops the auto-hidden explorer open for a moment', () => {
    vi.useFakeTimers()
    act(() => setSidebarPrefs({ explorerAutoHide: true }))
    const { container } = render(<FileExplorer />)
    const float = container.firstElementChild!.firstElementChild as HTMLElement
    expect(float.className).not.toMatch(/floatOpen/)
    act(() => eventBus.emit('explorer:reveal', { noteId: 'n1' }))
    expect(float.className).toMatch(/floatOpen/)
    act(() => vi.advanceTimersByTime(3000))
    expect(float.className).not.toMatch(/floatOpen/)
    vi.useRealTimers()
    act(() => setSidebarPrefs({ explorerAutoHide: false }))
  })
})
