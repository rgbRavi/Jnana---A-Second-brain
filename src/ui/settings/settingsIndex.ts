// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Settings search: a hand-kept index of what lives where, a pure matcher, and a
// jump that lands on the right tab and section. Panels mount only when their tab
// is open, so the index can't be scraped from the DOM. settingsIndex.test.ts
// fails when an `anchor` no longer exists in the panels — keep the two in step.

import { toast } from '../../lib/toast'
import type { SettingsTab } from '../../views/settings/settingsTabs'

export interface SettingEntry {
  /** What the user is looking for, as the panel labels it. */
  label: string
  tab: SettingsTab
  /** Breadcrumb under the tab ("Dates", "Theme Studio → Motion"). */
  where?: string
  /** `data-setting-anchor` to jump to: a SettingSection title slug, a disclosure, or a sub-tab. */
  anchor?: string
  /** Extra words people search with that the label doesn't say. */
  keywords?: string
  /** Only listed when "Show developer options" is on. */
  dev?: boolean
}

export const TAB_LABELS: Record<SettingsTab, string> = {
  general: 'General',
  composer: 'Quick note',
  appearance: 'Appearance',
  ai: 'AI setup',
  'advanced-ai': 'AI behaviour',
  data: 'Backup & export',
  plugins: 'Plugins',
  developer: 'Developer',
  about: 'About',
}

