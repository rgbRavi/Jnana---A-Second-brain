// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useState } from 'react'
import { ArrowLeft, Plus, PanelRight, PanelBottom, X } from 'lucide-react'
import { useNotesContext } from '../../../context/NotesContext'
import { ContextMenu } from '../../../ui/ContextMenu'
import type { GroupNode } from './layout'
import {
  setWorkingActiveTab,
  closeWorkingTab,
  splitWorkingGroup,
  closeWorkingGroup,
  moveWorkingTab,
  openNoteInWorking,
  splitWorkingBeside,
  closeOtherWorkingTabs,
} from './useWorkingLayout'
import { setTabDrag, getTabDrag, hitTestDrop } from './tabDrag'
import { eventBus } from '../../../lib/eventBus'
import Styles from './WorkingNotes.module.css'

const DRAG_THRESHOLD = 5

export function TabStrip({
  group,
  multiPane,
  onBack,
  backLabel,
}: {
  group: GroupNode
  multiPane: boolean
  /** Return to the view this desk was opened from; only the first strip gets it. */
  onBack?: () => void
  backLabel?: string
}) {
  const { notes, create } = useNotesContext()
  const [tabMenu, setTabMenu] = useState<{ x: number; y: number; noteId: string } | null>(null)

  const titleFor = (id: string) => notes.find((n) => n.id === id)?.title || 'Untitled'

  // A plain note; a blank one can become a canvas from its ⋮ menu (EditorPane).
  const newNote = async () => {
    try {
      const created = await create('', '')
      openNoteInWorking(created.id)
    } catch {
      /* NotesContext surfaces its own errors */
    }
  }

  // Pointer-based drag (HTML5 DnD is swallowed by the Tauri webview). Below the
  // movement threshold it's a click (activate the tab); past it, a drag that
  // drops the tab into the pane under the pointer.
  const onTabPointerDown = (e: React.PointerEvent, id: string) => {
    if (e.button !== 0) return
    const startX = e.clientX
    const startY = e.clientY
    let dragging = false

    const onMove = (ev: PointerEvent) => {
      if (!dragging) {
        if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < DRAG_THRESHOLD) return
        dragging = true
        document.body.style.userSelect = 'none'
      }
      let target = hitTestDrop(ev.clientX, ev.clientY)
      // A pane's only tab can't split against its own pane (a no-op) — don't
      // preview one; dropping there just leaves the tab where it is.
      if (target?.side && target.groupId === group.id && group.tabs.length === 1) {
        target = { groupId: target.groupId, index: target.index }
      }
      setTabDrag({ noteId: id, fromGroup: group.id, title: titleFor(id), x: ev.clientX, y: ev.clientY, target })
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      document.body.style.userSelect = ''
      const st = getTabDrag()
      if (dragging) {
        if (st?.target?.side) splitWorkingBeside(id, st.target.side, st.target.groupId)
        else if (st?.target) moveWorkingTab(id, st.target.groupId, st.target.index)
      } else {
        setWorkingActiveTab(group.id, id) // it was a click, not a drag
      }
      setTabDrag(null)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return (
    <div className={Styles.tabStrip} data-tab-strip>
      {onBack && (
        <button
          className={Styles.stripBack}
          onClick={onBack}
          title={backLabel || 'Back'}
          aria-label={backLabel || 'Back'}
        >
          <ArrowLeft size={15} />
        </button>
      )}
      <div className={Styles.tabs} role="tablist">
        {group.tabs.map((id) => (
          <div
            key={id}
            data-tab={id}
            role="tab"
            tabIndex={0}
            aria-selected={group.activeTab === id}
            className={`${Styles.tab} ${group.activeTab === id ? Styles.tabActive : ''}`}
            onKeyDown={(e) => {
              if (e.target !== e.currentTarget) return // the close button handles its own keys
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                setWorkingActiveTab(group.id, id)
              } else if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
                e.preventDefault()
                const r = e.currentTarget.getBoundingClientRect()
                setTabMenu({ x: r.left, y: r.bottom + 4, noteId: id })
              }
            }}
            onPointerDown={(e) => onTabPointerDown(e, id)}
            onAuxClick={(e) => {
              if (e.button === 1) {
                e.preventDefault()
                closeWorkingTab(id, group.id)
              }
            }}
            onContextMenu={(e) => {
              e.preventDefault()
              setTabMenu({ x: e.clientX, y: e.clientY, noteId: id })
            }}
            title={titleFor(id)}
          >
            <span className={Styles.tabLabel}>{titleFor(id)}</span>
            <button
              className={Styles.tabClose}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation()
                closeWorkingTab(id, group.id)
              }}
              aria-label="Close tab"
              title="Close tab"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
      <div className={Styles.tabActions}>
        <button
          className={Styles.tabActionBtn}
          onClick={() => void newNote()}
          aria-label="New note"
          title="New note"
        >
          <Plus size={16} />
        </button>
        <button
          className={Styles.tabActionBtn}
          onClick={() => splitWorkingGroup(group.id, 'row')}
          aria-label="Split right"
          title="Split right"
        >
          <PanelRight size={16} />
        </button>
        <button
          className={Styles.tabActionBtn}
          onClick={() => splitWorkingGroup(group.id, 'col')}
          aria-label="Split down"
          title="Split down"
        >
          <PanelBottom size={16} />
        </button>
        {multiPane && (
          <button
            className={Styles.tabActionBtn}
            onClick={() => closeWorkingGroup(group.id)}
            aria-label="Close pane"
            title="Close pane"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Splits are relative to the pane last worked in (the active group).
          Opened by right-click, or Shift+F10 / the Menu key on a focused tab. */}
      {tabMenu && (
        <ContextMenu
          x={tabMenu.x}
          y={tabMenu.y}
          items={[
            ...([
              ['Split above', 'above'],
              ['Split below', 'below'],
              ['Split left', 'left'],
              ['Split right', 'right'],
            ] as const).map(([label, side]) => ({
              label,
              onClick: () => splitWorkingBeside(tabMenu.noteId, side),
            })),
            { label: 'Close', separator: true, onClick: () => closeWorkingTab(tabMenu.noteId, group.id) },
            {
              label: 'Close others',
              disabled: group.tabs.length < 2,
              onClick: () => closeOtherWorkingTabs(group.id, tabMenu.noteId),
            },
            {
              label: 'Reveal in file explorer',
              separator: true,
              onClick: () => eventBus.emit('explorer:reveal', { noteId: tabMenu.noteId }),
            },
          ]}
          onClose={() => setTabMenu(null)}
        />
      )}
    </div>
  )
}
