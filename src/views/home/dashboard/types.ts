// Dashboard configuration model. The Home page renders widgets purely from this
// config (order + hidden + collapsed), so adding a widget only touches the
// registry + ALL_SECTIONS — never the page layout.

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

/** Per-section size: column span (1 = half, 2 = full) + optional body height (px). */
export interface SectionSize {
  w?: number
  h?: number
}

export interface DashboardLayout {
  id: string
  name: string
  /** Render order of sections. */
  order: SectionId[]
  /** Sections the user has hidden. */
  hidden: SectionId[]
  /** Sections collapsed to their header. */
  collapsed: SectionId[]
  /** Per-section width span + height (resize). */
  sizes: Partial<Record<SectionId, SectionSize>>
  /** Built-in preset (always present, can't be deleted). */
  builtin?: boolean
}

export interface DashboardPrefs {
  layouts: DashboardLayout[]
  activeLayoutId: string
}

export const DEFAULT_LAYOUT_ID = 'default'

export function makeDefaultLayout(): DashboardLayout {
  return { id: DEFAULT_LAYOUT_ID, name: 'Default', order: [...ALL_SECTIONS], hidden: [], collapsed: [], sizes: {}, builtin: true }
}

/** A built-in preset layout that shows only `show` (the rest hidden). */
function preset(id: string, name: string, show: SectionId[]): DashboardLayout {
  const shown = new Set(show)
  return {
    id,
    name,
    builtin: true,
    order: [...ALL_SECTIONS],
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
