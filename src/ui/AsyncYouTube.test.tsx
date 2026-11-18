// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// YouTube refuses embeds from pages without a regular http(s) address. On
// macOS and Linux the app is served from tauri://localhost, so the player may
// show an error there; the user needs a way to still watch the video.

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: vi.fn(async () => undefined) }))

import { openUrl } from '@tauri-apps/plugin-opener'
import { AsyncYouTube } from './AsyncYouTube'

const MAC_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)'
const WINDOWS_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edg/130.0'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('AsyncYouTube', () => {
  it('offers the video in the browser on macOS/Linux, where the embed can be refused', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(MAC_UA)
    render(<AsyncYouTube videoId="abc123" lazy={false} />)
    fireEvent.click(screen.getByRole('button', { name: /watch on youtube/i }))
    expect(openUrl).toHaveBeenCalledWith('https://www.youtube.com/watch?v=abc123')
  })

  it('leaves Windows, where embeds play, unchanged', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(WINDOWS_UA)
    render(<AsyncYouTube videoId="abc123" lazy={false} />)
    expect(screen.queryByRole('button', { name: /watch on youtube/i })).toBeNull()
  })
})