export const SETTINGS_INDEX: SettingEntry[] = [
  // General
  { label: 'On launch, open', tab: 'general', where: 'Startup & notes', anchor: 'startup-and-notes', keywords: 'startup start view home last open first' },
  { label: 'Confirm before deleting a note', tab: 'general', where: 'Startup & notes', anchor: 'startup-and-notes', keywords: 'delete trash prompt safety remove' },
  { label: 'Keep deleted notes for', tab: 'general', where: 'Startup & notes', anchor: 'startup-and-notes', keywords: 'trash retention purge days forever recycle' },
  { label: 'Date format', tab: 'general', where: 'Dates', anchor: 'dates', keywords: 'iso us eu locale time' },
  { label: 'Week starts on', tab: 'general', where: 'Dates', anchor: 'dates', keywords: 'monday sunday calendar first day' },
  { label: 'Suggested links from', tab: 'general', where: 'Home dashboard', anchor: 'home-dashboard', keywords: 'dashboard tags graph related ai' },
  { label: 'Show the widget button', tab: 'general', where: 'Widget button', anchor: 'widget-button', keywords: 'plugin puzzle floating widgets' },
  { label: 'Auto-hide the widget button while typing', tab: 'general', where: 'Widget button', anchor: 'widget-button', keywords: 'plugin puzzle hide focus' },
  { label: 'Replay the tour', tab: 'general', where: 'Welcome tour', anchor: 'welcome-tour', keywords: 'onboarding help intro tutorial getting started' },
  { label: 'Show developer options', tab: 'general', where: 'Advanced', anchor: 'advanced', keywords: 'developer debug log metrics experimental' },

  // Composer
  { label: 'Transparency', tab: 'composer', keywords: 'opacity pill take a note' },
  { label: 'Pill glass effect', tab: 'composer', keywords: 'blur glass composer pill' },
  { label: 'Reopen it the way you left it', tab: 'composer', keywords: 'expanded collapsed restore' },
  { label: 'Tables while editing', tab: 'composer', keywords: 'table markdown grid' },

  // Appearance
  { label: 'Theme presets', tab: 'appearance', where: 'Theme Studio → Presets', anchor: 'theme-presets', keywords: 'theme dark light sepia rose saved import export colour color scheme' },
  { label: 'Accent colour', tab: 'appearance', where: 'Theme Studio → Design', anchor: 'theme-design', keywords: 'accent color highlight brand' },
  { label: 'Corner radius', tab: 'appearance', where: 'Theme Studio → Design', anchor: 'theme-design', keywords: 'rounded corners radius' },
  { label: 'Density', tab: 'appearance', where: 'Theme Studio → Design', anchor: 'theme-design', keywords: 'compact spacing comfortable' },
  { label: 'Glass & gradient effects', tab: 'appearance', where: 'Theme Studio → Design', anchor: 'theme-design', keywords: 'blur transparency glass' },
  { label: 'Wallpaper', tab: 'appearance', where: 'Theme Studio → Design', anchor: 'theme-design', keywords: 'background image dim blur' },
  { label: 'Fonts', tab: 'appearance', where: 'Theme Studio → Design', anchor: 'theme-design', keywords: 'font typeface interface reading monospace code' },
  { label: 'Reading scale', tab: 'appearance', where: 'Theme Studio → Design', anchor: 'theme-design', keywords: 'text size zoom bigger smaller' },
  { label: 'Motion speed', tab: 'appearance', where: 'Theme Studio → Motion', anchor: 'theme-motion', keywords: 'animation duration fast slow reduce motion' },
  { label: 'Contrast check & colour tokens', tab: 'appearance', where: 'Theme Studio → Advanced', anchor: 'theme-advanced', keywords: 'wcag accessibility contrast tokens raw colours' },
  { label: 'Reset theme', tab: 'appearance', keywords: 'default dark restore undo' },

  // AI setup
  { label: 'Enable AI', tab: 'ai', where: 'AI features', anchor: 'ai-features', keywords: 'ai on off turn' },
  { label: 'Auto-index on save', tab: 'ai', where: 'AI features', anchor: 'ai-features', keywords: 'index embeddings save' },
  { label: 'Chat provider, model & API key', tab: 'ai', where: 'Chat', anchor: 'chat', keywords: 'llm openai ollama api key base url model test connection' },
  { label: 'Embedding model', tab: 'ai', where: 'Embeddings', anchor: 'embeddings', keywords: 'embeddings index search semantic rag vectors' },
  { label: 'Index all notes', tab: 'ai', where: 'Embeddings', anchor: 'embeddings', keywords: 'reindex index embeddings stale' },
  { label: 'Transcription', tab: 'ai', where: 'Transcription', anchor: 'transcription', keywords: 'whisper audio voice speech recording' },
  { label: 'Deep research', tab: 'ai', where: 'Deep research', anchor: 'deep-research', keywords: 'research reports' },
  { label: 'Web search provider', tab: 'ai', where: 'Web search', anchor: 'web-search', keywords: 'brave tavily searxng internet web' },
  { label: 'Web answers', tab: 'ai', where: 'Web search', anchor: 'web-search', keywords: 'web citations sources answers' },
  { label: 'Global system prompt', tab: 'ai', where: 'Chat defaults', anchor: 'chat-defaults', keywords: 'system prompt instructions persona' },
  { label: 'Chat toolbar', tab: 'ai', where: 'Chat defaults', anchor: 'chat-defaults', keywords: 'chat composer toolbar buttons order reorder' },

  // AI behaviour
  { label: 'Notes the AI may read', tab: 'advanced-ai', where: 'Reading your notes', anchor: 'reading-your-notes', keywords: 'context tokens analyze ask quiz' },
  { label: 'Remind the AI of your Rules', tab: 'advanced-ai', where: 'Rules', anchor: 'rules', keywords: 'rules reminders drift long chats' },
  { label: 'Which Rules to send', tab: 'advanced-ai', where: 'Rules', anchor: 'rules', keywords: 'rules top-k number' },
  { label: 'Strategy metrics', tab: 'advanced-ai', where: 'Developer: strategy metrics', anchor: 'developer-strategy-metrics', keywords: 'metrics a/b log', dev: true },

  // Backup & export
  { label: 'Back up now', tab: 'data', where: 'Back up & restore', anchor: 'back-up-and-restore', keywords: 'backup zip save copy' },
  { label: 'Restore backup…', tab: 'data', where: 'Back up & restore', anchor: 'back-up-and-restore', keywords: 'restore recover zip' },
  { label: 'Save a backup to…', tab: 'data', where: 'Back up & restore', anchor: 'back-up-and-restore', keywords: 'backup folder zip vault all export full copy usb' },
  { label: 'Export notes as Markdown', tab: 'data', where: 'Export', anchor: 'export', keywords: 'export markdown md selected notes assets download' },
  { label: 'Import Markdown, documents or media', tab: 'data', where: 'Import', anchor: 'import', keywords: 'import md folder pdf docx media obsidian' },
  { label: 'Markdown mirror', tab: 'data', where: 'Markdown mirror', anchor: 'markdown-mirror', keywords: 'mirror sync folder md copy' },
  { label: 'Open logs folder', tab: 'data', where: 'Logs', anchor: 'logs', keywords: 'logs bug report diagnostics' },

  // Plugins
  { label: 'Installed plugins', tab: 'plugins', where: 'Installed', anchor: 'plugins-installed', keywords: 'plugins enable disable uninstall permissions shortcuts sandbox' },
  { label: 'Browse plugins', tab: 'plugins', where: 'Browse', anchor: 'plugins-browse', keywords: 'plugins install catalog store add' },
  { label: 'Plugin updates', tab: 'plugins', where: 'Updates', anchor: 'plugins-updates', keywords: 'plugins update upgrade version' },
  { label: 'Plugin development', tab: 'plugins', where: 'Plugin development', anchor: 'plugins-developer', keywords: 'plugins scaffold console dev', dev: true },

  // Developer
  { label: 'Onboarding testing', tab: 'developer', where: 'Onboarding', anchor: 'onboarding', keywords: 'onboarding first run tour', dev: true },
  { label: 'Developer log', tab: 'developer', where: 'Developer log', anchor: 'developer-log', keywords: 'log debug errors trace', dev: true },

  // About
  { label: 'Version & license', tab: 'about', keywords: 'about version agpl license source code' },
]

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')

