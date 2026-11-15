// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, it, expect } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ComposerMenu, MenuRow } from './ComposerMenu'

function Harness() {
  return (
    <div>
      <p>Chat thread</p>
      <ComposerMenu icon={null} label="More">
        {(close) => <MenuRow label="Row" onClick={close} />}
      </ComposerMenu>
    </div>
  )
}

const open = () => fireEvent.click(screen.getByRole('button', { name: /More/ }))

describe('ComposerMenu', () => {
  it('closes when the user presses anywhere outside it (e.g. the chat thread)', () => {
    render(<Harness />)
    open()
    expect(screen.getByRole('menu')).toBeTruthy()
    fireEvent.pointerDown(screen.getByText('Chat thread'))
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('stays open when pressing inside the menu', () => {
    render(<Harness />)
    open()
    fireEvent.pointerDown(screen.getByRole('menuitem', { name: /Row/ }))
    expect(screen.getByRole('menu')).toBeTruthy()
  })

  it('closes on Escape and from a row', () => {
    render(<Harness />)
    open()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    open()
    fireEvent.click(screen.getByRole('menuitem', { name: /Row/ }))
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('the trigger still toggles it closed', () => {
    render(<Harness />)
    open()
    const trigger = screen.getByRole('button', { name: /More/ })
    fireEvent.pointerDown(trigger)
    fireEvent.click(trigger)
    expect(screen.queryByRole('menu')).toBeNull()
  })
})
