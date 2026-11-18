// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useRef, useState } from 'react'
import { CircleAlert, RotateCw, SlidersHorizontal } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import type { Note } from '../../../types'
import { useNotesContext } from '../../../context/NotesContext'
import { setViewState } from '../../../hooks/useViewState'
import { eventBus } from '../../../lib/eventBus'
import { setGraphSpotlight } from '../../../lib/graphSpotlight'
import { toast, updateToast } from '../../../lib/toast'
import { log } from '../../../lib/logger'
import { indexNotes, loadAiConfig } from '../../../core/ai'
import { setNotesSubView } from '../../notes/working/useWorkingLayout'
import { NOTES_PREFS_KEY, setNotesFilter } from '../../notes/useNotesViewPrefs'
import { NoteModal } from '../../../ui/NoteModal'
import styles from './Dashboard.module.css'
import { useDashboardData } from './useDashboardData'
import { useDashboardPrefs } from './useDashboardPrefs'
import { SECTIONS } from './registry'
import { DashboardCard } from './components/DashboardCard'
import { DashboardGrid } from './components/DashboardGrid'
import { HeroSection, type DashboardActions } from './sections'
import { CustomizePanel } from './CustomizePanel'
import { LayoutSwitcher } from './LayoutSwitcher'
import { COLLAPSED_H, GRID_COLS, GRID_MARGIN, ROW_HEIGHT, type GridItem, type SectionId } from './types'

