// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import type { GroupNode } from './layout'
import { setWorkingActiveGroup } from './useWorkingLayout'
import { useTabDrag } from './tabDrag'
import { TabStrip } from './TabStrip'
import { EditorPane } from './EditorPane'
import Styles from './WorkingNotes.module.css'

export function EditorGroup({
  group,
  isActive,
  multiPane,
  onBack,
  backLabel,
}: {
  group: GroupNode
  isActive: boolean
  multiPane: boolean
  /** Only the leftmost pane gets this — see WorkingNotes. */
  onBack?: () => void
  backLabel?: string
}) {
  const active = group.activeTab && group.tabs.includes(group.activeTab) ? group.activeTab : group.tabs[0]
  const drag = useTabDrag()
  const isDropTarget = drag?.target?.groupId === group.id
  const dropSide = isDropTarget ? drag?.target?.side : undefined

  return (
    <div
      data-group-id={group.id}
      className={`${Styles.group} ${isDropTarget && !dropSide ? Styles.groupDropTarget : ''}`}
      onPointerDownCapture={(e) => {
        // Left press only: a right-click (tab menu) must not move the "last
        // worked in" pane that Split above/below/left/right anchors on.
        if (e.button === 0 && !isActive) setWorkingActiveGroup(group.id)
      }}
    >
      {/* Edge drop preview: the half of this pane the dropped note will take. */}
      {dropSide && <div className={Styles.dropZone} data-side={dropSide} aria-hidden="true" />}
      <TabStrip group={group} multiPane={multiPane} onBack={onBack} backLabel={backLabel} />
      {active ? (
        <EditorPane key={active} noteId={active} />
      ) : (
        <div className={Styles.emptyGroup}>
          <p className={Styles.emptyGroupTitle}>Empty pane</p>
          <span className={Styles.emptyHint}>
            Drag a tab here (or onto a pane edge to split), or open a note — it lands in the focused pane.
          </span>
        </div>
      )}
    </div>
  )
}
