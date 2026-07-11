// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// The widget registry — the single place that maps a SectionId to its title,
// icon and component. Adding a future widget = add a SectionId (types.ts) + an
// entry here; the page layout never changes.
import type { ComponentType } from 'react'
import type { SectionId } from './types'
import type { SectionProps } from './sections'
import {
  QuickActionsSection,
  DailySummarySection,
  ContinueLearningSection,
  FavouritesSection,
  InsightsSection,
  GraphSnapshotSection,
  ProjectsSection,
  RecentImportsSection,
  BackgroundTasksSection,
  ActivityHeatmapSection,
} from './sections'

export interface SectionDef {
  title: string
  icon: string
  Component: ComponentType<SectionProps>
  /** Show a refresh control in the card header. */
  refreshable?: boolean
}

export const SECTIONS: Record<SectionId, SectionDef> = {
  quickActions: { title: 'Quick Actions', icon: '⚡', Component: QuickActionsSection },
  dailySummary: { title: 'Daily Summary', icon: '📊', Component: DailySummarySection, refreshable: true },
  continueLearning: { title: 'Continue Learning', icon: '📚', Component: ContinueLearningSection, refreshable: true },
  favourites: { title: 'Favourites', icon: '⭐', Component: FavouritesSection, refreshable: true },
  insights: { title: 'Knowledge Insights', icon: '💡', Component: InsightsSection, refreshable: true },
  graphSnapshot: { title: 'Knowledge Graph', icon: '🕸️', Component: GraphSnapshotSection, refreshable: true },
  projects: { title: 'Projects', icon: '📂', Component: ProjectsSection, refreshable: true },
  recentImports: { title: 'Recent Imports', icon: '📥', Component: RecentImportsSection, refreshable: true },
  backgroundTasks: { title: 'Background Tasks', icon: '⏳', Component: BackgroundTasksSection },
  activityHeatmap: { title: 'Knowledge Activity', icon: '🔥', Component: ActivityHeatmapSection, refreshable: true },
}
