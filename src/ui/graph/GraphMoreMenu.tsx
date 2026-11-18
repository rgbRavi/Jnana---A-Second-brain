// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useState } from 'react'
import { MoreHorizontal } from 'lucide-react'
import { ContextMenu, type MenuItem } from '../ContextMenu'
import { showChoiceDialog, showConfirmDialog, showPromptDialog } from '../../lib/dialog'
import { toast } from '../../lib/toast'
import type { SpotlightKind } from '../../lib/graphSpotlight'
import { deleteView, renameView, saveView, useSavedViews, type GraphViewSnapshot, type SavedView } from './savedViews'

interface Props {
  /** Button class, so it matches the toolbar it sits in. */
  className?: string
  spotlight: SpotlightKind | null
  onSpotlight: (kind: SpotlightKind | null) => void
  onExport: () => void
  timelineOpen: boolean
  onTimeline: () => void
  capture: () => GraphViewSnapshot
  apply: (s: GraphViewSnapshot) => void
}

/** The toolbar's "⋯" menu: the less-used graph actions, kept out of the way. */
export function GraphMoreMenu({ className, spotlight, onSpotlight, onExport, timelineOpen, onTimeline, capture, apply }: Props) {
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
  /** One level of submenu only, so rename/delete ask which view instead of nesting. */
  const pick = async (title: string): Promise<SavedView | undefined> => {
    if (views.length === 1) return views[0]
    const id = await showChoiceDialog({ title, options: views.map((v) => ({ value: v.id, label: v.name })) })
    return views.find((v) => v.id === id)
  }
  const rename = async () => {
    const v = await pick('Rename which view?')
    if (!v) return
    const name = (await showPromptDialog({ title: 'Rename view', defaultValue: v.name, confirmLabel: 'Rename' }))?.trim()
    if (!name || name === v.name) return
    if (views.some((o) => o.id !== v.id && o.name.toLowerCase() === name.toLowerCase())) {
      toast.error(`A view named "${name}" already exists`)
      return
    }
    renameView(v.id, name)
  }
  const remove = async () => {
    const v = await pick('Delete which view?')
    if (v && (await showConfirmDialog({ title: `Delete "${v.name}"?`, confirmLabel: 'Delete', danger: true }))) deleteView(v.id)
  }

  const viewItems: MenuItem[] = [
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
          { label: 'Rename a view…', onClick: rename },
          { label: 'Delete a view…', danger: true, onClick: remove },
        ]
      : []),
  ]

  const items: MenuItem[] = [
    {
      label: 'Suggest links',
      checked: spotlight === 'suggested',
      onClick: () => onSpotlight(spotlight === 'suggested' ? null : 'suggested'),
    },
    {
      label: 'Highlight unlinked notes',
      checked: spotlight === 'orphans',
      onClick: () => onSpotlight(spotlight === 'orphans' ? null : 'orphans'),
    },
    { label: 'Timeline', checked: timelineOpen, onClick: onTimeline },
    { label: 'Saved views', separator: true, children: viewItems },
    { label: 'Export graph as image…', onClick: onExport },
  ]

  return (
    <>
      <button
        type="button"
        className={className}
        title="More graph actions"
        aria-label="More graph actions"
        aria-haspopup="menu"
        aria-expanded={!!pos}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          setPos({ x: r.left, y: r.bottom + 4 })
        }}
      >
        <MoreHorizontal size={15} />
      </button>
      {pos && <ContextMenu x={pos.x} y={pos.y} items={items} onClose={() => setPos(null)} />}
    </>
  )
}
