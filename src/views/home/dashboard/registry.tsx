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
}

export const SECTIONS: Record<SectionId, SectionDef> = {
  quickActions: { title: 'Quick Actions', icon: '⚡', Component: QuickActionsSection },
  dailySummary: { title: 'Daily Summary', icon: '📊', Component: DailySummarySection },
  continueLearning: { title: 'Continue Learning', icon: '📚', Component: ContinueLearningSection },
  favourites: { title: 'Favourites', icon: '⭐', Component: FavouritesSection },
  insights: { title: 'Knowledge Insights', icon: '💡', Component: InsightsSection },
  graphSnapshot: { title: 'Knowledge Graph', icon: '🕸️', Component: GraphSnapshotSection },
  projects: { title: 'Projects', icon: '📂', Component: ProjectsSection },
  recentImports: { title: 'Recent Imports', icon: '📥', Component: RecentImportsSection },
  backgroundTasks: { title: 'Background Tasks', icon: '⏳', Component: BackgroundTasksSection },
  activityHeatmap: { title: 'Knowledge Activity', icon: '🔥', Component: ActivityHeatmapSection },
}