/**
 * Entries matching every word of `query` (in label, breadcrumb or keywords),
 * best first: label prefix → a label word starts with the query → anywhere.
 */
export function searchSettings(query: string, opts: { showDev: boolean; limit?: number }): SettingEntry[] {
  const words = norm(query).split(/\s+/).filter(Boolean)
  if (words.length === 0) return []
  const q = words.join(' ')
  const scored: { e: SettingEntry; score: number; i: number }[] = []
  SETTINGS_INDEX.forEach((e, i) => {
    if (e.dev && !opts.showDev) return
    const label = norm(e.label)
    const hay = `${label} ${norm(e.where ?? '')} ${norm(TAB_LABELS[e.tab])} ${norm(e.keywords ?? '')}`
    if (!words.every((w) => hay.includes(w))) return
    const score = label.startsWith(q) ? 0 : label.split(/[^a-z0-9]+/).some((w) => w.startsWith(words[0])) ? 1 : 2
    scored.push({ e, score, i })
  })
  scored.sort((a, b) => a.score - b.score || a.i - b.i)
  return scored.slice(0, opts.limit ?? 8).map((s) => s.e)
}

const CUE = '2px solid color-mix(in srgb, var(--accent) 60%, transparent)'

/**
 * After navigating to the entry's tab: wait for its anchor to mount, then bring
 * it into view. A sub-tab is clicked, a collapsed disclosure opened, a section
 * scrolled to, focused (for keyboard/screen-reader users) and briefly flashed
 * (an outline instead of motion under reduced-motion).
 * Returns a cancel fn so a second search (or unmount) can stop a stale poll.
 * If the anchor never mounts (e.g. AI provider sections hidden while AI is off),
 * fall back: AI tab -> the 'ai-features' section plus a toast; else the panel heading.
 */
export function revealSetting(anchor: string | undefined, entry?: Pick<SettingEntry, 'tab' | 'label'>): () => void {
  if (!anchor) return () => {}
  let frames = 0
  let cancelled = false
  let raf = 0
  const next = () => {
    raf = requestAnimationFrame(tick)
  }
  let target = anchor
  const tick = () => {
    if (cancelled) return
    const el = document.querySelector<HTMLElement>(`[data-setting-anchor="${target}"]`)
    if (!el) {
      if (++frames < 60) return next()
      if (target === anchor && entry?.tab === 'ai' && anchor !== 'ai-features') {
        target = 'ai-features'
        frames = 0
        toast.info(`Turn on AI to see ${entry.label}.`)
        return next()
      }
      document.querySelector<HTMLElement>('h2')?.scrollIntoView({ block: 'start' })
      return
    }
    if (el.tagName === 'BUTTON') {
      el.click()
      el.focus()
      return
    }
    if (el instanceof HTMLDetailsElement) el.open = true
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    el.scrollIntoView({ block: 'start', behavior: still ? 'auto' : 'smooth' })
    el.focus({ preventScroll: true })
    if (still) {
      el.style.outline = CUE
      el.style.outlineOffset = '4px'
      window.setTimeout(() => {
        el.style.outline = ''
        el.style.outlineOffset = ''
      }, 1500)
    } else if (el.animate) {
      el.animate(
        [
          { boxShadow: '0 0 0 2px color-mix(in srgb, var(--accent) 60%, transparent)', borderRadius: 'var(--radius-md)' },
          { boxShadow: '0 0 0 2px transparent', borderRadius: 'var(--radius-md)' },
        ],
        { duration: 1400, easing: 'cubic-bezier(0.25, 1, 0.5, 1)' },
      )
    }
  }
  next()
  return () => {
    cancelled = true
    cancelAnimationFrame(raf)
  }
}
