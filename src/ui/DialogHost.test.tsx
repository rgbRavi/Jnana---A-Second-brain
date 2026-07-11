// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { act, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DialogHost } from './DialogHost'
import { resolveDialog, showConfirmDialog } from '../lib/dialog'

function setup() {
  render(
    <>
      <button data-testid="trigger">Trigger</button>
      <DialogHost />
    </>,
  )
  return screen.getByTestId('trigger') as HTMLButtonElement
}

describe('DialogHost focus management', () => {
  it('traps Tab and Shift+Tab within the dialog', async () => {
    setup()
    act(() => {
      void showConfirmDialog({ title: 'Delete?', message: 'Sure?', confirmLabel: 'Delete' })
    })
    await screen.findByRole('dialog')

    const cancel = screen.getByRole('button', { name: 'Cancel' })
    const confirm = screen.getByRole('button', { name: 'Delete' })

    // Tab off the last focusable wraps to the first.
    confirm.focus()
    expect(document.activeElement).toBe(confirm)
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))
    })
    expect(document.activeElement).toBe(cancel)

    // Shift+Tab off the first focusable wraps to the last.
    cancel.focus()
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }),
      )
    })
    expect(document.activeElement).toBe(confirm)

    act(() => resolveDialog(null))
  })

  it('returns focus to the pre-dialog element on close', async () => {
    const trigger = setup()
    trigger.focus()
    expect(document.activeElement).toBe(trigger)

    act(() => {
      void showConfirmDialog({ title: 'Delete?', confirmLabel: 'Delete' })
    })
    await screen.findByRole('dialog')
    // The dialog's autoFocus moved focus off the trigger.
    expect(document.activeElement).not.toBe(trigger)

    act(() => resolveDialog(null))
    // Focus is restored to whatever was focused before the dialog opened.
    expect(document.activeElement).toBe(trigger)
  })

  it('Escape closes the dialog', async () => {
    setup()
    act(() => {
      void showConfirmDialog({ title: 'Delete?' })
    })
    await screen.findByRole('dialog')

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
