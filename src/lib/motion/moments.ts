// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Moments: app events a motion plugin can *claim* with `ctx.motion.on`. Only one
// claimant plays per moment, so two plugins never animate the same delete on top
// of each other. Who wins: the user's pick in Settings → Appearance → Motion,
// else a third-party plugin over a built-in, else plugin-id order (stable across
// launches, unlike load order, which is parallel).
//
// Module store + localStorage, same pattern as lib/pluginPolicy.ts.

/** Labels for the moments Jnana announces. A plugin may claim any event name;
 *  unknown ones show under their raw name. Add freely, never rename. */
export const MOTION_MOMENTS: Record<string, string> = {
  'note:trashing': 'Deleting a note',
  'note:created': 'Creating a note',
  'composer:saving': 'Saving from the composer',
  'note:restored': 'Restoring a note from Trash',
  'note:favourited': 'Starring or unstarring a note',
  'note:tagged': 'Changing a note’s tags',
  'note:moved': 'Moving a note to a folder',
  'note:opened': 'Opening a note',
  'folder:moved': 'Moving a folder',
  'link:created': 'Linking two notes',
  'annotation:created': 'Annotating a PDF',
  'quiz:completed': 'Finishing a quiz',
  'route:changed': 'Switching views',
  'workspace:changed': 'Switching workspace',
  'vault:changed': 'Switching vault',
  'theme:changed': 'Changing the theme',
}

export const momentLabel = (moment: string) => MOTION_MOMENTS[moment] ?? moment

export interface Claimant {
  pluginId: string
  builtin: boolean
}

/** User's pick for a moment: a plugin id, or 'none' to silence it. */
export type OwnerChoice = string

const KEY = 'jnana.motion.owners.v1'

function load(): Record<string, OwnerChoice> {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as Record<string, OwnerChoice>
  } catch {
    /* malformed or unavailable */
  }
  return {}
}

let owners = load()
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

export function getMomentOwner(moment: string): OwnerChoice | undefined {
  return owners[moment]
}

/** Every pick (new object on each change — useSyncExternalStore-safe). */
export function getMomentOwners(): Readonly<Record<string, OwnerChoice>> {
  return owners
}

/** Pin a moment to a plugin, 'none', or `undefined` to go back to automatic. */
export function setMomentOwner(moment: string, choice: OwnerChoice | undefined): void {
  const next = { ...owners }
  if (choice === undefined) delete next[moment]
  else next[moment] = choice
  owners = next
  try {
    localStorage.setItem(KEY, JSON.stringify(owners))
  } catch {
    /* storage unavailable */
  }
  notify()
}

export function subscribeMoments(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Notify UI subscribers that the set of claims changed (called by the runtime). */
export function momentsChanged(): void {
  notify()
}

/** Who plays a moment, or null for nobody. Pure. */
export function pickOwner(claimants: Claimant[], choice: OwnerChoice | undefined): string | null {
  if (choice === 'none') return null
  if (choice && claimants.some((c) => c.pluginId === choice)) return choice
  const ranked = [...claimants].sort(
    (a, b) => Number(a.builtin) - Number(b.builtin) || a.pluginId.localeCompare(b.pluginId),
  )
  return ranked[0]?.pluginId ?? null
}

/** A real conflict worth telling the user about: two or more third-party
 *  claimants and no pick yet. (Third-party over built-in is expected, not a fight.) */
export function isUnresolvedConflict(claimants: Claimant[], choice: OwnerChoice | undefined): boolean {
  if (choice !== undefined && (choice === 'none' || claimants.some((c) => c.pluginId === choice))) return false
  return claimants.filter((c) => !c.builtin).length >= 2
}

export function __resetMomentsForTests(): void {
  owners = {}
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}
