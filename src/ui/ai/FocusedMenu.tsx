// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { Bot, FileSearch, GraduationCap, Power } from 'lucide-react'
import type { FocusState, FocusAction } from '../../core/ai/focusedScope'
import { openFocusPanel, closeFocusPanel } from '../../lib/activeFocus'
import { openRailPanel } from '../rail/RightRail'
import { MenuRow } from './ComposerMenu'
import styles from './Ai.module.css'

export const FOCUSED_PANEL_ID = 'focused-scope'

export const actionMeta: Record<FocusAction, { icon: React.ReactNode; label: string; hint: string }> = {
  analyze: { icon: <FileSearch size={15} />, label: 'Analyze', hint: 'Summary, key concepts, weak spots' },
  ask: { icon: <Bot size={15} />, label: 'Ask notes', hint: 'Grounded Q&A over the scope' },
  quiz: { icon: <GraduationCap size={15} />, label: 'Quiz', hint: 'Generate a graded quiz' },
}

/**
 * Content of the composer's "Focused" menu: pick a grounded action (Analyze /
 * Ask / Quiz). Selecting one docks that action's scope options in the right rail
 * (FocusedScopePanel) instead of a floating flyout; confirming there arms the
 * shared Send. A "Turn off focused" row disarms.
 */
export function FocusedContent({
  focus,
  setFocus,
  close,
}: {
  focus: FocusState
  setFocus: (updater: (f: FocusState) => FocusState) => void
  close: () => void
}) {
  // Selecting an action arms it immediately and docks the scope editor; the main
  // composer Send is the single run button (no separate arm/run in the panel).
  const launch = (action: FocusAction) => {
    setFocus((f) => ({ ...f, action }))
    openFocusPanel()
    openRailPanel(FOCUSED_PANEL_ID)
    close()
  }
  const turnOff = () => {
    setFocus((f) => ({ ...f, action: null }))
    closeFocusPanel()
    close()
  }

  return (
    <div>
      <div className={styles.cSectionLabel}>Ground the next message in your notes</div>
      {(Object.keys(actionMeta) as FocusAction[]).map((a) => (
        <MenuRow
          key={a}
          icon={actionMeta[a].icon}
          label={actionMeta[a].label}
          hint={actionMeta[a].hint}
          active={focus.action === a}
          trailing={<span style={{ fontSize: '0.85rem' }}>▸</span>}
          onClick={() => launch(a)}
        />
      ))}

      {focus.action && (
        <>
          <div className={styles.cDivider} />
          <MenuRow icon={<Power size={15} />} label="Turn off focused" onClick={turnOff} />
        </>
      )}
    </div>
  )
}
