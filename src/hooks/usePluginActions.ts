// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useMemo, useSyncExternalStore } from 'react'
import { getActionsVersion, listPluginActions, subscribeActions, type PluginActionSlot, type StoredAction } from '../lib/pluginActions'

/** A slot's plugin actions, re-read whenever a plugin registers or unloads one. */
export function usePluginActions(slot: PluginActionSlot): StoredAction[] {
  const version = useSyncExternalStore(subscribeActions, getActionsVersion)
  return useMemo(() => listPluginActions(slot), [slot, version])
}
