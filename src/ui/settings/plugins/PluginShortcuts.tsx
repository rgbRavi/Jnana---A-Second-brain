// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useEffect, useState, useSyncExternalStore } from 'react'
import { RotateCcw } from 'lucide-react'
import {
  getContributionsVersion,
  listCommands,
  subscribeContributions,
} from '../../../lib/pluginContributions'
import {
  chordFromEvent,
  effectiveChord,
  formatChord,
  getHotkeysVersion,
  hasHotkeyOverride,
  hotkeyConflict,
  setHotkeyOverride,
  subscribeHotkeys,
} from '../../../lib/pluginHotkeys'
import { pluginRegistry } from '../../../lib/pluginRegistry'
import { toast } from '../../../lib/toast'
import Styles from './PluginsPanel.module.css'

/**
 * Keyboard shortcuts for one plugin's commands.
 *
 * A plugin *suggests* a chord; the user decides. Pressing the button captures the
 * next chord, Backspace clears it (no shortcut), Escape cancels, and the reset
 * arrow goes back to whatever the plugin suggested. A chord the app already uses
 * is refused with the reason, rather than quietly overriding the app or being
 * shadowed by it.
 */
export function PluginShortcuts({ pluginId }: { pluginId: string }) {
  useSyncExternalStore(subscribeContributions, getContributionsVersion, getContributionsVersion)
  useSyncExternalStore(subscribeHotkeys, getHotkeysVersion, getHotkeysVersion)
  const [capturing, setCapturing] = useState<string | null>(null)

  const ids = pluginRegistry.commandIdsOf(pluginId)
  const commands = listCommands().filter((c) => ids.includes(c.id))

  useEffect(() => {
    if (!capturing) return
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') {
        setCapturing(null)
        return
      }
      if (e.key === 'Backspace' || e.key === 'Delete') {
        setHotkeyOverride(capturing, '')
        setCapturing(null)
        return
      }
      const chord = chordFromEvent(e)
      if (!chord) return // a bare key, or a modifier on its own — keep listening
      const conflict = hotkeyConflict(chord, capturing)
      if (conflict) {
        toast.error(conflict)
        setCapturing(null)
        return
      }
      setHotkeyOverride(capturing, chord)
      setCapturing(null)
    }
    // Capture phase: the chord being bound may be one another handler would act on.
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [capturing])

  if (commands.length === 0) return null

  return (
    <div className={Styles.settingsPane}>
      {commands.map((command) => {
        const chord = effectiveChord(command.id, command.hotkey)
        const overridden = hasHotkeyOverride(command.id)
        return (
          <div key={command.id} className={Styles.settingsRow}>
            <div className={Styles.settingsLabel}>
              <span>{command.label}</span>
              <small className={Styles.muted}>
                {capturing === command.id
                  ? 'Press a shortcut — Backspace to clear, Esc to cancel'
                  : 'Keyboard shortcut'}
              </small>
            </div>
            <div className={Styles.settingsControl}>
              <button
                className={Styles.chordBtn}
                aria-label={`Set a shortcut for ${command.label}`}
                onClick={() => setCapturing(capturing === command.id ? null : command.id)}
              >
                {capturing === command.id ? 'Press keys…' : chord ? formatChord(chord) : 'None'}
              </button>
              {overridden && (
                <button
                  className={Styles.iconBtn}
                  title="Reset to the plugin's suggested shortcut"
                  aria-label="Reset shortcut"
                  onClick={() => setHotkeyOverride(command.id, null)}
                >
                  <RotateCcw size={14} />
                </button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
