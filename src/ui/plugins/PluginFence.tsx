// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// A fenced code block a plugin claimed. The plugin returns blocks (data), the
// host draws them — the same contract as a block panel, for the same reason: it
// works on both runtimes and never hands plugin code the DOM.
//
// The plain code block is the fallback, and stays on screen while the render is
// in flight. A plugin that throws, times out or returns nothing leaves the fence
// exactly as it was: readable. The note is the user's content, so it must never
// be worse off for a plugin being installed.

import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import {
  getContributionsVersion,
  getFence,
  subscribeContributions,
} from '../../lib/pluginContributions'
import type { PluginBlock } from '../../lib/pluginBlocks'
import { sanitizeBlocks } from '../../lib/pluginBlocks'
import { pluginLog } from '../../lib/pluginLog'
import { PluginBlocks } from './PluginBlocks'

export function PluginFence({
  lang,
  source,
  fallback,
}: {
  lang: string | undefined
  source: string
  /** What to show when no plugin claims this language, or its render fails. */
  fallback: ReactNode
}) {
  // Subscribing here (rather than deciding once in the markdown components) means
  // a plugin enabled while a note is open takes effect on that note immediately.
  useSyncExternalStore(subscribeContributions, getContributionsVersion, getContributionsVersion)
  const fence = getFence(lang)
  const [blocks, setBlocks] = useState<PluginBlock[] | null>(null)

  useEffect(() => {
    if (!fence) {
      setBlocks(null)
      return
    }
    let cancelled = false
    Promise.resolve()
      .then(() => fence.render(source))
      .then((result) => {
        if (!cancelled) setBlocks(sanitizeBlocks(result))
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setBlocks(null)
        pluginLog('warn', `Could not render a \`\`\`${fence.lang} block: ${err instanceof Error ? err.message : String(err)}`, fence.pluginId)
      })
    return () => {
      cancelled = true
    }
  }, [fence, source])

  if (!fence || !blocks || blocks.length === 0) return <>{fallback}</>
  return <PluginBlocks blocks={blocks} />
}
