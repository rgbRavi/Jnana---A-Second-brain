// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

/** Human name for a route the Working Notes "back" control returns to. */
export function routeName(path: string): string {
  if (path === '/') return 'Home'
  if (path === '/graph') return 'Graph'
  if (path === '/ai') return 'AI'
  if (path === '/trash') return 'Trash'
  if (path === '/workspaces') return 'Workspaces'
  if (path.startsWith('/workspaces/')) return 'workspace'
  if (path === '/settings' || path.startsWith('/settings/')) return 'Settings'
  return 'previous page'
}

export const backLabelFor = (path: string) => `Back to ${routeName(path)}`
