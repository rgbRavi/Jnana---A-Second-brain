// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// @ts-expect-error Node.js types not available in this project
import { readdirSync, readFileSync } from 'node:fs'
// @ts-expect-error Node.js types not available in this project
import { dirname, join } from 'node:path'
// @ts-expect-error Node.js types not available in this project
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { SETTINGS_INDEX, revealSetting, searchSettings } from './settingsIndex'
import { settingAnchor } from './SettingLayout'

const labels = (q: string, showDev = false) => searchSettings(q, { showDev }).map((e) => e.label)

describe('searchSettings', () => {
  it('matches labels, breadcrumbs and keywords; label prefix ranks first', () => {
    expect(labels('date')[0]).toBe('Date format')
    expect(labels('trash')).toContain('Keep deleted notes for')
    expect(labels('whisper')).toEqual(['Transcription'])
    expect(labels('theme')).toContain('Theme presets')
  })

  it('needs every word, ignores case and accents', () => {
    expect(labels('BACKUP folder')).toContain('Save a backup to…')
    expect(labels('rosé')).toContain('Theme presets')
    expect(labels('   ')).toEqual([])
    expect(labels('zzzz-nothing')).toEqual([])
  })

  it('hides developer-only entries unless developer options are on', () => {
    expect(labels('developer log')).not.toContain('Developer log')
    expect(labels('developer log', true)).toContain('Developer log')
  })
})

// Drift guard: every anchor the index jumps to must exist in the panels. A renamed
// section title, sub-tab id or disclosure fails here instead of silently not scrolling.
describe('SETTINGS_INDEX anchors', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
  const files = [
    ...readdirSync(join(root, 'ui/settings'), { recursive: true, encoding: 'utf8' })
      .filter((f: string) => f.endsWith('.tsx') && !f.includes('.test.'))
      .map((f: string) => join(root, 'ui/settings', f)),
    join(root, 'ui/ai/AiSettingsPanel.tsx'),
  ]
  const src = files.map((f: string) => readFileSync(f, 'utf8')).join('\n')
  const known = new Set<string>()
  for (const m of src.matchAll(/title="([^"]+)"/g)) known.add(settingAnchor(m[1]))
  for (const m of src.matchAll(/data-setting-anchor="([^"]+)"/g)) known.add(m[1])
  const ids = (file: string) =>
    [...readFileSync(join(root, file), 'utf8').matchAll(/\{ id: '([\w-]+)'/g)].map((m) => m[1])
  for (const id of ids('ui/settings/appearance/ThemeEditor.tsx')) known.add(`theme-${id}`)
  for (const id of ids('ui/settings/plugins/PluginsPanel.tsx')) known.add(`plugins-${id}`)

  it.each(SETTINGS_INDEX.filter((e) => e.anchor).map((e) => [e.label, e.anchor!]))('%s → %s exists', (_label, anchor) => {
    expect(known).toContain(anchor)
  })
})

describe('revealSetting', () => {
  it('stops polling once cancelled', () => {
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1)
    const caf = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
    const cancel = revealSetting('nope-anchor')
    expect(raf).toHaveBeenCalledTimes(1)
    cancel()
    expect(caf).toHaveBeenCalled()
    raf.mockRestore()
    caf.mockRestore()
  })
})