/** "a", "a and b", "a, b and c" */
const listJoin = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`)

const sameGrid = (a: GridItem[], b: GridItem[]) =>
  a.length === b.length &&
  a.every((g, i) => {
    const o = b[i]
    return o && g.i === o.i && g.x === o.x && g.y === o.y && g.w === o.w && g.h === o.h
  })

/** The Home dashboard: a resume row + a grid of widget cards the user can
 *  move (drag the grip, or arrow keys on it), resize (any edge/corner, or
 *  Shift+arrows) and hide/collapse. */
export function Dashboard() {
  const data = useDashboardData()
  const prefs = useDashboardPrefs()
  const navigate = useNavigate()
  const { update, updateTags } = useNotesContext()
  const [openNote, setOpenNote] = useState<Note | null>(null)
  // One indexing pass at a time — the tile stays clickable while it runs.
  const indexingRef = useRef(false)
  const [customizing, setCustomizing] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  // Manual refresh: keep the icon spinning at least briefly so a fast local
  // refresh still reads as "done" rather than as a click that did nothing.
  const manualRefresh = () => {
    if (refreshing) return
    setRefreshing(true)
    void Promise.all([data.refresh(), new Promise((r) => setTimeout(r, 500))]).finally(() => setRefreshing(false))
  }

  const actions: DashboardActions = {
    openNote: (n) => {
      eventBus.emit('note:opened', n)
      setOpenNote(n)
    },
    goto: (path) => navigate(path),
    showUntagged: () => {
      // Replace the status filter outright — arriving from the tile should show
      // exactly the untagged notes, not intersect with whatever was set before.
      setNotesFilter(NOTES_PREFS_KEY, { status: ['untagged'] })
      // /notes remembers whichever sub-view was last open, so ask for the
      // gallery explicitly — the filtered list lives there, not on the desk.
      setNotesSubView('gallery')
      navigate('/notes')
    },
    indexStale: () => {
      void (async () => {
        if (indexingRef.current) return
        const pending = data.staleNotes
        if (pending.length === 0) {
          toast.info('Everything in this vault is already indexed.')
          return
        }
        const config = await loadAiConfig().catch(() => null)
        if (!config?.enabled) {
          toast.info('Turn on AI in Settings → AI setup to index your notes.')
          return
        }
        indexingRef.current = true
        const id = toast.progress(`Indexing ${pending.length} note${pending.length === 1 ? '' : 's'}…`)
        try {
          const { indexed, failed, firstError } = await indexNotes(pending, config, (done, total) =>
            updateToast(id, { progress: done / total, message: `Indexing ${done} of ${total}…` }),
          )
          // Embedding calls fail per note (bad model, provider down), so report
          // what actually landed rather than assuming the batch worked.
          updateToast(id, {
            message:
              failed === 0
                ? `Indexed ${indexed} note${indexed === 1 ? '' : 's'}.`
                : indexed === 0
                  ? `Indexing failed: ${firstError ?? 'check your embedding provider'}`
                  : `Indexed ${indexed}, ${failed} failed: ${firstError ?? 'see the log'}`,
            variant: failed === 0 ? 'success' : 'error',
            progress: 1,
            duration: failed === 0 ? 3000 : 8000,
          })
        } catch (err) {
          log.error('Dashboard indexing failed', err)
          updateToast(id, { message: 'Indexing failed — check your AI settings.', variant: 'error', duration: 5000 })
        } finally {
          indexingRef.current = false
          void data.refresh()
        }
      })()
    },
    showOrphans: () => {
      setGraphSpotlight('orphans')
      navigate('/graph')
    },
    showSuggestedLinks: () => {
      setGraphSpotlight('suggested')
      navigate('/graph')
    },
    newNote: () => setViewState('notes.composer.state', 'expanded'),
    recordAudio: () => {
      setViewState('notes.composer.state', 'expanded')
      eventBus.emit('composer:record', null)
    },
    importFile: () => {
      setViewState('notes.composer.state', 'expanded')
      eventBus.emit('composer:import', null)
    },
  }

  // background-tasks auto-hides when nothing's running.
  // Auto-hide cards with nothing to show: background tasks when idle, and
  // "Also in progress" when the hero already covers the only in-progress note.
  const isVisible = (id: SectionId) =>
    !prefs.isHidden(id) &&
    !(id === 'backgroundTasks' && data.tasks.length === 0) &&
    !(id === 'continueLearning' && !data.loading && data.continueLearning.length <= 1)

  // Visible items, with collapsed ones shrunk to header height.
  const layout: GridItem[] = prefs.active.grid
    .filter((g) => isVisible(g.i))
    .map((g) => (prefs.isCollapsed(g.i) ? { ...g, h: COLLAPSED_H } : g))

  const onLayoutChange = (next: GridItem[]) => {
    const byId = new Map(next.map((it) => [it.i, it]))
    const merged: GridItem[] = prefs.active.grid.map((g) => {
      const n = byId.get(g.i as SectionId)
      if (!n) return g // hidden — keep its stored position
      // Preserve the expanded height for collapsed cards.
      const h = prefs.isCollapsed(g.i) ? g.h : n.h
      return { ...g, x: n.x, y: n.y, w: n.w, h }
    })
    if (!sameGrid(merged, prefs.active.grid)) prefs.setGrid(merged)
  }

  const renderSection = (id: SectionId) => {
    const def = SECTIONS[id]
    const Component = def.Component
    return (
      <DashboardCard
        title={def.title}
        collapsed={prefs.isCollapsed(id)}
        onToggleCollapse={() => prefs.toggleCollapsed(id)}
      >
        <Component data={data} actions={actions} />
      </DashboardCard>
    )
  }

  return (
    <div className={styles.dashboard}>
      <header className={styles.dashboardHeader}>
        <div>
          <h1 className={styles.dashTitle}>Welcome back</h1>
          <p className={styles.dashSubtitle}>
            {data.totals.notes} note{data.totals.notes === 1 ? '' : 's'} · {data.totals.connections} link{data.totals.connections === 1 ? '' : 's'}
          </p>
        </div>
        <div className={styles.dashboardActions}>
          <button type="button" className={styles.iconBtn} title="Refresh" aria-label="Refresh" aria-busy={refreshing} onClick={manualRefresh}>
            <RotateCw size={16} aria-hidden="true" />
          </button>
          <LayoutSwitcher />
          <button type="button" className={styles.iconBtn} title="Customize" aria-label="Customize" onClick={() => setCustomizing(true)}>
            <SlidersHorizontal size={16} aria-hidden="true" />
          </button>
        </div>
      </header>

      {data.failedParts.length > 0 && (
        <p className={styles.partialNotice} role="status">
          <CircleAlert size={15} aria-hidden="true" className={styles.partialIcon} />
          Couldn't load {listJoin(data.failedParts)}.
          <button type="button" className={styles.linkBtn} onClick={manualRefresh}>
            Try again
          </button>
        </p>
      )}

      <HeroSection data={data} actions={actions} />

      <DashboardGrid
        items={layout}
        cols={GRID_COLS}
        rowHeight={ROW_HEIGHT}
        margin={GRID_MARGIN}
        isResizable={(id) => !prefs.isCollapsed(id as SectionId)}
        dragHandleSelector=".dashboard-drag-handle"
        onChange={onLayoutChange}
        renderItem={(id) => renderSection(id as SectionId)}
        itemLabel={(id) => SECTIONS[id as SectionId]?.title ?? id}
      />

      {customizing && <CustomizePanel onClose={() => setCustomizing(false)} />}

      {openNote && (
        <NoteModal
          note={openNote}
          isOpen
          onClose={() => {
            setOpenNote(null)
            // Reading progress is written on close — refresh so Continue Learning updates.
            void data.refresh()
          }}
          onUpdate={update}
          onUpdateTags={updateTags}
        />
      )}
    </div>
  )
}
