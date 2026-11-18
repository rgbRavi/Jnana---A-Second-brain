// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('../../core/ai/web', () => ({ openWebPage: vi.fn() }))

import { openWebPage } from '../../core/ai/web'
import { WebReplyFooter } from './WebReplyFooter'

const sources = [{ n: 1, url: 'https://example.com/a', title: 'Alpha', keywords: [] }]

describe('WebReplyFooter', () => {
  beforeEach(() => vi.clearAllMocks())

  it('lists sources and opens a page on click', () => {
    render(<WebReplyFooter sources={sources} />)
    const btn = screen.getByRole('button', { name: /1\. Alpha — example\.com/ })
    expect(btn.getAttribute('title')).toBe('Alpha')
    fireEvent.click(btn)
    expect(openWebPage).toHaveBeenCalledWith('https://example.com/a')
  })

  it('marks unverified citations', () => {
    render(<WebReplyFooter sources={sources} citations={[
      { marker: 2, page: 1, quote: 'bad', verified: false },
      { marker: 1, page: 1, quote: 'good', verified: true },
    ]} />)
    expect(screen.getByText('unverified')).toBeTruthy()
    expect(screen.getByText('checked')).toBeTruthy()
    const items = screen.getAllByRole('listitem')
    expect(items[0].textContent).toContain('[1]')
    fireEvent.click(screen.getByRole('button', { name: 'page 1' }))
    expect(openWebPage).toHaveBeenCalledTimes(1)
  })

  it('a missing citation (page 0) reads "no source given", unverified', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { container } = render(<WebReplyFooter sources={sources} citations={[
      { marker: 2, page: 0, quote: '', verified: false },
      { marker: 2, page: 1, quote: 'dup marker', verified: true },
    ]} />)
    const items = [...container.querySelectorAll('li')].map((li) => li.textContent)
    expect(items[0]).toBe('[2] no source given unverified')
    expect(items[0]).not.toContain('page 0')
    expect(errors.mock.calls.some((c) => String(c[0]).includes('same key'))).toBe(false)
    errors.mockRestore()
  })

  it('renders the tools-unsupported switch and calls back', () => {
    const cb = vi.fn()
    render(<WebReplyFooter notice={{ kind: 'tools-unsupported', text: 'No tools.' }} onSwitchToAlways={cb} />)
    expect(screen.getByText('No tools.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Switch to Always search' }))
    expect(cb).toHaveBeenCalled()
  })

  it('renders nothing when all props are empty', () => {
    const { container } = render(<WebReplyFooter sources={[]} citations={[]} />)
    expect(container.firstChild).toBeNull()
  })
})
