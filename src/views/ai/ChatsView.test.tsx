// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ChatsView } from './ChatsView'
import { getViewState, setViewState } from '../../hooks/useViewState'
import { requestChatAction, deleteChats } from '../../hooks/useChatHistory'

const now = Date.now()
const A = { id: 'a', mode: 'chat', title: 'Bat and ball puzzle', projectId: null, updatedAt: now - 60_000 }
const B = { id: 'b', mode: 'chat', title: 'Guess which app', projectId: 'p1', updatedAt: now }
vi.mock('../../core/chat', () => ({ listConversations: vi.fn(() => Promise.resolve([A, B])) }))
vi.mock('../../hooks/useVaults', () => ({ useActiveVaultId: () => 'v' }))
vi.mock('../../hooks/useProjects', () => ({ useProjects: () => ({ projects: [{ id: 'p1', name: 'ENI' }] }) }))
vi.mock('../../hooks/useChatHistory', () => ({ requestChatAction: vi.fn(), deleteChats: vi.fn(), renameChat: vi.fn() }))

const rowTitles = () => screen.getAllByRole('button').map((b) => b.title).filter((t) => t && !t.startsWith('Back'))

describe('ChatsView', () => {
  beforeEach(() => { vi.clearAllMocks(); setViewState('ai.mode', 'chats') })

  it('lists newest first with project, filters by title, and opens a chat', async () => {
    render(<ChatsView />)
    await screen.findByText('Guess which app')
    expect(rowTitles()).toEqual(['Guess which app', 'Bat and ball puzzle'])
    expect(screen.getByText(/· ENI/)).toBeTruthy()

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search chats' }), { target: { value: 'BALL' } })
    expect(rowTitles()).toEqual(['Bat and ball puzzle'])
    expect(screen.getByText('1 of 2 chats')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Bat and ball/ }))
    expect(requestChatAction).toHaveBeenCalledWith('chat', { type: 'load', id: 'a' })
    expect(getViewState('ai.mode')).toBe('chat')
  })

  it('back button returns to the chat', async () => {
    render(<ChatsView />)
    fireEvent.click(await screen.findByRole('button', { name: 'Back to chat' }))
    expect(getViewState('ai.mode')).toBe('chat')
  })

  it('select all → bulk delete; right-click offers rename and delete', async () => {
    render(<ChatsView />)
    await screen.findByText('Guess which app')
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all chats' }))
    expect(screen.getByText('2 selected')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Delete 2/ }))
    expect(deleteChats).toHaveBeenCalledWith('chat', expect.arrayContaining([expect.objectContaining({ id: 'a' }), expect.objectContaining({ id: 'b' })]))

    fireEvent.contextMenu(screen.getByText('Bat and ball puzzle'))
    expect(screen.getByRole('menuitem', { name: 'Rename' })).toBeTruthy()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete 2 selected' }))
    expect(deleteChats).toHaveBeenCalledTimes(2)

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    fireEvent.contextMenu(screen.getByText('Bat and ball puzzle'))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))
    expect(deleteChats).toHaveBeenLastCalledWith('chat', [A])
  })
})
