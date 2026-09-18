// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// After a note is renamed, offer to rewrite the `[[Old title]]` links pointing
// at it (same vault) so they keep resolving instead of turning into
// "create this note" links. Call it once the rename is committed (title blur,
// inline-rename Enter), not per keystroke.

import { useCallback, useRef } from 'react'
import { useNotesContext } from '../context/NotesContext'
import { DEFAULT_VAULT_ID } from '../types'
import { normalizeTitle } from '../core/markdown/wikilinks'
import { notesLinkingTo } from '../lib/noteLinks'
import { noteRenameLinks } from '../lib/noteTypes'
import { showConfirmDialog } from '../lib/dialog'
import { toast } from '../lib/toast'
import { log } from '../lib/logger'

export function useLinkRename(): (noteId: string, oldTitle: string, newTitle: string) => Promise<void> {
  const { notes, update } = useNotesContext()
  const notesRef = useRef(notes)
  notesRef.current = notes

  return useCallback(
    async (noteId, oldTitle, newTitle) => {
      const from = oldTitle.trim()
      const to = newTitle.trim()
      // A case-only change still resolves (matching is case-insensitive).
      if (!from || !to || normalizeTitle(from) === normalizeTitle(to)) return
      const all = notesRef.current
      const vault = all.find((n) => n.id === noteId)?.vaultId ?? DEFAULT_VAULT_ID
      const referencing = notesLinkingTo(from, vault, all, noteId)
      if (referencing.length === 0) return

      const count = referencing.length === 1 ? '1 note links' : `${referencing.length} notes link`
      const ok = await showConfirmDialog({
        title: 'Update links?',
        message: `${count} to “${from}”. Update those links to “${to}”?`,
        confirmLabel: 'Update links',
      })
      if (!ok) return

      let updated = 0
      for (const n of referencing) {
        const next = noteRenameLinks(n, from, to)
        if (next === n.content) continue
        try {
          await update(n.id, n.title, next)
          updated += 1
        } catch (err) {
          log.error('Link rename failed for note', n.id, err)
        }
      }
      if (updated === referencing.length) toast.success(`Updated links in ${updated} note${updated === 1 ? '' : 's'}.`)
      else toast.error(`Updated ${updated} of ${referencing.length} notes — some could not be changed.`)
    },
    [update],
  )
}
