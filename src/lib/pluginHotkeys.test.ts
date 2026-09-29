// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Shortcuts are the one plugin surface that can take a key away from the app, so
// the rules that stop that are what's tested here: canonical chords, refusing the
// app's own bindings, and the user's choice beating the plugin's suggestion.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { registerCommand, unregisterCommand } from './pluginContributions'
import {
  chordFromEvent,
  effectiveChord,
  hotkeyConflict,
  installPluginHotkeys,
  normalizeChord,
  setHotkeyOverride,
} from './pluginHotkeys'

const press = (init: Partial<KeyboardEventInit> & { key: string }) =>
  window.dispatchEvent(new KeyboardEvent('keydown', { ...init, bubbles: true }))

describe('plugin hotkeys', () => {
  beforeEach(() => {
    localStorage.clear()
    unregisterCommand('test.cmd')
    unregisterCommand('other.cmd')
    setHotkeyOverride('test.cmd', null)
    setHotkeyOverride('other.cmd', null)
  })

  it('canonicalizes chords, whichever way they were written', () => {
    expect(normalizeChord('Ctrl+Shift+K')).toBe('mod+shift+k')
    expect(normalizeChord('cmd+shift+k')).toBe('mod+shift+k')
    expect(normalizeChord(' meta + K ')).toBe('mod+k')
  })

  it('refuses a chord that is just a key — that is typing, not a shortcut', () => {
    expect(normalizeChord('n')).toBe('')
    expect(normalizeChord('shift+n')).toBe('')
    expect(normalizeChord('ctrl')).toBe('')
  })

  it('reads the same chord off a keyboard event', () => {
    expect(chordFromEvent({ key: 'K', ctrlKey: true, metaKey: false, altKey: false, shiftKey: true }))
      .toBe('mod+shift+k')
    expect(chordFromEvent({ key: 'Control', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false }))
      .toBe('')
  })

  it("will not bind over one of the app's own bindings", () => {
    expect(hotkeyConflict('mod+`', 'test.cmd')).toMatch(/command palette/)
    expect(hotkeyConflict('mod+w', 'test.cmd')).toMatch(/closing the active tab/)
    expect(hotkeyConflict('mod+shift+k', 'test.cmd')).toBeNull()
  })

  it('will not let two plugin commands claim the same chord', () => {
    registerCommand({ id: 'other.cmd', label: 'Other thing', hotkey: 'mod+shift+j', run: () => {} })
    expect(hotkeyConflict('mod+shift+j', 'test.cmd')).toMatch(/Other thing/)
    // The command that already owns it can of course keep it.
    expect(hotkeyConflict('mod+shift+j', 'other.cmd')).toBeNull()
  })

  it("lets the user's binding win over the plugin's suggestion, and clear it", () => {
    expect(effectiveChord('test.cmd', 'mod+shift+k')).toBe('mod+shift+k')
    setHotkeyOverride('test.cmd', 'alt+p')
    expect(effectiveChord('test.cmd', 'mod+shift+k')).toBe('alt+p')
    setHotkeyOverride('test.cmd', '')
    expect(effectiveChord('test.cmd', 'mod+shift+k')).toBe('')
    setHotkeyOverride('test.cmd', null)
    expect(effectiveChord('test.cmd', 'mod+shift+k')).toBe('mod+shift+k')
  })

  it('still matches when AltGr rewrote the letter (Ctrl+Alt on many layouts)', () => {
    const run = vi.fn()
    registerCommand({ id: 'test.cmd', label: 'Test', hotkey: 'mod+alt+t', run })
    const stop = installPluginHotkeys()

    // Windows and most Linux layouts treat Ctrl+Alt as AltGr, so `key` arrives
    // already translated; only `code` still says which key was pressed.
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ŧ', code: 'KeyT', ctrlKey: true, altKey: true, bubbles: true }),
    )

    expect(run).toHaveBeenCalledTimes(1)
    stop()
  })

  it('fires even when a widget consumes the key first', () => {
    const run = vi.fn()
    registerCommand({ id: 'test.cmd', label: 'Test', hotkey: 'mod+alt+t', run })
    const stop = installPluginHotkeys()

    // An editor that swallows keys it recognizes must not swallow a user's
    // shortcut with it, so the listener runs in the capture phase.
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.addEventListener('keydown', (e) => e.stopPropagation())
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 't', code: 'KeyT', ctrlKey: true, altKey: true, bubbles: true }),
    )

    expect(run).toHaveBeenCalledTimes(1)
    input.remove()
    stop()
  })

  it('runs the command whose chord was pressed, and nothing else', () => {
    const run = vi.fn()
    registerCommand({ id: 'test.cmd', label: 'Test', hotkey: 'mod+shift+k', run })
    const stop = installPluginHotkeys()

    press({ key: 'k', ctrlKey: true, shiftKey: true })
    expect(run).toHaveBeenCalledTimes(1)

    // A different chord, and an app binding, both leave it alone.
    press({ key: 'j', ctrlKey: true, shiftKey: true })
    press({ key: '`', ctrlKey: true })
    expect(run).toHaveBeenCalledTimes(1)

    stop()
    press({ key: 'k', ctrlKey: true, shiftKey: true })
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('follows a rebind without the plugin re-registering', () => {
    const run = vi.fn()
    registerCommand({ id: 'test.cmd', label: 'Test', hotkey: 'mod+shift+k', run })
    const stop = installPluginHotkeys()

    setHotkeyOverride('test.cmd', 'alt+p')
    press({ key: 'k', ctrlKey: true, shiftKey: true })
    expect(run).not.toHaveBeenCalled()

    press({ key: 'p', altKey: true })
    expect(run).toHaveBeenCalledTimes(1)
    stop()
  })
})
