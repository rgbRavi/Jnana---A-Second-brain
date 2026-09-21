// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Keyboard shortcuts for plugin commands.
//
// A plugin command already reaches the palette; a hotkey is what makes one worth
// using twenty times a day. A plugin *suggests* a chord in `registerCommand`, and
// the user owns it from there: they can rebind it or switch it off, and their
// choice survives the plugin updating its suggestion.
//
// Chords are canonical strings like `mod+shift+k`. `mod` is Ctrl on Windows and
// Linux, ⌘ on macOS — the same `ctrlKey || metaKey` test the app's own bindings
// use, so one stored chord is right on every platform.
//
// Conflicts are refused rather than resolved: the app's own bindings win, and
// between two plugins the first to claim a chord keeps it. A shortcut that
// silently stops doing what it did yesterday is worse than one that won't bind.

import { listCommands } from './pluginContributions'
import { pluginLog } from './pluginLog'

const STORE_KEY = 'jnana.plugin.hotkeys.v1'

/** Chords the app itself uses, each checked against its source. This is the one
 *  place to update when an app binding moves — a plugin cannot take one over. */
const RESERVED: Record<string, string> = {
  // ui/CommandPalette.tsx
  'mod+`': 'the command palette',
  // AppLayout.tsx
  'mod+shift+e': 'the Working Notes desk',
  // views/notes/working/WorkingNotes.tsx
  'mod+w': 'closing the active tab',
  'mod+\\': 'splitting the active pane',
  // Editing chords the browser and the canvas both rely on.
  'mod+z': 'undo',
  'mod+shift+z': 'redo',
  'mod+y': 'redo',
  'mod+c': 'copy',
  'mod+v': 'paste',
  'mod+x': 'cut',
  'mod+a': 'select all',
  'mod+d': 'duplicating a selection',
}

/**
 * Canonical form of a chord: modifiers in a fixed order, lowercase, `mod` for
 * Ctrl/⌘. Returns '' for anything unusable (no key, modifier-only) so a bad
 * suggestion in a manifest simply doesn't bind.
 */
export function normalizeChord(raw: string): string {
  if (!raw) return ''
  const parts = raw
    .split('+')
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean)
  if (!parts.length) return ''

  let mod = false
  let alt = false
  let shift = false
  let key = ''
  for (const part of parts) {
    if (part === 'mod' || part === 'ctrl' || part === 'control' || part === 'cmd' || part === 'meta') mod = true
    else if (part === 'alt' || part === 'option') alt = true
    else if (part === 'shift') shift = true
    else key = part === 'esc' ? 'escape' : part
  }
  if (!key) return ''
  // A bare letter is not a shortcut — it's typing. Require a real modifier so a
  // plugin can't swallow the "n" key.
  if (!mod && !alt) return ''
  return `${mod ? 'mod+' : ''}${alt ? 'alt+' : ''}${shift ? 'shift+' : ''}${key}`
}

/**
 * The chords a keyboard event could mean, most literal first.
 *
 * Usually one. But `Ctrl+Alt` **is** AltGr on Windows and on many Linux layouts,
 * so `Ctrl+Alt+T` can arrive with `key` already translated to whatever AltGr+T
 * produces on that layout — `ŧ`, `€`, a dead key, or an empty string. The chord
 * the user physically pressed is then only visible in `code` (`KeyT`), which is
 * layout-independent. Matching either means a suggested `mod+alt+t` works on a
 * US layout *and* on one where AltGr rewrites the letter.
 */
export function chordsFromEvent(e: {
  key: string
  code?: string
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  shiftKey: boolean
}): string[] {
  const key = (e.key ?? '').toLowerCase()
  if (['control', 'meta', 'alt', 'shift', 'altgraph'].includes(key)) return []
  const mod = e.ctrlKey || e.metaKey
  if (!mod && !e.altKey) return []
  const prefix = `${mod ? 'mod+' : ''}${e.altKey ? 'alt+' : ''}${e.shiftKey ? 'shift+' : ''}`

  const out: string[] = []
  if (key) out.push(prefix + key)
  // The physical key, for the AltGr case above.
  const physical = /^Key([A-Z])$/.exec(e.code ?? '')?.[1]?.toLowerCase()
    ?? /^Digit([0-9])$/.exec(e.code ?? '')?.[1]
  if (physical && !out.includes(prefix + physical)) out.push(prefix + physical)
  return out
}

