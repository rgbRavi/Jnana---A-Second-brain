// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Asset URLs fail *silently* when they're wrong: the browser refuses the request
// under the content policy, nothing throws, and the image simply never appears.
// That is exactly how the wallpaper shipped broken — it used Tauri's
// `convertFileSrc`, which builds an `asset.localhost` URL the policy doesn't
// list. So this pins the helper against the real CSP rather than against a
// hard-coded string.

import { describe, it, expect } from 'vitest'
import { assetUrl } from './notes'
// Imported rather than read off disk: `src/` is typechecked without node types,
// and this keeps the test reading the *real* policy the app ships with.
import conf from '../../src-tauri/tauri.conf.json'

const csp: string = conf.app.security.csp

/** The sources one CSP directive allows. */
function directive(name: string): string[] {
  const found = csp
    .split(';')
    .map((d) => d.trim())
    .find((d) => d.startsWith(`${name} `))
  return found ? found.split(/\s+/).slice(1) : []
}

describe('assetUrl', () => {
  it('uses the app’s own scheme handler', () => {
    expect(assetUrl('a.png')).toBe('http://jnana-asset.localhost/a.png')
  })

  it('escapes names that would otherwise change the URL', () => {
    // Asset filenames are uuids today, but a name with a space or a `?` would
    // silently resolve to a different (missing) file.
    expect(assetUrl('holiday photo.png')).toBe('http://jnana-asset.localhost/holiday%20photo.png')
    expect(assetUrl('a?b.png')).toBe('http://jnana-asset.localhost/a%3Fb.png')
  })

  it('produces an origin the content policy actually allows', () => {
    const origin = new URL(assetUrl('a.png')).origin
    for (const name of ['img-src', 'media-src']) {
      expect(directive(name), `${name} must allow ${origin}`).toContain(origin)
    }
  })

  it('does not use the origin convertFileSrc would have produced', () => {
    // Kept as a named case so the reason this helper exists survives the next
    // refactor: `http://asset.localhost` is Tauri's default asset origin, and the
    // policy does not list it.
    expect(directive('img-src')).not.toContain('http://asset.localhost')
    expect(new URL(assetUrl('a.png')).origin).not.toBe('http://asset.localhost')
  })
})
