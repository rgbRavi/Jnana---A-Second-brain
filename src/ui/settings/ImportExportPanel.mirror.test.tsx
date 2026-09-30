// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Turning the mirror on writes into a folder the user may already keep files
// in (an Obsidian vault, Documents). Same-named .md files get overwritten, so
// the user must confirm before anything is written.

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(() => Promise.resolve(null)) }))
vi.mock('../../context/NotesContext', () => ({ useNotesContext: () => ({ notes: [] }) }))
vi.mock('../../core/mirror', () => ({
  pickMirrorFolder: vi.fn(async () => 'D:/vault'),
  mirrorAll: vi.fn(async () => undefined),
}))
vi.mock('../../lib/dialog', () => ({ showConfirmDialog: vi.fn() }))

import { ImportExportPanel } from './ImportExportPanel'
import { mirrorAll } from '../../core/mirror'
import { showConfirmDialog } from '../../lib/dialog'
import { getGeneralSettings, setGeneralSettings } from '../../hooks/useGeneralSettings'

afterEach(() => {
  cleanup()
  setGeneralSettings({ mirrorDir: null })
})

describe('ImportExportPanel mirror', () => {
  it('writes nothing when the overwrite warning is cancelled', async () => {
    vi.mocked(showConfirmDialog).mockResolvedValue(false)
    render(<ImportExportPanel />)
    fireEvent.click(screen.getByRole('button', { name: 'Mirror to folder…' }))
    await waitFor(() => expect(showConfirmDialog).toHaveBeenCalled())
    expect(mirrorAll).not.toHaveBeenCalled()
    expect(getGeneralSettings().mirrorDir).toBeNull()
  })

  it('mirrors after the user confirms', async () => {
    vi.mocked(showConfirmDialog).mockResolvedValue(true)
    render(<ImportExportPanel />)
    fireEvent.click(screen.getByRole('button', { name: 'Mirror to folder…' }))
    await waitFor(() => expect(getGeneralSettings().mirrorDir).toBe('D:/vault'))
    expect(mirrorAll).toHaveBeenCalledWith('D:/vault', null)
  })
})
