// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// The rebind flow, end to end through the component: the row only exists when the
// registry says the plugin owns that command, pressing the button starts capture,
// and the next chord is stored (or refused with a reason).

import { describe, it, expect, beforeEach } from 'vitest'
import { render, fireEvent, screen } from '@testing-library/react'
import { PluginShortcuts } from './PluginShortcuts'
import { pluginRegistry } from '../../../lib/pluginRegistry'
import { effectiveChord, setHotkeyOverride } from '../../../lib/pluginHotkeys'

const PLUGIN_ID = 'com.test.shortcuts'

function registerPluginWithCommand() {
  pluginRegistry.register(
    {
      id: PLUGIN_ID,
      name: 'Shortcut Test',
      version: '1.0.0',
      init: (ctx) => {
        ctx.ui.registerCommand({
          id: 'shortcuts.run',
          label: 'Run the thing',
          hotkey: 'mod+alt+t',
          run: () => {},
        })
      },
    },
    { grantedPermissions: [] },
  )
}

describe('PluginShortcuts', () => {
  beforeEach(() => {
    // The override store is read once at module load, so clearing localStorage
    // alone would leave the in-memory copy from the previous test.
    setHotkeyOverride('shortcuts.run', null)
    pluginRegistry.unregister(PLUGIN_ID)
  })

  it('lists the plugin’s commands with their chord', () => {
    registerPluginWithCommand()
    render(<PluginShortcuts pluginId={PLUGIN_ID} />)

    expect(screen.getByText('Run the thing')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Set a shortcut/ }).textContent).toMatch(/Alt\+T/)
  })

  it('captures the next chord after the button is pressed', () => {
    registerPluginWithCommand()
    render(<PluginShortcuts pluginId={PLUGIN_ID} />)

    const button = screen.getByRole('button', { name: /Set a shortcut/ })
    fireEvent.click(button)
    expect(button.textContent).toMatch(/Press keys/)

    fireEvent.keyDown(window, { key: 'j', ctrlKey: true, shiftKey: true })

    expect(effectiveChord('shortcuts.run', 'mod+alt+t')).toBe('mod+shift+j')
    expect(button.textContent).toMatch(/Shift\+J/)
  })

  it('refuses a chord the app owns, leaving the old one in place', () => {
    registerPluginWithCommand()
    render(<PluginShortcuts pluginId={PLUGIN_ID} />)

    const button = screen.getByRole('button', { name: /Set a shortcut/ })
    fireEvent.click(button)
    fireEvent.keyDown(window, { key: '`', ctrlKey: true })

    expect(effectiveChord('shortcuts.run', 'mod+alt+t')).toBe('mod+alt+t')
  })

  it('renders nothing for a plugin that is not loaded', () => {
    const { container } = render(<PluginShortcuts pluginId="com.test.absent" />)
    expect(container.innerHTML).toBe('')
  })
})
