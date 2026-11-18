// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Asset URLs fail *silently* when they're wrong: the browser refuses the request
// under the content policy, nothing throws, and the image simply never appears.
// That is exactly how the wallpaper shipped broken — it used Tauri's
// `convertFileSrc`, which builds an `asset.localhost` URL the policy doesn't
// list. So this pins the helper against the real CSP rather than against a
// hard-coded string.

import { describe, it, expect } from 'vitest'
// @ts-expect-error Node.js types not available in this project
import { readFileSync, readdirSync, statSync } from 'node:fs'
// @ts-expect-error Node.js types not available in this project
import { join, dirname, relative } from 'node:path'
// @ts-expect-error Node.js types not available in this project
import { fileURLToPath } from 'node:url'
import { assetUrlFor as forPlatform } from './notes'
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

// Tauri serves a custom scheme differently per OS: `http://<scheme>.localhost/`
// on Windows (WebView2), `<scheme>://localhost/` on macOS and Linux (WebKit).
// A Windows-only URL means every image, recording and PDF silently fails to
// load on the other two.
const WINDOWS_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 Edg/130.0'
const MAC_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)'
const LINUX_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1.15 (KHTML, like Gecko)'

describe('assetUrl', () => {
  it('uses the app’s own scheme handler, in the form each WebView expects', () => {
    expect(forPlatform('a.png', WINDOWS_UA)).toBe('http://jnana-asset.localhost/a.png')
    expect(forPlatform('a.png', MAC_UA)).toBe('jnana-asset://localhost/a.png')
    expect(forPlatform('a.png', LINUX_UA)).toBe('jnana-asset://localhost/a.png')
  })

  it('escapes names that would otherwise change the URL', () => {
    // Asset filenames are uuids today, but a name with a space or a `?` would
    // silently resolve to a different (missing) file.
    expect(forPlatform('holiday photo.png', WINDOWS_UA)).toBe('http://jnana-asset.localhost/holiday%20photo.png')
    expect(forPlatform('a?b.png', MAC_UA)).toBe('jnana-asset://localhost/a%3Fb.png')
  })

  it('produces a source the content policy actually allows, on every platform', () => {
    const windowsOrigin = new URL(forPlatform('a.png', WINDOWS_UA)).origin
    const webkitScheme = new URL(forPlatform('a.png', MAC_UA)).protocol // 'jnana-asset:'
    for (const name of ['img-src', 'media-src']) {
      expect(directive(name), `${name} must allow ${windowsOrigin}`).toContain(windowsOrigin)
      expect(directive(name), `${name} must allow ${webkitScheme}`).toContain(webkitScheme)
    }
  })

  it('is the only place that builds an asset URL', () => {
    // Every hand-built copy was Windows-only; a new one would quietly break
    // macOS and Linux again.
    const srcRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
    const sources = (dir: string): string[] =>
      readdirSync(dir).flatMap((name: string) => {
        const path = join(dir, name)
        if (statSync(path).isDirectory()) return sources(path)
        return /\.tsx?$/.test(path) && !/\.test\.tsx?$/.test(path) ? [path] : []
      })
    const offenders = sources(srcRoot)
      .filter((path) => !path.endsWith(join('core', 'notes.ts')))
      .filter((path) => /jnana-asset\.localhost|jnana-asset:\/\/localhost/.test(readFileSync(path, 'utf8')))
      .map((path) => relative(srcRoot, path))
    expect(offenders).toEqual([])
  })

  it('does not use the origin convertFileSrc would have produced', () => {
    // Kept as a named case so the reason this helper exists survives the next
    // refactor: `http://asset.localhost` is Tauri's default asset origin, and the
    // policy does not list it.
    expect(directive('img-src')).not.toContain('http://asset.localhost')
    expect(new URL(forPlatform('a.png', WINDOWS_UA)).origin).not.toBe('http://asset.localhost')
  })
})
