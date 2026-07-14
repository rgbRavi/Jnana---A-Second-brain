// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { makePluginStorage } from '../../core/plugins/storage'
import type { CardSchedule } from './sm2'

/** Plugin id — also the scope for this plugin's `plugin_kv` rows. */
export const FLASHCARDS_PLUGIN_ID = 'jnana.flashcards'

/** Module-scoped storage bound to the plugin id, shared by init + the View. */
export const storage = makePluginStorage(FLASHCARDS_PLUGIN_ID)

/** Per-deck review state: card id → its SM-2 schedule. */
export type ScheduleMap = Record<string, CardSchedule>

const deckKey = (noteId: string) => `deck:${noteId}`

export async function loadSchedule(noteId: string): Promise<ScheduleMap> {
  return (await storage.get<ScheduleMap>(deckKey(noteId))) ?? {}
}

export async function saveSchedule(noteId: string, map: ScheduleMap): Promise<void> {
  await storage.set(deckKey(noteId), map)
}
