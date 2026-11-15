// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { ScopeBar } from '../ScopeBar'

/** Compact inline "from: Entire vault" scope picker for the composer status row.
 *  Writes the shared AI-scope store (same one the Search view uses). */
export function GroundingScope() {
  return <ScopeBar compact />
}
