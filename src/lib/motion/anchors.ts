// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Named UI regions motion plugins can target. CSS Module class names are hashed
// per build, so a selector on them breaks next release; these names are the
// contract instead. Add freely — never rename or remove one (anchors.test.ts
// fails if JSX stops rendering a listed name).

export const MOTION_ANCHORS = {
  sidebar: 'The left sidebar.',
  'sidebar.notes': 'The sidebar "Notes" link.',
  main: 'The main content area, right of the sidebar.',
  composer: 'The note composer panel ("That\'s my note").',
  trash: 'The "Open Trash" button in the Notes toolbar (Notes gallery only).',
  note: 'A note on screen — gallery card, folder-tree row or open peek. Key = note id.',
} as const

export type MotionAnchor = keyof typeof MOTION_ANCHORS

// Word chars, dot, colon, dash — enough for names and uuids, nothing that can
// close the attribute selector.
const SAFE = /^[\w.:-]{1,128}$/

export function anchorSelector(name: string, key?: string): string | null {
  if (!SAFE.test(name) || (key !== undefined && !SAFE.test(key))) return null
  return key === undefined
    ? `[data-anchor="${name}"]`
    : `[data-anchor="${name}"][data-anchor-key="${key}"]`
}

function hasBox(el: Element): boolean {
  const r = el.getBoundingClientRect()
  return r.width > 0 && r.height > 0
}

/** Every element carrying the anchor, on-screen ones first. */
export function findAnchors(name: string, key?: string): HTMLElement[] {
  const sel = anchorSelector(name, key)
  if (!sel) return []
  const all = Array.from(document.querySelectorAll<HTMLElement>(sel))
  return [...all.filter(hasBox), ...all.filter((el) => !hasBox(el))]
}

export function findAnchor(name: string, key?: string): HTMLElement | null {
  return findAnchors(name, key)[0] ?? null
}
