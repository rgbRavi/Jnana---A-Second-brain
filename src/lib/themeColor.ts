// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

/**
 * Re-express a CSS colour as an `rgba()` string at the given alpha.
 *
 * Canvas paints take colour *strings*; they can't reference a custom property
 * the way a stylesheet can. So anything drawn on a `<canvas>` has to read the
 * token's value and convert it, or it ends up hardcoding a hex that survives a
 * re-theme unchanged. Pair it with the token read:
 *
 * ```ts
 * const t = getComputedStyle(document.documentElement).getPropertyValue('--text-3').trim()
 * const faint = resolveColor(t, 0.16) ?? FALLBACK
 * ```
 *
 * Pass a resolved colour (hex, `rgb()`, a named colour), not a `var()`
 * reference — the probe is parsed by the browser, and callers re-read on
 * `theme:changed` anyway. Returns `null` when the colour doesn't parse into
 * channels, so callers can keep a fallback.
 */
export function resolveColor(color: string, alpha = 1): string | null {
  const probe = document.createElement('span')
  probe.style.color = color
  document.body.appendChild(probe)
  const computed = getComputedStyle(probe).color
  probe.remove()
  const m = computed.match(/-?\d+(?:\.\d+)?/g)
  return m && m.length >= 3 ? `rgba(${m[0]}, ${m[1]}, ${m[2]}, ${alpha})` : null
}
