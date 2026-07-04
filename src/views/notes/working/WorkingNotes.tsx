import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useNotesContext } from '../../../context/NotesContext'
import type { PaneNode } from './layout'
import { findGroup, allGroups } from './layout'
import {
  useWorkingLayout,
  reconcileWorking,
  closeWorkingTab,
  splitWorkingGroup,
  getWorkingLayout,
} from './useWorkingLayout'
import { useTabDrag } from './tabDrag'
import { EditorGroup } from './EditorGroup'
import { SplitContainer } from './SplitContainer'
import Styles from './WorkingNotes.module.css'

/** Floating label that follows the pointer during a tab drag. `pointer-events:
 *  none` (in CSS) so it doesn't block `elementFromPoint` hit-testing. */
function TabDragGhost() {
  const drag = useTabDrag()
  if (!drag) return null
  return createPortal(
    <div className={Styles.ghost} style={{ left: drag.x + 12, top: drag.y + 12 }}>
      {drag.title || 'Untitled'}
    </div>,
    document.body,
  )
}

function renderNode(node: PaneNode, activeGroup: string | null, multiPane: boolean): ReactNode {
  if (node.kind === 'group') {
    return (
      <EditorGroup
        key={node.id}
        group={node}
        isActive={node.id === activeGroup}
        multiPane={multiPane}
      />
    )
  }
  return (
    <SplitContainer
      key={node.id}
      split={node}
      renderNode={(child) => renderNode(child, activeGroup, multiPane)}
    />
  )
}

/**
 * The tabbed, splittable editor surface — the "desk". Renders the layout tree
 * recursively; reconciles it against the live note set on mount and whenever a
 * note is deleted so tabs pointing at gone notes disappear.
 */
export function WorkingNotes() {
  const { notes, loading } = useNotesContext()
  const layout = useWorkingLayout()

  // Reconcile once notes have loaded, and on delete.
  useEffect(() => {
    if (loading) return
    reconcileWorking(new Set(notes.map((n) => n.id)))
  }, [loading, notes])

  // Keyboard: Ctrl/⌘-W closes the active tab; Ctrl/⌘-\ splits the active group.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      const l = getWorkingLayout()
      if (!l.activeGroup) return
      const g = findGroup(l.root, l.activeGroup)
      if (!g) return
      if (e.key === 'w' || e.key === 'W') {
        if (g.activeTab) {
          e.preventDefault()
          closeWorkingTab(g.activeTab, g.id)
        }
      } else if (e.key === '\\') {
        e.preventDefault()
        splitWorkingGroup(g.id, e.shiftKey ? 'col' : 'row')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!layout.root) {
    return (
      <div className={Styles.empty}>
        <div className={Styles.emptyInner}>
          <p className={Styles.emptyTitle}>No open notes</p>
          <p className={Styles.emptySub}>
            Open a note from the <strong>Notes</strong> gallery, search, or a wikilink to start editing
            here. Tabs and splits are restored when you reopen the app.
          </p>
        </div>
      </div>
    )
  }

  const multiPane = allGroups(layout.root).length > 1
  return (
    <div className={Styles.surface}>
      {renderNode(layout.root, layout.activeGroup, multiPane)}
      <TabDragGhost />
    </div>
  )
}
