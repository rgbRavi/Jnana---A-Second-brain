// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { invoke } from '@tauri-apps/api/core'
import type { AiConfig, AiProviderKind, TranscriptionProviderKind } from '../../types'

/** Pre-Rust-storage location of the config; cleared on load. */
const LEGACY_STORAGE_KEY = 'jnana.ai.config'

/** Per-provider chat defaults — swapped in when the chat provider changes. */
const CHAT_DEFAULTS: Record<AiProviderKind, Pick<AiConfig, 'chatBaseUrl' | 'chatModel'>> = {
  openai: { chatBaseUrl: 'https://api.openai.com/v1', chatModel: 'gpt-4o-mini' },
  ollama: { chatBaseUrl: 'http://localhost:11434', chatModel: 'llama3.1' },
}

/** Per-provider embedding defaults — independent of chat. */
const EMBED_DEFAULTS: Record<AiProviderKind, Pick<AiConfig, 'embeddingBaseUrl' | 'embeddingModel'>> = {
  openai: { embeddingBaseUrl: 'https://api.openai.com/v1', embeddingModel: 'text-embedding-3-small' },
  ollama: { embeddingBaseUrl: 'http://localhost:11434', embeddingModel: 'nomic-embed-text' },
}

/**
 * Transcription backend defaults. "openai" is the cloud Whisper API; "local"
 * points at an OpenAI-compatible local Whisper server (e.g. speaches /
 * faster-whisper-server), the STT equivalent of running Ollama for chat.
 */
const TRANSCRIPTION_DEFAULTS: Record<
  TranscriptionProviderKind,
  Pick<AiConfig, 'transcriptionBaseUrl' | 'transcriptionModel'>
> = {
  openai: { transcriptionBaseUrl: 'https://api.openai.com/v1', transcriptionModel: 'whisper-1' },
  local: { transcriptionBaseUrl: 'http://localhost:8000/v1', transcriptionModel: 'Systran/faster-whisper-small' },
}

/** Per-provider deep-research defaults (base URL only; model is left blank so
 *  the endpoint stays opt-in — the toggle falls back to a system prompt until a
 *  model is set). */
const DEEP_RESEARCH_DEFAULTS: Record<AiProviderKind, Pick<AiConfig, 'deepResearchBaseUrl'>> = {
  openai: { deepResearchBaseUrl: 'https://api.openai.com/v1' },
  ollama: { deepResearchBaseUrl: 'http://localhost:11434' },
}

export function defaultConfig(): AiConfig {
  return {
    enabled: false,
    autoIndex: true,
    chatProvider: 'ollama',
    chatApiKey: '',
    hasChatApiKey: false,
    ...CHAT_DEFAULTS.ollama,
    embeddingProvider: 'ollama',
    embeddingApiKey: '',
    hasEmbeddingApiKey: false,
    ...EMBED_DEFAULTS.ollama,
    transcriptionProvider: 'openai',
    transcriptionApiKey: '',
    hasTranscriptionApiKey: false,
    transcribeOnRecord: false,
    ...TRANSCRIPTION_DEFAULTS.openai,
    deepResearchProvider: 'openai',
    deepResearchApiKey: '',
    hasDeepResearchApiKey: false,
    deepResearchModel: '',
    ...DEEP_RESEARCH_DEFAULTS.openai,
  }
}

/** Defaults for a freshly-selected chat provider. */
export function withChatProviderDefaults(config: AiConfig, provider: AiProviderKind): AiConfig {
  return { ...config, chatProvider: provider, ...CHAT_DEFAULTS[provider] }
}

/** Defaults for a freshly-selected embedding provider. */
export function withEmbeddingProviderDefaults(config: AiConfig, provider: AiProviderKind): AiConfig {
  return { ...config, embeddingProvider: provider, ...EMBED_DEFAULTS[provider] }
}

/** Defaults for a freshly-selected transcription provider. */
export function withTranscriptionProviderDefaults(
  config: AiConfig,
  provider: TranscriptionProviderKind,
): AiConfig {
  return { ...config, transcriptionProvider: provider, ...TRANSCRIPTION_DEFAULTS[provider] }
}

/** Defaults for a freshly-selected deep-research provider. */
export function withDeepResearchProviderDefaults(config: AiConfig, provider: AiProviderKind): AiConfig {
  return { ...config, deepResearchProvider: provider, ...DEEP_RESEARCH_DEFAULTS[provider] }
}

/** Whether a dedicated deep-research endpoint is configured (a model is set). */
export function hasDeepResearchEndpoint(config: AiConfig): boolean {
  return config.deepResearchModel.trim() !== '' && config.deepResearchBaseUrl.trim() !== ''
}

/** Old localStorage config (incl. keys) is obsolete — the Rust store + its
 * file migration own the config now; just clear the stale browser copy. */
function clearLegacyConfig(): void {
  if (localStorage.getItem(LEGACY_STORAGE_KEY)) localStorage.removeItem(LEGACY_STORAGE_KEY)
}

const asKind = (v: unknown): AiProviderKind => (v === 'openai' ? 'openai' : 'ollama')

/**
 * Config is persisted on the Rust side (`ai_config.json`). API keys are
 * write-only: they come back empty, with `has*ApiKey` reporting whether one is
 * saved.
 */
export async function loadAiConfig(): Promise<AiConfig> {
  clearLegacyConfig()
  const stored = await invoke<Partial<AiConfig>>('get_ai_config')
  // Fresh install (nothing configured) — use defaults.
  if (!stored.chatBaseUrl && !stored.embeddingBaseUrl) return defaultConfig()
  return {
    ...defaultConfig(),
    ...stored,
    chatProvider: asKind(stored.chatProvider),
    embeddingProvider: asKind(stored.embeddingProvider),
    transcriptionProvider: stored.transcriptionProvider === 'local' ? 'local' : 'openai',
    deepResearchProvider: asKind(stored.deepResearchProvider),
    // Keys are write-only — always blank on load.
    chatApiKey: '',
    embeddingApiKey: '',
    transcriptionApiKey: '',
    deepResearchApiKey: '',
  }
}

export async function saveAiConfig(config: AiConfig): Promise<void> {
  await invoke('set_ai_config', { config })
}
