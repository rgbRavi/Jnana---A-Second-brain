// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Turns installed-font metadata into @font-face rules pointing at the jnana-asset://
// protocol (already CSP-allowed via default-src), injected into a single <style>
// element. Pure `buildFaceCss` is unit-testable; `applyFaceCss` is the DOM side.

import type { InstalledFont } from '../fonts'

const STYLE_ID = 'jnana-user-fonts'

const GENERIC_CSS: Record<string, string> = { sans: 'sans-serif', serif: 'serif', mono: 'monospace' }

/** CSS font-family stack for an installed family: `'Family', <generic fallback>`. */
export function familyStack(font: InstalledFont): string {
  const generic = GENERIC_CSS[font.generic] ?? 'sans-serif'
  // Quote the family so multi-word names resolve; the fallback keeps text readable
  // before the face loads (and if the file is ever missing).
  return `'${font.family.replace(/'/g, '')}', ${generic}`
}

/** Build the full @font-face stylesheet for every installed face. */
export function buildFaceCss(fonts: InstalledFont[]): string {
  const rules: string[] = []
  for (const font of fonts) {
    const family = font.family.replace(/'/g, '')
    for (const face of font.faces) {
      // face.src is a data: URI (see core/fonts.ts) — the browser sniffs the
      // format from its mime, so no format() hint is needed.
      rules.push(
        `@font-face {\n` +
          `  font-family: '${family}';\n` +
          `  font-weight: ${face.weight};\n` +
          `  font-style: ${face.italic ? 'italic' : 'normal'};\n` +
          `  font-display: swap;\n` +
          `  src: url('${face.src}');\n` +
          `}`,
      )
    }
  }
  return rules.join('\n')
}

/** Inject/replace the installed-font @font-face rules in the document head. */
export function applyFaceCss(fonts: InstalledFont[]): void {
  if (typeof document === 'undefined') return
  let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null
  if (!el) {
    el = document.createElement('style')
    el.id = STYLE_ID
    document.head.appendChild(el)
  }
  el.textContent = buildFaceCss(fonts)
}
