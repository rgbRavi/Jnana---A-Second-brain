// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, it, expect, vi, afterEach } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { setGeneralSettings } from '../hooks/useGeneralSettings'
import { eventBus } from '../lib/eventBus'
import { PluginWidgetHost } from './PluginWidgetHost'

vi.mock('../lib/pluginContributions', () => ({
  listWidgets: () => [{ id: 'w', title: 'Pomodoro', Component: () => <p>25:00</p> }],
  subscribeContributions: () => () => {},
  getContributionsVersion: () => 1,
}))
vi.mock('../lib/pluginRegistry', () => ({ pluginRegistry: { pluginIdForWidget: () => 'p' } }))

describe('PluginWidgetHost', () => {
  it('closes on an outside click but not on a click inside', () => {
    render(<><PluginWidgetHost /><button>outside</button></>)
    fireEvent.click(screen.getByRole('button', { name: 'Show plugin widgets' }))
    fireEvent.pointerDown(screen.getByText('25:00'))
    expect(screen.getByRole('dialog', { name: 'Plugin widgets' })).toBeTruthy()
    fireEvent.pointerDown(screen.getByRole('button', { name: 'outside' }))
    expect(screen.queryByRole('dialog', { name: 'Plugin widgets' })).toBeNull()
  })
  afterEach(() => setGeneralSettings({ showWidgetButton: true, autoHideWidgetButton: false }))

  it('"Show the widget button" off: no button, but the palette command still opens widgets', () => {
    setGeneralSettings({ showWidgetButton: false })
    render(<PluginWidgetHost />)
    expect(screen.queryByRole('button', { name: /plugin widgets/ })).toBeNull()
    act(() => eventBus.emit('widgets:toggle', {}))
    expect(screen.getByRole('dialog', { name: 'Plugin widgets' })).toBeTruthy()
  })

  it('auto-hide: the button hides while a text field has focus', () => {
    setGeneralSettings({ autoHideWidgetButton: true })
    render(<><PluginWidgetHost /><textarea aria-label="draft" /></>)
    const launcher = screen.getByRole('button', { name: 'Show plugin widgets' })
    expect(launcher.className).not.toMatch(/launcherHidden/)
    act(() => screen.getByRole('textbox', { name: 'draft' }).focus())
    expect(launcher.className).toMatch(/launcherHidden/)
  })
})
