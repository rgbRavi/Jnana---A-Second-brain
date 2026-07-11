// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import Notes from './Notes'
import { WorkingNotes } from './working/WorkingNotes'
import { useNotesSubView, setNotesSubView, useWorkingLayout } from './working/useWorkingLayout'
import { allOpenNoteIds } from './working/layout'
import { WORKING_NOTES_SHORTCUT } from '../../ui/CommandPalette'
import Styles from './NotesView.module.css'

/**
 * The Notes route shell: a segmented control toggling the **Notes** gallery
 * (browse/filter/sort — the library) and **Working Notes** (tabbed, splittable
 * editor — the desk). Sub-view + layout persist across restart via the module
 * store, so this is just a switch. Clicking a gallery card / a wikilink flips
 * the segment to Working Notes automatically (openNoteInWorking).
 */
export default function NotesView() {
  const sub = useNotesSubView()
  const layout = useWorkingLayout()
  const openCount = allOpenNoteIds(layout).length

  return (
    <div className={Styles.container}>
      <div className={Styles.segmentBar}>
        <div className={Styles.segment} role="tablist" aria-label="Notes view">
          <button
            role="tab"
            aria-selected={sub === 'gallery'}
            className={`${Styles.segmentBtn} ${sub === 'gallery' ? Styles.segmentBtnActive : ''}`}
            onClick={() => setNotesSubView('gallery')}
          >
            Notes
          </button>
          <button
            role="tab"
            aria-selected={sub === 'working'}
            className={`${Styles.segmentBtn} ${sub === 'working' ? Styles.segmentBtnActive : ''}`}
            onClick={() => setNotesSubView('working')}
            title={`Working Notes (${WORKING_NOTES_SHORTCUT})`}
          >
            Working Notes
            {openCount > 0 && <span className={Styles.count}>{openCount}</span>}
          </button>
        </div>
      </div>
      <div className={Styles.body}>
        {/* Keep both mounted? No — the gallery is cheap to remount and Working
            Notes' state lives in the module store, so a plain switch is fine and
            avoids paying for offscreen CM6 editors. */}
        {sub === 'gallery' ? <Notes /> : <WorkingNotes />}
      </div>
    </div>
  )
}
