// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// "1 note" / "3 notes" without ad-hoc `n !== 1 ? 's' : ''` hacks. Uses
// Intl.PluralRules so the one/other split follows the locale's rule, and
// Intl.NumberFormat so "1,204 notes" groups digits. Pass the plural form when
// it isn't just singular + "s" ("1 entry" / "2 entries").

const rules = new Intl.PluralRules()
const numbers = new Intl.NumberFormat()

export function plural(count: number, one: string, other = `${one}s`): string {
  return `${numbers.format(count)} ${rules.select(count) === 'one' ? one : other}`
}
