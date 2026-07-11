// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useNotesContext } from '../../../context/NotesContext'
import type { GroupNode } from './layout'
import {
  setWorkingActiveTab,
  closeWorkingTab,
  splitWorkingGroup,
  closeWorkingGroup,
  moveWorkingTab,
  openNoteInWorking,
} from './useWorkingLayout'
import { setTabDrag, getTabDrag, hitTestDrop } from './tabDrag'
import Styles from './WorkingNotes.module.css'

const DRAG_THRESHOLD = 5

export function TabStrip({ group, multiPane }: { group: GroupNode; multiPane: boolean }) {
  const { notes, create } = useNotesContext()

  const titleFor = (id: string) => notes.find((n) => n.id === id)?.title || 'Untitled'

  const onNewNote = async () => {
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
      setTabDrag({
        noteId: id,
        fromGroup: group.id,
        title: titleFor(id),
        x: ev.clientX,
        y: ev.clientY,
        target: hitTestDrop(ev.clientX, ev.clientY),
      })
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      document.body.style.userSelect = ''
      const st = getTabDrag()
      if (dragging) {
        if (st?.target) moveWorkingTab(id, st.target.groupId, st.target.index)
      } else {
        setWorkingActiveTab(group.id, id) // it was a click, not a drag
      }
      setTabDrag(null)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return (
    <div className={Styles.tabStrip}>
      <div className={Styles.tabs}>
        {group.tabs.map((id) => (
          <div
            key={id}
            data-tab={id}
            className={`${Styles.tab} ${group.activeTab === id ? Styles.tabActive : ''}`}
            onPointerDown={(e) => onTabPointerDown(e, id)}
            onAuxClick={(e) => {
              if (e.button === 1) {
                e.preventDefault()
                closeWorkingTab(id, group.id)
              }
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
              ✕
            </button>
          </div>
        ))}
      </div>
      <div className={Styles.tabActions}>
        <button className={Styles.tabActionBtn} onClick={onNewNote} aria-label="New note" title="New note">
          ＋
        </button>
        <button
          className={Styles.tabActionBtn}
          onClick={() => splitWorkingGroup(group.id, 'row')}
          aria-label="Split right"
          title="Split right"
        >
          ⇥
        </button>
        <button
          className={Styles.tabActionBtn}
          onClick={() => splitWorkingGroup(group.id, 'col')}
          aria-label="Split down"
          title="Split down"
        >
          ⤓
        </button>
        {multiPane && (
          <button
            className={Styles.tabActionBtn}
            onClick={() => closeWorkingGroup(group.id)}
            aria-label="Close pane"
            title="Close pane"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  )
}
