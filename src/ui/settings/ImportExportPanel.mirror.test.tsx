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
  MirrorReadError: class extends Error {},
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

  it('mirrors saves made during a long first copy (the folder is live before it finishes)', async () => {
    vi.mocked(showConfirmDialog).mockResolvedValue(true)
    let dirDuringCopy: string | null = null
    vi.mocked(mirrorAll).mockImplementationOnce(async () => {
      dirDuringCopy = getGeneralSettings().mirrorDir
    })
    render(<ImportExportPanel />)
    fireEvent.click(screen.getByRole('button', { name: 'Mirror to folder…' }))
    await waitFor(() => expect(mirrorAll).toHaveBeenCalled())
    expect(dirDuringCopy).toBe('D:/vault')
  })

  it('turns mirroring back off if the first copy fails', async () => {
    vi.mocked(showConfirmDialog).mockResolvedValue(true)
    vi.mocked(mirrorAll).mockRejectedValueOnce('Not a directory: D:/vault')
    render(<ImportExportPanel />)
    fireEvent.click(screen.getByRole('button', { name: 'Mirror to folder…' }))
    await waitFor(() => expect(mirrorAll).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByRole('button', { name: 'Mirror to folder…' })).toBeTruthy())
    expect(getGeneralSettings().mirrorDir).toBeNull()
  })

  it('mirrors after the user confirms', async () => {
    vi.mocked(showConfirmDialog).mockResolvedValue(true)
    render(<ImportExportPanel />)
    fireEvent.click(screen.getByRole('button', { name: 'Mirror to folder…' }))
    await waitFor(() => expect(getGeneralSettings().mirrorDir).toBe('D:/vault'))
    // A loader, not a snapshot: notes are read when the queued job runs.
    expect(mirrorAll).toHaveBeenCalledWith('D:/vault', expect.any(Function))
  })
})
