// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Module-level family → CSS-stack map for installed fonts, so the pure
// (React-free) fontStack() in core/themes/apply.ts can resolve a Theme.fonts id
// that isn't in the built-in catalog. useInstalledFonts keeps it in sync; it's
// empty at boot (installed families fall back until the store hydrates).

import type { InstalledFont } from '../fonts'
import { familyStack } from './loadFaces'

let stacks = new Map<string, string>()

export function setInstalledStacks(fonts: InstalledFont[]): void {
  stacks = new Map(fonts.map((f) => [f.family, familyStack(f)]))
}

/** CSS stack for an installed family id, or undefined if not installed. */
export function installedStack(id: string): string | undefined {
  return stacks.get(id)
}
