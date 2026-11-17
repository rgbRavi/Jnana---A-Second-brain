// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { SettingSelect, SettingSlider, SettingToggle } from './SettingControls'
import { InfoButton, normalizeHint } from './SettingLayout'

const OPTS = [
  { value: 'a', label: 'Apple' },
  { value: 'b', label: 'Banana' },
  { value: 'c', label: 'Blueberry' },
]

function Sel({ onChange }: { onChange?: (v: string) => void }) {
  const [v, setV] = useState('a')
  return <SettingSelect ariaLabel="Fruit" value={v} options={OPTS} onChange={(x) => { setV(x); onChange?.(x) }} />
}

describe('SettingSelect', () => {
  it('aria-activedescendant follows ArrowDown', () => {
    render(<Sel />)
    const t = screen.getByRole('button', { name: 'Fruit' })
    fireEvent.keyDown(t, { key: 'Enter' })
    expect(t.getAttribute('aria-expanded')).toBe('true')
    const first = t.getAttribute('aria-activedescendant')
    fireEvent.keyDown(t, { key: 'ArrowDown' })
    const next = t.getAttribute('aria-activedescendant')
    expect(next).not.toBe(first)
    expect(document.getElementById(next!)?.textContent).toBe('Banana')
  })

  it('typeahead opens on the match when closed (never commits), cycles when open', () => {
    const seen: string[] = []
    render(<Sel onChange={(v) => seen.push(v)} />)
    const t = screen.getByRole('button', { name: 'Fruit' })
    const activeText = () => document.getElementById(t.getAttribute('aria-activedescendant')!)?.textContent
    fireEvent.keyDown(t, { key: 'b' })
    expect(seen).toEqual([])
    expect(t.getAttribute('aria-expanded')).toBe('true')
    expect(activeText()).toBe('Banana')
    fireEvent.keyDown(t, { key: 'b' }) // same letter cycles
    expect(activeText()).toBe('Blueberry')
    fireEvent.keyDown(t, { key: 'Enter' })
    expect(seen).toEqual(['c'])
  })

  it('Tab closes without committing', () => {
    const seen: string[] = []
    render(<Sel onChange={(v) => seen.push(v)} />)
    const t = screen.getByRole('button', { name: 'Fruit' })
    fireEvent.keyDown(t, { key: 'Enter' })
    fireEvent.keyDown(t, { key: 'ArrowDown' })
    fireEvent.keyDown(t, { key: 'Tab' })
    expect(t.getAttribute('aria-expanded')).toBe('false')
    expect(seen).toEqual([])
  })
})

describe('SettingSlider', () => {
  it('PageUp moves 10% of range and exposes aria-valuetext', () => {
    let v = 20
    const { rerender } = render(<SettingSlider ariaLabel="Size" value={v} min={0} max={100} step={5} onChange={(x) => (v = x)} formatValue={(n) => `${n}%`} />)
    const s = screen.getByRole('slider')
    expect(s.getAttribute('aria-valuetext')).toBe('20%')
    fireEvent.keyDown(s, { key: 'PageUp' })
    expect(v).toBe(30)
    fireEvent.keyDown(s, { key: 'ArrowRight', shiftKey: true })
    expect(v).toBe(70)
    rerender(<SettingSlider ariaLabel="Size" value={v} min={0} max={100} step={5} onChange={() => {}} />)
  })
})

describe('InfoButton', () => {
  it('is named About <label> and Esc closes an open hint with preventDefault', () => {
    let toggled = 0
    render(<InfoButton text="x" label="Dark mode" open onToggle={() => toggled++} controls="h" />)
    const b = screen.getByRole('button', { name: 'About Dark mode' })
    const notPrevented = fireEvent.keyDown(b, { key: 'Escape' })
    expect(notPrevented).toBe(false)
    expect(toggled).toBe(1)
  })
  it('falls back to More info and ignores Esc when closed', () => {
    render(<InfoButton text="x" open={false} onToggle={() => {}} controls="h" />)
    const b = screen.getByRole('button', { name: 'More info' })
    expect(fireEvent.keyDown(b, { key: 'Escape' })).toBe(true)
  })
  it('SettingToggle names its info button after the label', () => {
    render(<SettingToggle checked onChange={() => {}} label="Auto save" hint="saves as you type" />)
    expect(screen.getByRole('button', { name: 'About Auto save' })).toBeTruthy()
  })
})

describe('normalizeHint', () => {
  it('capitalises and terminates', () => {
    expect(normalizeHint('saves as you type')).toBe('Saves as you type.')
    expect(normalizeHint('Already done.')).toBe('Already done.')
    expect(normalizeHint('really?')).toBe('Really?')
  })
})
