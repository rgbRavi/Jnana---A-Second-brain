// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Host side of a *block panel*: a right-rail panel a plugin describes as data
// instead of drawing. That's what lets a sandboxed (worker) plugin reach the
// rail at all — it has no DOM, so it sends blocks and this renders them.
//
// The component per panel id is cached, because the rail keys panels by identity:
// building a new component each render would remount the panel (and lose its
// scroll position) every time anything else on the rail changed.

import { useSyncExternalStore, type ComponentType } from 'react'
import {
  getContributionsVersion,
  listBlockPanels,
  subscribeContributions,
} from '../../lib/pluginContributions'
import { PluginBlocks } from './PluginBlocks'

const cache = new Map<string, ComponentType>()

function BlockPanelBody({ panelId }: { panelId: string }) {
  useSyncExternalStore(subscribeContributions, getContributionsVersion, getContributionsVersion)
  const panel = listBlockPanels().find((p) => p.id === panelId)
  if (!panel) return null
  return <PluginBlocks blocks={panel.blocks} onAction={panel.onAction} />
}

/** A stable component for one block panel id. */
export function blockPanelComponent(panelId: string): ComponentType {
  let Component = cache.get(panelId)
  if (!Component) {
    Component = () => <BlockPanelBody panelId={panelId} />
    Component.displayName = `PluginBlockPanel(${panelId})`
    cache.set(panelId, Component)
  }
  return Component
}
