// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, it, expect, beforeEach } from 'vitest'
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { useComposerToolbar } from '../../hooks/useComposerToolbar'
import { ToolbarSettings } from './ToolbarSettings'

beforeEach(() => {
  const { result } = renderHook(() => useComposerToolbar())
  act(() => { result.current[1].reset(); result.current[1].toggle('preset') })
})

describe('ToolbarSettings', () => {
  it('toggling a row updates the store', () => {
    render(<ToolbarSettings />)
    const sw = screen.getByRole('switch', { name: 'Show More' })
    expect(sw.getAttribute('aria-checked')).toBe('true')
    fireEvent.click(sw)
    expect(screen.getByRole('switch', { name: 'Show More' }).getAttribute('aria-checked')).toBe('false')
    const { result } = renderHook(() => useComposerToolbar())
    expect(result.current[0].hidden).toEqual(['more'])
  })
  it('arrow keys on a handle reorder; Reset restores', () => {
    render(<ToolbarSettings />)
    fireEvent.keyDown(screen.getByRole('button', { name: 'Reorder Preset switcher' }), { key: 'ArrowDown' })
    const { result } = renderHook(() => useComposerToolbar())
    expect(result.current[0].order.slice(0, 2)).toEqual(['attach', 'preset'])
    fireEvent.click(screen.getByRole('button', { name: 'Reset to default' }))
    expect(result.current[0].order[0]).toBe('preset')
  })
  it('keyboard reorder keeps focus on the moved handle', () => {
    render(<ToolbarSettings />)
    const h = () => screen.getByRole('button', { name: 'Reorder Preset switcher' })
    h().focus()
    fireEvent.keyDown(h(), { key: 'ArrowDown' })
    expect(document.activeElement).toBe(h())
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' })
    const { result } = renderHook(() => useComposerToolbar())
    expect(result.current[0].order.indexOf('preset')).toBe(2)
  })
  it('drag moves only while the same pointer holds the button; lost capture ends it', () => {
    render(<ToolbarSettings />)
    const { result } = renderHook(() => useComposerToolbar())
    const h = screen.getByRole('button', { name: 'Reorder Preset switcher' })
    fireEvent.pointerMove(h, { pointerId: 1, buttons: 1 }) // no drag started
    expect(result.current[0].order[0]).toBe('preset')
    fireEvent.pointerDown(h, { pointerId: 1, buttons: 1 })
    fireEvent.pointerMove(h, { pointerId: 1, buttons: 0 }) // button released
    expect(result.current[0].order[0]).toBe('preset')
    fireEvent.pointerMove(h, { pointerId: 2, buttons: 1 }) // other pointer
    expect(result.current[0].order[0]).toBe('preset')
    fireEvent.lostPointerCapture(h, { pointerId: 1 })
    fireEvent.pointerMove(h, { pointerId: 1, buttons: 1 })
    expect(result.current[0].order[0]).toBe('preset')
    fireEvent.pointerDown(h, { pointerId: 1, buttons: 1 })
    fireEvent.pointerMove(h, { pointerId: 1, buttons: 1 })
    expect(result.current[0].order[0]).not.toBe('preset') // sanity: drag works
  })
})