/** The single chord an event most literally represents ('' for none). */
export function chordFromEvent(e: {
  key: string
  code?: string
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  shiftKey: boolean
}): string {
  return chordsFromEvent(e)[0] ?? ''
}

// ── User overrides (module store + localStorage) ──

function load(): Record<string, string> {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    return raw ? (JSON.parse(raw) as Record<string, string>) : {}
  } catch {
    return {}
  }
}

let overrides = load()
let version = 0
const listeners = new Set<() => void>()

export function subscribeHotkeys(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getHotkeysVersion(): number {
  return version
}

/** Rebind a command. `''` switches the shortcut off; `null` restores the
 *  plugin's suggested default. */
export function setHotkeyOverride(commandId: string, chord: string | null): void {
  if (chord === null) delete overrides[commandId]
  else overrides[commandId] = normalizeChord(chord)
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(overrides))
  } catch {
    /* storage unavailable */
  }
  version += 1
  listeners.forEach((l) => l())
}

/** The chord in force for a command: the user's choice, else what the plugin
 *  suggested. '' means no shortcut. */
export function effectiveChord(commandId: string, suggested?: string): string {
  const override = overrides[commandId]
  return normalizeChord(override !== undefined ? override : (suggested ?? ''))
}

/** True when the user has set this command's shortcut themselves (so it can be
 *  reset back to the plugin's suggestion). */
export function hasHotkeyOverride(commandId: string): boolean {
  return overrides[commandId] !== undefined
}

/** Why `chord` can't be bound to `commandId`, or null when it's free. */
export function hotkeyConflict(chord: string, commandId: string): string | null {
  const canonical = normalizeChord(chord)
  if (!canonical) return 'Use a shortcut with Ctrl/⌘ or Alt, plus a key.'
  const reserved = RESERVED[canonical]
  if (reserved) return `${formatChord(canonical)} is already ${reserved}.`
  const clash = listCommands().find(
    (c) => c.id !== commandId && effectiveChord(c.id, c.hotkey) === canonical,
  )
  return clash ? `${formatChord(canonical)} is already “${clash.label}”.` : null
}

/** Human form of a canonical chord, for buttons and hints. */
export function formatChord(chord: string): string {
  if (!chord) return ''
  const mac = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform || '')
  return chord
    .split('+')
    .map((part) => {
      if (part === 'mod') return mac ? '⌘' : 'Ctrl'
      if (part === 'alt') return mac ? '⌥' : 'Alt'
      if (part === 'shift') return 'Shift'
      return part.length === 1 ? part.toUpperCase() : part.charAt(0).toUpperCase() + part.slice(1)
    })
    .join('+')
}

/**
 * Start listening for plugin hotkeys. Called once at boot. Returns a teardown so
 * a test can undo it.
 *
 * A command whose chord clashes with an app binding is skipped here as well as at
 * rebind time: a plugin's suggestion arrives at load, when nothing asked the user
 * anything, so the check has to be at the point of use too.
 */
export function installPluginHotkeys(): () => void {
  const onKey = (e: KeyboardEvent) => {
    const chords = chordsFromEvent(e)
    if (!chords.length) return
    const usable = chords.filter((c) => !RESERVED[c])
    if (!usable.length) return
    const commands = listCommands()
    const command = commands.find((c) => usable.includes(effectiveChord(c.id, c.hotkey)))
    if (!command) return
    e.preventDefault()
    // Named in the Plugin Console: a shortcut that fires but whose command does
    // nothing looks identical to one that never fired, and they need different fixes.
    pluginLog('info', `Shortcut ${formatChord(effectiveChord(command.id, command.hotkey))} → ${command.label}`, command.id)
    try {
      command.run()
    } catch (err) {
      console.error(`[hotkeys] plugin command "${command.id}" threw`, err)
    }
  }
  // Capture phase: a plugin shortcut must still work while the focus is inside
  // CodeMirror or another widget that consumes keys it recognizes.
  window.addEventListener('keydown', onKey, true)
  return () => window.removeEventListener('keydown', onKey, true)
}
