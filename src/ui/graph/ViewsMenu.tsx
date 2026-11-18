// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useState } from 'react'
import { Bookmark } from 'lucide-react'
import { ContextMenu, type MenuItem } from '../ContextMenu'
import { showConfirmDialog, showPromptDialog } from '../../lib/dialog'
import { toast } from '../../lib/toast'
import { deleteView, renameView, saveView, useSavedViews, type GraphViewSnapshot, type SavedView } from './savedViews'

interface Props {
  /** Button class, so it matches the toolbar it sits in. */
  className?: string
  capture: () => GraphViewSnapshot
  apply: (s: GraphViewSnapshot) => void
}

export function ViewsMenu({ capture, apply, className }: Props) {
  const views = useSavedViews()
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)

  const save = async () => {
    const raw = await showPromptDialog({ title: 'Save current view', placeholder: 'View name', confirmLabel: 'Save' })
    const name = raw?.trim()
    if (!name) return
    const dup = views.find((v) => v.name.toLowerCase() === name.toLowerCase())
    if (dup && !(await showConfirmDialog({ title: 'Overwrite view?', message: `"${dup.name}" already exists.`, confirmLabel: 'Overwrite' }))) return
    saveView(name, capture())
    toast.success(`Saved view "${name}"`)
  }
  const rename = async (v: SavedView) => {
    const name = (await showPromptDialog({ title: 'Rename view', defaultValue: v.name, confirmLabel: 'Rename' }))?.trim()
    if (!name || name === v.name) return
    if (views.some((o) => o.id !== v.id && o.name.toLowerCase() === name.toLowerCase())) {
      toast.error(`A view named "${name}" already exists`)
      return
    }
    renameView(v.id, name)
  }
  const remove = async (v: SavedView) => {
    if (await showConfirmDialog({ title: `Delete "${v.name}"?`, confirmLabel: 'Delete', danger: true })) deleteView(v.id)
  }

  const items: MenuItem[] = [
    ...views.map((v) => ({
      label: v.name,
      onClick: () => {
        apply(v.state)
        toast.success(`Switched to ${v.name}`)
      },
    })),
    { label: 'Save current view…', separator: views.length > 0, onClick: save },
    ...(views.length
      ? [
          {
            label: 'Manage',
            children: views.flatMap((v) => [
              { label: `Rename ${v.name}…`, onClick: () => rename(v) },
              { label: `Delete ${v.name}…`, danger: true, onClick: () => remove(v) },
            ]),
          },
        ]
      : []),
  ]

  return (
    <>
      <button
        type="button"
        className={className}
        title="Saved views"
        aria-label="Saved views"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          setPos({ x: r.left, y: r.bottom + 4 })
        }}
      >
        <Bookmark size={16} />
      </button>
      {pos && <ContextMenu x={pos.x} y={pos.y} items={items} onClose={() => setPos(null)} />}
    </>
  )
}
