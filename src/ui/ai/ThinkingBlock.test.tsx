// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, it, expect } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ThinkingBlock } from './ThinkingBlock'

describe('ThinkingBlock', () => {
  it('renders nothing when there is no reasoning', () => {
    const { container } = render(<ThinkingBlock reasoning="" live={false} />)
    expect(container.firstChild).toBeNull()
  })

  it('shows the reasoning live while the model is still thinking', () => {
    render(<ThinkingBlock reasoning="Weighing the options" live />)
    expect(screen.getByText('Thinking…')).toBeTruthy()
    expect(screen.getByText('Weighing the options')).toBeTruthy()
  })

  it('folds to "Thought for Ns" once answered, and expands on click', () => {
    render(<ThinkingBlock reasoning="Weighing the options" live={false} thoughtMs={2400} />)
    expect(screen.queryByText('Weighing the options')).toBeNull()
    const toggle = screen.getByRole('button', { name: /Thought for 2s/ })
    fireEvent.click(toggle)
    expect(screen.getByText('Weighing the options')).toBeTruthy()
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
  })

  it('says "Thought" when no duration was measured', () => {
    render(<ThinkingBlock reasoning="x" live={false} />)
    expect(screen.getByRole('button', { name: /^Thought/ }).textContent).not.toMatch(/for/)
  })
})
