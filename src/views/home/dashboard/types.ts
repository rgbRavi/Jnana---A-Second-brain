// Dashboard configuration model. The Home page renders widgets from this config
// via react-grid-layout: each widget has a grid position+size (x,y,w,h) the user
// can drag to move and drag any edge/corner to resize; the grid auto-compacts.

export type SectionId =
  | 'quickActions'
  | 'dailySummary'
  | 'continueLearning'
  | 'favourites'
  | 'insights'
  | 'graphSnapshot'
  | 'projects'
  | 'recentImports'
  | 'backgroundTasks'
  | 'activityHeatmap'

/** Canonical section set + default order. New widgets are appended here. */
export const ALL_SECTIONS: SectionId[] = [
  'quickActions',
  'dailySummary',
  'continueLearning',
  'favourites',
  'insights',
  'graphSnapshot',
  'projects',
  'recentImports',
  'activityHeatmap',
  'backgroundTasks',
]

export const GRID_COLS = 12
export const ROW_HEIGHT = 20
export const GRID_MARGIN: [number, number] = [14, 10]
/** Height (rows) a collapsed card occupies — just its header. */
export const COLLAPSED_H = 2

/** One widget's grid placement (units, not pixels — matches RGL LayoutItem). */
export interface GridItem {
  i: SectionId
  x: number
  y: number
  w: number
  h: number
  minW?: number
  minH?: number
}

export interface DashboardLayout {
  id: string
  name: string
  /** Grid placement for every section (hidden ones keep a position for when shown). */
  grid: GridItem[]
  hidden: SectionId[]
  collapsed: SectionId[]
  builtin?: boolean
}

export interface DashboardPrefs {
  layouts: DashboardLayout[]
  activeLayoutId: string
}

export const DEFAULT_LAYOUT_ID = 'default'

/** Sensible default heights (grid rows) per widget. */
const DEFAULT_H: Record<SectionId, number> = {
  quickActions: 4,
  dailySummary: 4,
  continueLearning: 8,
  favourites: 7,
  insights: 6,
  graphSnapshot: 15,
  projects: 7,
  recentImports: 7,
  activityHeatmap: 5,
  backgroundTasks: 4,
}
const MIN_H: Partial<Record<SectionId, number>> = { graphSnapshot: 6 }

/** Lay all sections out in two half-width columns, packed shortest-column-first. */
export function defaultGrid(sections: SectionId[] = ALL_SECTIONS): GridItem[] {
  const colH = [0, 0]
  const half = GRID_COLS / 2
  return sections.map((id) => {
    const h = DEFAULT_H[id] ?? 5
    const col = colH[0] <= colH[1] ? 0 : 1
    const item: GridItem = { i: id, x: col * half, y: colH[col], w: half, h, minW: 3, minH: MIN_H[id] ?? 3 }
    colH[col] += h
    return item
  })
}

export function makeDefaultLayout(): DashboardLayout {
  return { id: DEFAULT_LAYOUT_ID, name: 'Default', grid: defaultGrid(), hidden: [], collapsed: [], builtin: true }
}

/** A built-in preset layout that shows only `show` (the rest hidden). */
function preset(id: string, name: string, show: SectionId[]): DashboardLayout {
  const shown = new Set(show)
  return {
    id,
    name,
    builtin: true,
    grid: defaultGrid(),
    hidden: ALL_SECTIONS.filter((s) => !shown.has(s)),
    collapsed: [],
  }
}

/** Built-in layouts for the switcher — different workflows surface different widgets. */
export const PRESET_LAYOUTS: DashboardLayout[] = [
  makeDefaultLayout(),
  preset('student', 'Student', ['quickActions', 'dailySummary', 'continueLearning', 'favourites', 'insights', 'activityHeatmap']),
  preset('research', 'Research', ['quickActions', 'graphSnapshot', 'insights', 'projects', 'recentImports', 'continueLearning']),
  preset('writing', 'Writing', ['quickActions', 'continueLearning', 'favourites', 'dailySummary', 'recentImports']),
  preset('minimal', 'Minimal', ['quickActions', 'dailySummary', 'continueLearning']),
]
