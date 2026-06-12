import { invoke } from '@tauri-apps/api/core'
import type { AiConfig, AiProviderKind } from '../../types'

/** Pre-Rust-storage location of the config; migrated away on first load. */
const LEGACY_STORAGE_KEY = 'jnana.ai.config'

/**
 * Per-provider defaults. The hybrid design means switching `provider` swaps
 * sensible base URLs and model names without the user re-typing everything.
 */
const PROVIDER_DEFAULTS: Record<AiProviderKind, Pick<AiConfig, 'baseUrl' | 'embeddingModel' | 'chatModel'>> = {
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    embeddingModel: 'text-embedding-3-small',
    chatModel: 'gpt-4o-mini',
  },
  ollama: {
    baseUrl: 'http://localhost:11434',
    embeddingModel: 'nomic-embed-text',
    chatModel: 'llama3.1',
  },
}

export function defaultConfig(provider: AiProviderKind = 'ollama'): AiConfig {
  return {
    enabled: false,
    provider,
    apiKey: '',
    hasApiKey: false,
    autoIndex: true,
    ...PROVIDER_DEFAULTS[provider],
  }
}

/**
 * One-time migration: earlier versions kept the config (including the API
 * key) in localStorage. Push it to the Rust store, then remove it so the key
 * no longer lives in browser-reachable storage.
 */
async function migrateLegacyConfig(): Promise<void> {
  const raw = localStorage.getItem(LEGACY_STORAGE_KEY)
  if (!raw) return
  try {
    const legacy = JSON.parse(raw) as Partial<AiConfig>
    const provider: AiProviderKind = legacy.provider === 'openai' ? 'openai' : 'ollama'
    await invoke('set_ai_config', { config: { ...defaultConfig(provider), ...legacy } })
  } catch (err) {
    console.error('[ai] failed to migrate legacy config:', err)
  }
  localStorage.removeItem(LEGACY_STORAGE_KEY)
}

/**
 * Config is persisted on the Rust side (`ai_config.json` in the app data
 * dir). The API key is write-only: it comes back empty, with `hasApiKey`
 * reporting whether one is saved.
 */
export async function loadAiConfig(): Promise<AiConfig> {
  await migrateLegacyConfig()
  const stored = await invoke<Partial<AiConfig>>('get_ai_config')
  const provider: AiProviderKind = stored.provider === 'openai' ? 'openai' : 'ollama'
  // Fresh install reports an empty baseUrl — fall back to provider defaults.
  if (!stored.baseUrl) return defaultConfig(provider)
  return { ...defaultConfig(provider), ...stored, apiKey: '' }
}

export async function saveAiConfig(config: AiConfig): Promise<void> {
  await invoke('set_ai_config', { config })
}

/** Defaults for a freshly-selected provider, preserving cross-provider fields. */
export function withProviderDefaults(config: AiConfig, provider: AiProviderKind): AiConfig {
  return { ...config, provider, ...PROVIDER_DEFAULTS[provider] }
}
