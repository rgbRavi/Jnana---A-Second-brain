// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// The widget registry — the single place that maps a SectionId to its title
// and component. Adding a future widget = add a SectionId (types.ts) + an
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
  Component: ComponentType<SectionProps>
}

export const SECTIONS: Record<SectionId, SectionDef> = {
  quickActions: { title: 'Quick actions', Component: QuickActionsSection },
  dailySummary: { title: 'Today', Component: DailySummarySection },
  continueLearning: { title: 'Also in progress', Component: ContinueLearningSection },
  favourites: { title: 'Favourites', Component: FavouritesSection },
  insights: { title: 'Tidy up', Component: InsightsSection },
  graphSnapshot: { title: 'Knowledge Graph', Component: GraphSnapshotSection },
  projects: { title: 'Projects', Component: ProjectsSection },
  recentImports: { title: 'Recent imports', Component: RecentImportsSection },
  backgroundTasks: { title: 'Background tasks', Component: BackgroundTasksSection },
  activityHeatmap: { title: 'Activity', Component: ActivityHeatmapSection },
}
