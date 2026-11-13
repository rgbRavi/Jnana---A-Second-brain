// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { invoke } from '../ipc'
import { eventBus } from '../../lib/eventBus'
import { fromStoredConfig } from './config'
import type { AiConfig, AiPresetView, AiSection } from '../../types'

/** Rust returns the new public config; broadcast it so every `useRag` copy adopts it. */
async function run(cmd: string, args: Record<string, string>): Promise<void> {
  const stored = await invoke<Partial<AiConfig>>(cmd, args)
  eventBus.emit('ai:configChanged', { config: fromStoredConfig(stored) })
}

export const saveAiPreset = (section: AiSection, name: string) => run('save_ai_preset', { section, name })
export const updateAiPreset = (section: AiSection, id: string) => run('update_ai_preset', { section, id })
export const applyAiPreset = (section: AiSection, id: string) => run('apply_ai_preset', { section, id })
export const renameAiPreset = (section: AiSection, id: string, name: string) =>
  run('rename_ai_preset', { section, id, name })
export const deleteAiPreset = (section: AiSection, id: string) => run('delete_ai_preset', { section, id })

/** The live (possibly edited) values of a section. Only chat has a per-section prompt. */
export function sectionFields(c: AiConfig, s: AiSection) {
  switch (s) {
    case 'chat':
      return { provider: c.chatProvider, baseUrl: c.chatBaseUrl, model: c.chatModel, systemPrompt: c.chatSystemPrompt }
    case 'embedding':
      return { provider: c.embeddingProvider, baseUrl: c.embeddingBaseUrl, model: c.embeddingModel, systemPrompt: '' }
    case 'transcription':
      return { provider: c.transcriptionProvider, baseUrl: c.transcriptionBaseUrl, model: c.transcriptionModel, systemPrompt: '' }
    case 'deepResearch':
      return { provider: c.deepResearchProvider, baseUrl: c.deepResearchBaseUrl, model: c.deepResearchModel, systemPrompt: '' }
    case 'webSearch':
      return { provider: c.webSearchProvider, baseUrl: c.webSearchBaseUrl, model: '', systemPrompt: '' }
  }
}

const typedKey = (c: AiConfig, s: AiSection) => c[`${s}ApiKey` as const]

const liveHasKey = (c: AiConfig, s: AiSection) =>
  c[`has${s[0].toUpperCase()}${s.slice(1)}ApiKey` as 'hasChatApiKey']

export function activePreset(c: AiConfig, s: AiSection): AiPresetView | undefined {
  const id = c.activePresets?.[s]
  return id ? c.presets?.[s]?.find((p) => p.id === id) : undefined
}

/** True when the active preset's fields differ from the live ones, or a new key is typed. */
export function isModified(c: AiConfig, s: AiSection): boolean {
  const p = activePreset(c, s)
  if (!p) return false
  const f = sectionFields(c, s)
  return (
    p.provider !== f.provider ||
    p.baseUrl !== f.baseUrl ||
    p.model !== f.model ||
    p.systemPrompt !== f.systemPrompt ||
    !!typedKey(c, s) ||
    (!!liveHasKey(c, s) && !p.hasApiKey)
  )
}
