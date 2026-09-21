// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// The rail's two stateful promises: which panel is open survives a restart, and
// the whole rail can be dismissed and brought back. Both are read from
// localStorage at module load, so each case re-imports the module with storage
// already set — that is what "a new session" means here.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Table } from 'lucide-react'

const OPEN_KEY = 'jnana.rightrail.open.v1'
const HIDDEN_KEY = 'jnana.rightrail.hidden.v1'

function panel(id: string, title: string) {
  return { id, title, icon: Table, Component: () => <p>{title} body</p> }
}

/**
 * A fresh module graph, as a new session would have: the rail reads localStorage
 * at import time. The panel registry has to come from the *same* graph — reusing
 * a statically-imported one registers into a different module instance, and the
 * rail then renders nothing at all.
 */
async function freshRail() {
  vi.resetModules()
  const rail = await import('./RightRail')
  const registry = await import('../../lib/rightRailPanels')
  return { ...rail, register: registry.registerRailPanel }
}

describe('right rail', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('reopens the panel that was open last session', async () => {
    localStorage.setItem(OPEN_KEY, 'test.one')

    const { RightRail, register } = await freshRail()
    register(panel('test.one', 'One'))
    render(<RightRail />)

    expect(screen.getByText('One body')).toBeTruthy()
  })

  it('remembers being collapsed to the icon strip', async () => {
    localStorage.setItem(OPEN_KEY, '')

    const { RightRail, register } = await freshRail()
    register(panel('test.one', 'One'))
    render(<RightRail />)

    expect(screen.queryByText('One body')).toBeNull()
    expect(screen.getByRole('button', { name: 'One' })).toBeTruthy()
  })

  it('persists the panel the user opens', async () => {
    const { RightRail, register } = await freshRail()
    register(panel('test.one', 'One'))
    render(<RightRail />)

    fireEvent.click(screen.getByRole('button', { name: 'One' }))

    expect(localStorage.getItem(OPEN_KEY)).toBe('test.one')
    expect(screen.getByText('One body')).toBeTruthy()
  })

  it('hides the whole rail, and remembers that too', async () => {
    const { RightRail, register } = await freshRail()
    register(panel('test.one', 'One'))
    const { container, unmount } = render(<RightRail />)

    // A plugin panel is always available, so without this the strip could never
    // be got rid of — 44px of chrome on every screen, with no way out.
    fireEvent.click(screen.getByRole('button', { name: /Hide the right rail/i }))
    expect(container.querySelector('[data-rail]')).toBeNull()
    expect(localStorage.getItem(HIDDEN_KEY)).toBe('1')

    unmount()
    const again = await freshRail()
    again.register(panel('test.one', 'One'))
    render(<again.RightRail />)
    expect(screen.queryByRole('button', { name: 'One' })).toBeNull()
  })

  it('un-hides when something asks for a panel by name', async () => {
    localStorage.setItem(HIDDEN_KEY, '1')

    const { RightRail, openRailPanel, register } = await freshRail()
    register(panel('test.one', 'One'))
    render(<RightRail />)

    // The composer opens the Focused scope panel this way; a hidden rail must not
    // make that request quietly do nothing.
    openRailPanel('test.one')
    expect(await screen.findByText('One body')).toBeTruthy()
  })

  it('can be brought back after being hidden', async () => {
    localStorage.setItem(HIDDEN_KEY, '1')

    const { RightRail, setRailHidden, register } = await freshRail()
    register(panel('test.one', 'One'))
    render(<RightRail />)
    expect(screen.queryByRole('button', { name: 'One' })).toBeNull()

    // The command palette entry calls this; without an exported way back, hiding
    // the rail would be a one-way door.
    setRailHidden(false)
    expect(await screen.findByRole('button', { name: 'One' })).toBeTruthy()
  })
})
