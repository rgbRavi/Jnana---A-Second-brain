// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useNavigate } from 'react-router-dom'
import Notes from './Notes'
import { WorkingNotes } from './working/WorkingNotes'
import { useNotesSubView } from './working/useWorkingLayout'
import { useViewState, setViewState } from '../../hooks/useViewState'
import { backLabelFor } from './backLabel'
import Styles from './NotesView.module.css'

/**
 * The Notes route shell: the **Notes** gallery (browse/filter/sort — the library)
 * or **Working Notes** (tabbed, splittable editor — the desk). The sub-view is
 * switched from the Sidebar (Notes / Working Notes entries) and Ctrl+Shift+E, not
 * from anything on this page; it and the layout persist across restart via the
 * module store. A gallery card opens a read-only peek; the card's pencil (or a
 * wikilink) opens the note in Working Notes (openNoteInWorking).
 */
export default function NotesView() {
  const sub = useNotesSubView()
  const navigate = useNavigate()
  // Where a jump into this desk came from (set in AppLayout's note:navigate
  // handler). Offers a one-click return to that workspace/view.
  const [returnTo] = useViewState<string | null>('notes.returnTo', null)

  const backLabel = returnTo ? backLabelFor(returnTo) : ''

  const goBack = () => {
    const dest = returnTo ?? '/'
    setViewState<string | null>('notes.returnTo', null)
    navigate(dest)
  }

  return (
    <div className={Styles.container}>
      <div className={Styles.body}>
        {/* Keep both mounted? No — the gallery is cheap to remount and Working
            Notes' state lives in the module store, so a plain switch is fine and
            avoids paying for offscreen CM6 editors. */}
        {/* The "back to where you came from" control lives *in* the tab strip
            (see TabStrip): a row of its own above the tabs shifted the whole
            editor down whenever it appeared, and sat on a different surface. */}
        {sub === 'gallery' ? <Notes /> : <WorkingNotes onBack={returnTo ? goBack : undefined} backLabel={backLabel} />}
      </div>
    </div>
  )
}
