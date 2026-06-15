import { useState, type Ref } from 'react'
import { useNavigate } from 'react-router-dom'
import GridLayout, { useContainerWidth, type Layout } from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import type { Note } from '../../../types'
import { useNotesContext } from '../../../context/NotesContext'
import { setViewState } from '../../../hooks/useViewState'
import { eventBus } from '../../../lib/eventBus'
import { NoteModal } from '../../../ui/NoteModal'
import styles from './Dashboard.module.css'
import { useDashboardData } from './useDashboardData'
import { useDashboardPrefs } from './useDashboardPrefs'
import { SECTIONS } from './registry'
import { DashboardCard } from './components/DashboardCard'
import { HeroSection, type DashboardActions } from './sections'
import { CustomizePanel } from './CustomizePanel'
import { LayoutSwitcher } from './LayoutSwitcher'
import { COLLAPSED_H, GRID_COLS, GRID_MARGIN, ROW_HEIGHT, type GridItem, type SectionId } from './types'

/** Custom resize handle — a comfortable hit area with a themed grip. The same
 *  element RGL wires the resize to, so there's no tiny/mismatched target. */
const resizeHandle = (axis: string, ref: Ref<HTMLElement>) => (
  <span ref={ref as Ref<HTMLSpanElement>} className={`${styles.rgHandle} ${styles[`rgHandle_${axis}`] ?? ''}`} />
)

const sameGrid = (a: GridItem[], b: GridItem[]) =>
  a.length === b.length &&
  a.every((g, i) => {
    const o = b[i]
    return o && g.i === o.i && g.x === o.x && g.y === o.y && g.w === o.w && g.h === o.h
  })

/** The Home dashboard: a hero stat row + a react-grid-layout of widget cards the
 *  user can move (drag the ⠿ grip), resize (any edge/corner) and hide/collapse. */
export function Dashboard() {
  const data = useDashboardData()
  const prefs = useDashboardPrefs()
  const navigate = useNavigate()
  const { update, updateTags } = useNotesContext()
  const [openNote, setOpenNote] = useState<Note | null>(null)
  const [customizing, setCustomizing] = useState(false)
  const { width, containerRef } = useContainerWidth()

  const actions: DashboardActions = {
    openNote: (n) => {
      eventBus.emit('note:opened', n)
      setOpenNote(n)
    },
    goto: (path) => navigate(path),
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
  const isVisible = (id: SectionId) => !prefs.isHidden(id) && !(id === 'backgroundTasks' && data.tasks.length === 0)

  // The layout RGL renders: visible items, with collapsed ones shrunk to header height.
  const layout: Layout = prefs.active.grid
    .filter((g) => isVisible(g.i))
    .map((g) =>
      prefs.isCollapsed(g.i)
        ? { ...g, h: COLLAPSED_H, minH: COLLAPSED_H, maxH: COLLAPSED_H, isResizable: false }
        : g,
    )

  const onLayoutChange = (next: Layout) => {
    const byId = new Map(next.map((it) => [it.i, it]))
    const merged: GridItem[] = prefs.active.grid.map((g) => {
      const n = byId.get(g.i)
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
        icon={def.icon}
        collapsed={prefs.isCollapsed(id)}
        onToggleCollapse={() => prefs.toggleCollapsed(id)}
        onHide={() => prefs.toggleHidden(id)}
        onRefresh={def.refreshable ? data.refresh : undefined}
      >
        <Component data={data} actions={actions} />
      </DashboardCard>
    )
  }

  return (
    <div className={styles.dashboard}>
      <header className={styles.dashboardHeader}>
        <div>
          <h1 className={styles.dashTitle}>Welcome back to Jnana</h1>
          <p className={styles.dashSubtitle}>Your knowledge command center</p>
        </div>
        <div className={styles.dashboardActions}>
          <LayoutSwitcher />
          <button type="button" className={styles.customizeBtn} onClick={() => setCustomizing(true)}>
            <span aria-hidden="true">⚙</span> Customize
          </button>
        </div>
      </header>

      <HeroSection data={data} />

      <div ref={containerRef} className={styles.gridWrap}>
        {width > 0 && (
          <GridLayout
            className={styles.grid}
            width={width}
            layout={layout}
            onLayoutChange={onLayoutChange}
            gridConfig={{ cols: GRID_COLS, rowHeight: ROW_HEIGHT, margin: GRID_MARGIN, containerPadding: [0, 0] }}
            dragConfig={{ enabled: true, handle: '.dashboard-drag-handle', threshold: 6 }}
            resizeConfig={{ enabled: true, handles: ['e', 's', 'se'] as const, handleComponent: resizeHandle }}
          >
            {layout.map((item) => (
              <div key={item.i} className={styles.gridItem}>
                {renderSection(item.i as SectionId)}
              </div>
            ))}
          </GridLayout>
        )}
      </div>

      {customizing && <CustomizePanel onClose={() => setCustomizing(false)} />}

      {openNote && (
        <NoteModal
          note={openNote}
          isOpen
          onClose={() => {
            setOpenNote(null)
            // Reading progress is written on close — refresh so Continue Learning updates.
            data.refresh()
          }}
          onUpdate={update}
          onUpdateTags={updateTags}
        />
      )}
    </div>
  )
}
