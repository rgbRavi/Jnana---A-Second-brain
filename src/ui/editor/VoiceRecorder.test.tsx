// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Some WebViews expose no microphone API at all (WebKitGTK ships with it off).
// Pressing record there must say so plainly, not surface a raw TypeError.

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'

vi.mock('../../lib/toast', () => ({ toast: { error: vi.fn() } }))

import { toast } from '../../lib/toast'
import { VoiceRecorder } from './VoiceRecorder'

afterEach(() => cleanup())

describe('VoiceRecorder', () => {
  it('explains when this system has no microphone support', async () => {
    // jsdom, like WebKitGTK without media streams, has no navigator.mediaDevices.
    render(<VoiceRecorder onRecorded={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Record audio' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalled())
    const msg = vi.mocked(toast.error).mock.calls[0][0] as string
    expect(msg).toMatch(/isn't available/i)
    expect(msg).not.toMatch(/TypeError/)
  })
})
