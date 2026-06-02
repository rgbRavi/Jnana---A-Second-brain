import type { AiConfig, AiProviderKind } from '../../types'

const STORAGE_KEY = 'jnana.ai.config'

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
    autoIndex: true,
    ...PROVIDER_DEFAULTS[provider],
  }
}

export function loadAiConfig(): AiConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultConfig()
    const parsed = JSON.parse(raw) as Partial<AiConfig>
    // Merge over defaults so config from an older version stays valid.
    return { ...defaultConfig(parsed.provider ?? 'ollama'), ...parsed }
  } catch {
    return defaultConfig()
  }
}

export function saveAiConfig(config: AiConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
}

/** Defaults for a freshly-selected provider, preserving cross-provider fields. */
export function withProviderDefaults(config: AiConfig, provider: AiProviderKind): AiConfig {
  return { ...config, provider, ...PROVIDER_DEFAULTS[provider] }
}
