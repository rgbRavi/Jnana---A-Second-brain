// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, it, expect, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { setSidebarPrefs } from '../../hooks/useSidebarPrefs'
import { ChatHistory } from './ChatHistory'

const updatedAt = Date.now() - 2 * 3600_000
vi.mock('../../core/chat', () => ({
  listConversations: vi.fn(() => Promise.resolve([{ id: 'c1', mode: 'chat', title: 'Bat and ball', projectId: null, updatedAt }])),
  deleteConversation: vi.fn(),
  renameConversation: vi.fn(),
}))
vi.mock('../../hooks/useVaults', () => ({ useActiveVaultId: () => 'v' }))
vi.mock('../../hooks/useChatHistory', async (orig) => ({ ...(await orig<typeof import('../../hooks/useChatHistory')>()), requestChatAction: vi.fn() }))
vi.mock('../../core/aiWorkspace', () => ({
  listProjects: vi.fn(() => Promise.resolve([{ id: 'p-here', name: 'Here', vaultId: 'v' }, { id: 'p-other', name: 'Elsewhere', vaultId: 'other' }])),
}))

describe('ChatHistory', () => {
  it('shows relative time; rename/delete/exact date live in the right-click menu', async () => {
    render(<ChatHistory mode="chat" />)
    const row = await screen.findByText('Bat and ball')
    expect(screen.getByText('2h ago')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Rename chat|Delete chat/ })).toBeNull()

    fireEvent.contextMenu(row)
    expect(screen.getByRole('menuitem', { name: 'Rename' })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toBeTruthy()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Info' }))
    const year = String(new Date(updatedAt).getFullYear())
    expect(screen.getByRole('menuitem', { name: new RegExp(`Last active .*${year}`) })).toBeTruthy()
  })
  it('auto-hide: drawer opens on hover at the edge and can be pinned back', async () => {
    const { container } = render(<ChatHistory mode="chat" />)
    fireEvent.click(await screen.findByRole('button', { name: 'Auto-hide side toolbar' }))
    const edge = container.firstElementChild as HTMLElement
    const drawer = edge.firstElementChild as HTMLElement
    expect(drawer.className).not.toMatch(/historyFloatOpen/)
    fireEvent.mouseEnter(edge)
    expect(drawer.className).toMatch(/historyFloatOpen/)
    const toggle = screen.getByRole('button', { name: 'Auto-hide side toolbar' })
    expect(toggle.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(toggle)
    expect(screen.getByRole('button', { name: 'Auto-hide side toolbar' }).getAttribute('aria-pressed')).toBe('false')
    act(() => setSidebarPrefs({ aiHistoryAutoHide: false }))
  })
  it("a chat tagged with another vault's project still shows, and a stale active project is cleared", async () => {
    const { listConversations } = await import('../../core/chat')
    vi.mocked(listConversations).mockResolvedValueOnce([
      { id: 'c2', mode: 'chat', title: 'Orphan', projectId: 'p-other', updatedAt },
      { id: 'c3', mode: 'chat', title: 'In project', projectId: 'p-here', updatedAt },
    ])
    const { setViewState, getViewState } = await import('../../hooks/useViewState')
    setViewState('ai.free.projectId', 'p-other')
    render(<ChatHistory mode="chat" />)
    expect(await screen.findByText('Orphan')).toBeTruthy()
    expect(screen.queryByText('In project')).toBeNull()
    expect(getViewState('ai.free.projectId')).toBe('')
  })
  it('shows "In <project>" while the list is project-filtered; × leaves via a new chat', async () => {
    const { setViewState } = await import('../../hooks/useViewState')
    const { requestChatAction } = await import('../../hooks/useChatHistory')
    setViewState('ai.free.projectId', 'p-here')
    render(<ChatHistory mode="chat" />)
    expect(await screen.findByText('In Here')).toBeTruthy()
    expect(screen.queryByText(/Recent chats/i)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Leave project Here' }))
    expect(requestChatAction).toHaveBeenCalledWith('chat', { type: 'new' })
    setViewState('ai.free.projectId', '')
  })
})
