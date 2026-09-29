// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import type { Plugin } from '../../types'
import { foldToBin, letterToNotes, transitionMs } from './effects'

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

    // Bulk delete fires one `note:trashing` per note, back to back, and each
    // fold charges the motion budget ~10 times (anchors, clone, six animates)
    // — deleting a few dozen notes at once would otherwise trip the runaway
    // limit and get this plugin auto-disabled. A local-timestamp throttle (no
    // API call, so a skipped fold costs nothing) caps it at 4 folds/s ≈ 40
    // calls/s, under the 50/s budget, without needing a queue.
    let lastFoldAt = 0
    const fold = (p: { id?: string } | undefined) => {
      if (!p?.id) return
      const now = Date.now()
      if (now - lastFoldAt < 250) return
      lastFoldAt = now
      foldToBin(motion, p.id)
    }
    // Saving tucks the composer back into its pill; start the letter from the pill
    // once that collapse has played (the panel's own transition length, so it
    // tracks the theme's motion speed).
    const letter = () => {
      window.setTimeout(() => letterToNotes(motion), transitionMs(motion.anchor('composer')))
    }

    // Claim a moment only while its switch is on, so a switched-off effect never
    // shows up as a contender in Settings → Appearance → Motion. As a built-in,
    // any third-party plugin claiming the same moment wins unless the user picks.
    const effects = [
      { key: 'foldToBin', moment: 'note:trashing', handler: fold },
      { key: 'letterToNotes', moment: 'composer:saving', handler: letter },
    ] as const
    const unclaim = new Map<string, () => void>()
    const apply = (values: Record<string, unknown>) => {
      for (const { key, moment, handler } of effects) {
        const want = values[key] === true
        if (want && !unclaim.has(key)) unclaim.set(key, motion.on(moment, handler))
        if (!want) {
          unclaim.get(key)?.()
          unclaim.delete(key)
        }
      }
    }

    ctx.ui.registerSettings({
      fields: [
        { key: 'foldToBin', label: 'Crumple into the bin', hint: 'A deleted note folds up and flies to Trash.', type: 'toggle', default: false },
        { key: 'letterToNotes', label: 'Send as a letter', hint: '"That\'s my note" tucks the composer into its pill and sends the note off as a letter to Notes.', type: 'toggle', default: false },
      ],
      onChange: apply,
    })
    // A failed read (storage unavailable) must not reject unhandled at boot — leave
    // both effects off rather than crash plugin init.
    apply((await ctx.storage.get<Record<string, unknown>>('__settings').catch(() => null)) ?? {})
  },
}
