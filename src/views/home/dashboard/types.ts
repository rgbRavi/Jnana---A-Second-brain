// Dashboard configuration model. The Home page renders widgets purely from this
// config (columns + hidden + collapsed + sizes), so adding a widget only touches
// the registry + ALL_SECTIONS — never the page layout. Widgets live in 2
// independent columns that pack tightly (masonry-style, no row gaps).

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

export const COLUMN_COUNT = 2

/** Per-section size — body height (px). (`w` kept for back-compat; unused.) */
export interface SectionSize {
  w?: number
  h?: number
}

export interface DashboardLayout {
  id: string
  name: string
  /** Sections per column (independent, tightly-packed lists). */
  columns: SectionId[][]
  /** Sections the user has hidden. */
  hidden: SectionId[]
  /** Sections collapsed to their header. */
  collapsed: SectionId[]
  /** Per-section height (resize). */
  sizes: Partial<Record<SectionId, SectionSize>>
  /** Built-in preset (always present, can't be deleted). */
  builtin?: boolean
}

export interface DashboardPrefs {
  layouts: DashboardLayout[]
  activeLayoutId: string
}

export const DEFAULT_LAYOUT_ID = 'default'

/** Spread sections across COLUMN_COUNT columns round-robin (row-major reading order). */
export function distribute(sections: SectionId[]): SectionId[][] {
  const cols: SectionId[][] = Array.from({ length: COLUMN_COUNT }, () => [])
  sections.forEach((s, i) => cols[i % COLUMN_COUNT].push(s))
  return cols
}

export function makeDefaultLayout(): DashboardLayout {
  return {
    id: DEFAULT_LAYOUT_ID,
    name: 'Default',
    columns: distribute(ALL_SECTIONS),
    hidden: [],
    collapsed: [],
    sizes: {},
    builtin: true,
  }
}

/** A built-in preset layout that shows only `show` (the rest hidden). */
function preset(id: string, name: string, show: SectionId[]): DashboardLayout {
  const shown = new Set(show)
  return {
    id,
    name,
    builtin: true,
    columns: distribute(ALL_SECTIONS),
    hidden: ALL_SECTIONS.filter((s) => !shown.has(s)),
    collapsed: [],
    sizes: {},
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
