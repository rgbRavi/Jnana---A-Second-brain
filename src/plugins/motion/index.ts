// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import type { Plugin } from '../../types'
import { foldToBin, letterToNotes } from './effects'

/**
 * First-party motion effects, built on the public `ctx.motion` API so they double
 * as its reference use. Both off until switched on in Settings → Plugins → Jnana
 * Motion (plain `registerSettings` toggles); read per event, so no reload.
 */
export const motionPlugin: Plugin = {
  id: 'jnana.motion',
  name: 'Jnana Motion',
  version: '1.0.0',
  async init(ctx) {
    const motion = ctx.motion
    if (!motion) return
    let on: Record<string, unknown> = {}
    ctx.ui.registerSettings({
      fields: [
        { key: 'foldToBin', label: 'Crumple into the bin', hint: 'A deleted note folds up and flies to Trash.', type: 'toggle', default: false },
        { key: 'letterToNotes', label: 'Send as a letter', hint: '"That\'s my note" folds the composer into a letter bound for Notes.', type: 'toggle', default: false },
      ],
      onChange: (values) => void (on = values),
    })
    // Bulk delete fires one `note:trashing` per note, back to back, and each
    // fold charges the motion budget ~10 times (anchors, clone, six animates)
    // — deleting a few dozen notes at once would otherwise trip the runaway
    // limit and get this plugin auto-disabled. A local-timestamp throttle (no
    // API call, so a skipped fold costs nothing) caps it at 4 folds/s ≈ 40
    // calls/s, under the 50/s budget, without needing a queue.
    let lastFoldAt = 0
    ctx.bus.on<{ id?: string }>('note:trashing', (p) => {
      if (!p?.id || on.foldToBin !== true) return
      const now = Date.now()
      if (now - lastFoldAt < 250) return
      lastFoldAt = now
      foldToBin(motion, p.id)
    })
    ctx.bus.on('composer:saving', () => {
      if (on.letterToNotes === true) letterToNotes(motion)
    })
    // Stored choices arrive after the listeners are up; until then both stay off.
    // A failed read (storage unavailable) must not reject unhandled at boot — leave
    // both effects off rather than crash plugin init.
    on = (await ctx.storage.get<Record<string, unknown>>('__settings').catch(() => null)) ?? {}
  },
}
