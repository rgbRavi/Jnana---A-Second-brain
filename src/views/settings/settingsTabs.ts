// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

export type SettingsTab = 'general' | 'composer' | 'appearance' | 'ai' | 'advanced-ai' | 'data' | 'plugins' | 'about'

const SETTINGS_TAB_PATHS: Record<string, SettingsTab> = {
  '/settings': 'ai',
  '/settings/general': 'general',
  '/settings/composer': 'composer',
  '/settings/appearance': 'appearance',
  '/settings/ai': 'ai',
  '/settings/advanced-ai': 'advanced-ai',
  '/settings/data': 'data',
  '/settings/plugins': 'plugins',
  '/settings/about': 'about',
}

export function resolveSettingsTab(pathname: string | undefined): SettingsTab {
  const normalized = (pathname ?? '/settings').replace(/\/+$/, '') || '/settings'
  return SETTINGS_TAB_PATHS[normalized] ?? 'ai'
}
