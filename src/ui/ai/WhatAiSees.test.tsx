// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { WhatAiSees } from './WhatAiSees'
import type { AiLayer } from '../../core/ai/aiLayers'

const layers: AiLayer[] = [
  { key: 'a', label: 'Your system prompt', description: 'First thing.', active: true, detail: 'Chat system prompt' },
  { key: 'b', label: 'Skills', description: 'Not used in Agent mode.', active: false },
]

describe('WhatAiSees', () => {
  it('opens on click and lists layers in order with On/Off', () => {
    render(<WhatAiSees layers={layers} />)
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'What the AI sees' }))
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0].textContent).toContain('1.')
    expect(items[0].textContent).toContain('Your system prompt')
    expect(items[0].textContent).toContain('On')
    expect(items[0].textContent).toContain('Chat system prompt')
    expect(items[1].textContent).toContain('Off')
    expect(items[1].textContent).toContain('Not used in Agent mode.')
  })

  it('closes on Escape and on outside click', () => {
    render(<WhatAiSees layers={layers} />)
    const btn = screen.getByRole('button', { name: 'What the AI sees' })
    fireEvent.click(btn)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(btn)
    fireEvent.mouseDown(document.body)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
