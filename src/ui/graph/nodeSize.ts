// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

export type SizeBy = 'same' | 'links' | 'edited'

const DAY = 86_400_000

/** Radius multiplier from link count: 1 at no links, gently growing, capped. */
export function linksScale(degree: number): number {
  return Math.min(2.2, 1 + 0.5 * Math.log2(1 + Math.max(0, degree)))
}

/** Radius multiplier from recency of last edit. */
export function editedScale(updatedAt: number, now: number): number {
  const age = now - updatedAt
  if (age < DAY) return 1.8
  if (age < 7 * DAY) return 1.4
  if (age < 30 * DAY) return 1.15
  return 1
}

export function sizeScale(mode: SizeBy, degree: number, updatedAt: number, now: number): number {
  return mode === 'links' ? linksScale(degree) : mode === 'edited' ? editedScale(updatedAt, now) : 1
}
