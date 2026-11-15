// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ProjectsView } from './ProjectsView'
import { saveProject } from '../../core/aiWorkspace'

const stored = { id: 'p1', name: 'ENI', description: '', instructions: 'Be brief.', vaultId: 'v', createdAt: 1, updatedAt: 1 }
let current = { ...stored }
vi.mock('../../core/aiWorkspace', () => ({
  listProjects: vi.fn(() => Promise.resolve([current])),
  saveProject: vi.fn((p) => { current = p; return Promise.resolve() }),
  listProjectKnowledge: vi.fn(() => Promise.resolve([])),
  deleteProject: vi.fn(),
  newProject: vi.fn(),
  addProjectKnowledge: vi.fn(),
  removeProjectKnowledge: vi.fn(),
  newKnowledge: vi.fn(),
}))
vi.mock('../../core/aiRules', () => ({ listProjectRules: vi.fn(() => Promise.resolve([])), setProjectRules: vi.fn() }))
vi.mock('../../core/chat', () => ({ listConversations: vi.fn(() => Promise.resolve([])) }))
vi.mock('../../core/ai', () => ({ pickAttachments: vi.fn() }))
vi.mock('../../ui/ai/RulesPicker', () => ({ RulesPicker: () => null }))
vi.mock('../../context/NotesContext', () => ({ useNotesContext: () => ({ notes: [] }) }))
vi.mock('../../hooks/useVaults', () => ({ useActiveVaultId: () => 'v' }))

describe('ProjectsView custom instructions', () => {
  it('shows Save only after an edit, and Save persists it', async () => {
    render(<ProjectsView />)
    fireEvent.click(await screen.findByText('ENI'))
    const box = await screen.findByPlaceholderText(/How should the assistant behave/)
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()

    fireEvent.change(box, { target: { value: 'Be brief. Cite notes.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(saveProject).toHaveBeenCalledWith(expect.objectContaining({ instructions: 'Be brief. Cite notes.' })))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Save' })).toBeNull())
  })
})

describe('ProjectsView list a11y', () => {
  it('opens a project via a real button and labels the delete button', async () => {
    render(<ProjectsView />)
    const open = await screen.findByRole('button', { name: /^ENI/ })
    expect(open.tagName).toBe('BUTTON')
    expect(screen.getByRole('button', { name: 'Delete project ENI' })).toBeTruthy()
    expect(open.contains(screen.getByRole('button', { name: 'Delete project ENI' }))).toBe(false)
    fireEvent.click(open)
    expect(await screen.findByPlaceholderText(/How should the assistant behave/)).toBeTruthy()
  })
})
