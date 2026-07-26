// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Pure date formatting driven by the General "date format" setting. UI reads
// these instead of calling toLocaleString directly so the preference applies
// app-wide.

import { getGeneralSettings, type DateFormat } from '../hooks/useGeneralSettings'

function parts(d: Date) {
  return { y: d.getFullYear(), m: d.getMonth() + 1, day: d.getDate() }
}

export function formatDate(ms: number, fmt: DateFormat = getGeneralSettings().dateFormat): string {
  const d = new Date(ms)
  const { y, m, day } = parts(d)
  switch (fmt) {
    case 'iso':
      return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    case 'us':
      return `${m}/${day}/${y}`
    case 'eu':
      return `${day}/${m}/${y}`
    case 'locale':
    default:
      return d.toLocaleDateString()
  }
}

export function formatDateTime(ms: number, fmt: DateFormat = getGeneralSettings().dateFormat): string {
  return `${formatDate(ms, fmt)} ${new Date(ms).toLocaleTimeString()}`
}
