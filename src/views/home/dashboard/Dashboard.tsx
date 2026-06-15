import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import type { Note } from '../../../types'
import { useNotesContext } from '../../../context/NotesContext'
import { setViewState } from '../../../hooks/useViewState'
import { eventBus } from '../../../lib/eventBus'
import { NoteModal } from '../../../ui/NoteModal'
import styles from './Dashboard.module.css'
import { useDashboardData } from './useDashboardData'
import { useDashboardPrefs } from './useDashboardPrefs'
import { SECTIONS } from './registry'
import { SortableSection } from './components/SortableSection'
import { Column } from './components/Column'
import { HeroSection, type DashboardActions } from './sections'
import { CustomizePanel } from './CustomizePanel'
import { LayoutSwitcher } from './LayoutSwitcher'
import type { SectionId } from './types'

const columnIndexOf = (droppableId: string): number | null => {
  const m = /^column-(\d+)$/.exec(droppableId)
  return m ? Number(m[1]) : null
}

/** The Home dashboard: a hero stat row + config-driven widget sections, each
 *  collapsible/hideable, rendered from the user's saved preferences. */
export function Dashboard() {
  const data = useDashboardData()
  const prefs = useDashboardPrefs()
  const navigate = useNavigate()
  const { update, updateTags } = useNotesContext()
  const [openNote, setOpenNote] = useState<Note | null>(null)
  const [customizing, setCustomizing] = useState(false)
  const [activeId, setActiveId] = useState<SectionId | null>(null)

  const actions: DashboardActions = useMemo(
    () => ({
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
    }),
    [navigate],
  )

  // background-tasks auto-hides when nothing's running.
  const isVisible = (id: SectionId) => !prefs.isHidden(id) && !(id === 'backgroundTasks' && data.tasks.length === 0)
  const columns = prefs.active.columns

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null)
    const { active, over } = e
    if (!over) return
    const dragged = active.id as SectionId
    const overId = String(over.id)
    if (dragged === overId) return

    const cols = columns.map((c) => [...c])
    const fromCol = cols.findIndex((c) => c.includes(dragged))
    if (fromCol === -1) return
    const overCol = columnIndexOf(overId)
    const toCol = overCol != null ? overCol : cols.findIndex((c) => c.includes(overId as SectionId))
    if (toCol === -1) return

    if (fromCol === toCol && overCol == null) {
      const oldIndex = cols[fromCol].indexOf(dragged)
      const newIndex = cols[fromCol].indexOf(overId as SectionId)
      if (oldIndex !== newIndex && newIndex !== -1) cols[fromCol] = arrayMove(cols[fromCol], oldIndex, newIndex)
    } else {
      cols[fromCol].splice(cols[fromCol].indexOf(dragged), 1)
      let insertAt = overCol != null ? cols[toCol].length : cols[toCol].indexOf(overId as SectionId)
      if (insertAt === -1) insertAt = cols[toCol].length
      cols[toCol].splice(insertAt, 0, dragged)
    }
    prefs.setColumns(cols)
  }

  const renderSection = (id: SectionId) => {
    const def = SECTIONS[id]
    const Component = def.Component
    const size = prefs.getSize(id)
    return (
      <SortableSection
        key={id}
        id={id}
        title={def.title}
        icon={def.icon}
        collapsed={prefs.isCollapsed(id)}
        onToggleCollapse={() => prefs.toggleCollapsed(id)}
        onHide={() => prefs.toggleHidden(id)}
        onRefresh={def.refreshable ? data.refresh : undefined}
        height={size.h}
        onResizeHeight={(h) => prefs.setHeight(id, h)}
      >
        <Component data={data} actions={actions} />
      </SortableSection>
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

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={(e: DragStartEvent) => setActiveId(e.active.id as SectionId)}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <div className={styles.sections}>
          {columns.map((col, i) => {
            const colVisible = col.filter(isVisible)
            return (
              <Column key={i} id={`column-${i}`} items={colVisible}>
                {colVisible.map(renderSection)}
              </Column>
            )
          })}
        </div>
        <DragOverlay>
          {activeId ? (
            <div className={styles.dragOverlay}>
              <span aria-hidden="true">{SECTIONS[activeId].icon}</span> {SECTIONS[activeId].title}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

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
