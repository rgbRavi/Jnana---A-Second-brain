// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// The canvas plugin's logger: `ctx.log`, bound in init (see pluginLogSlot), so
// the editor/view components can log as the plugin from outside init.

import { pluginLogSlot } from '../../lib/pluginLog'
import { isUnreadableCanvas } from './canvasNote'

export const canvasLog = pluginLogSlot()

const checked = new Set<string>()

/** Check each canvas note once per session: unreadable content renders as an
 *  empty board, which otherwise looks like the work vanished. */
export function checkCanvasContent(noteId: string, content: string): void {
  if (checked.has(noteId)) return
  checked.add(noteId)
  if (!isUnreadableCanvas(content)) return
  canvasLog.warn('Canvas content is unreadable — showing an empty board', { noteId, chars: content.length })
}
