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
}: {
  group: GroupNode
  isActive: boolean
  multiPane: boolean
}) {
  const active = group.activeTab && group.tabs.includes(group.activeTab) ? group.activeTab : group.tabs[0]
  const drag = useTabDrag()
  const isDropTarget = drag?.target?.groupId === group.id

  return (
    <div
      data-group-id={group.id}
      className={`${Styles.group} ${isActive ? Styles.groupActive : ''} ${isDropTarget ? Styles.groupDropTarget : ''}`}
      onPointerDownCapture={() => {
        if (!isActive) setWorkingActiveGroup(group.id)
      }}
    >
      <TabStrip group={group} multiPane={multiPane} />
      {active ? (
        <EditorPane key={active} noteId={active} />
      ) : (
        <div className={Styles.emptyGroup}>
          <p className={Styles.emptyGroupTitle}>Empty pane</p>
          <span className={Styles.emptyHint}>
            Drag a tab here, or open a note — it lands in the focused pane.
          </span>
        </div>
      )}
    </div>
  )
}
