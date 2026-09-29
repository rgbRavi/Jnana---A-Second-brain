// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import type { MenuItem } from './ContextMenu'
import { listPluginActions, runPluginAction } from '../lib/pluginActions'

/** Plugin `note.menu` items as ContextMenu rows for one note. Read when the menu
 *  opens, so it's always current. The first carries a separator to set the
 *  plugin group apart from Jnana's own items. */
export function pluginNoteMenuItems(noteId: string): MenuItem[] {
  return listPluginActions('note.menu').map((a, i) => ({
    label: `${a.icon} ${a.label}`,
    separator: i === 0,
    onClick: () => runPluginAction(a, { noteId }),
  }))
}
