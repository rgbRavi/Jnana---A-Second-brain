import { invoke } from '@tauri-apps/api/core'
import type { AiConfig, AiProvider } from '../../types'

interface AiFetchResponse {
  status: number
  body: string
}

/**
 * Perform an HTTP request from the Rust side (see `ai_fetch`). This bypasses
 * the WebView CORS policy that would otherwise block direct calls to
 * api.openai.com, and keeps the API key out of browser-reachable fetch state.
 */
async function aiFetchJson<T>(
  url: string,
  headers: Record<string, string>,
  body: unknown,
): Promise<T> {
  const res = await invoke<AiFetchResponse>('ai_fetch', {
    url,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })

  if (res.status < 200 || res.status >= 300) {
    throw new Error(`AI provider returned ${res.status}: ${res.body.slice(0, 500)}`)
  }
  return JSON.parse(res.body) as T
}

/** OpenAI-compatible provider (also works against Azure/OpenRouter/etc.). */
class OpenAiProvider implements AiProvider {
  readonly kind = 'openai' as const
  constructor(
    private baseUrl: string,
    private apiKey: string,
    readonly embeddingModel: string,
    private chatModel: string,
  ) {}

  private authHeaders(): Record<string, string> {
    return this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return []
    const data = await aiFetchJson<{ data: { embedding: number[] }[] }>(
      `${this.baseUrl}/embeddings`,
      this.authHeaders(),
      { model: this.embeddingModel, input: texts },
    )
    return data.data.map((d) => d.embedding)
  }

  async complete(prompt: string, opts?: { system?: string; temperature?: number }): Promise<string> {
    const messages = [
      ...(opts?.system ? [{ role: 'system', content: opts.system }] : []),
      { role: 'user', content: prompt },
    ]
    const data = await aiFetchJson<{ choices: { message: { content: string } }[] }>(
      `${this.baseUrl}/chat/completions`,
      this.authHeaders(),
      { model: this.chatModel, messages, temperature: opts?.temperature ?? 0.2 },
    )
    return data.choices[0]?.message?.content ?? ''
  }
}

/** Local Ollama provider — fully offline, no API key. */
class OllamaProvider implements AiProvider {
  readonly kind = 'ollama' as const
  constructor(
    private baseUrl: string,
    readonly embeddingModel: string,
    private chatModel: string,
  ) {}

  async embed(texts: string[]): Promise<number[][]> {
    // Ollama's /api/embed accepts batched input and returns embeddings[].
    if (texts.length === 0) return []
    const data = await aiFetchJson<{ embeddings: number[][] }>(
      `${this.baseUrl}/api/embed`,
      {},
      { model: this.embeddingModel, input: texts },
    )
    return data.embeddings
  }

  async complete(prompt: string, opts?: { system?: string; temperature?: number }): Promise<string> {
    const data = await aiFetchJson<{ response: string }>(
      `${this.baseUrl}/api/generate`,
      {},
      {
        model: this.chatModel,
        prompt,
        system: opts?.system,
        stream: false,
        options: { temperature: opts?.temperature ?? 0.2 },
      },
    )
    return data.response ?? ''
  }
}

/** Build the configured provider. The rest of the AI layer only sees `AiProvider`. */
export function getProvider(config: AiConfig): AiProvider {
  const base = config.baseUrl.replace(/\/+$/, '')
  switch (config.provider) {
    case 'openai':
      return new OpenAiProvider(base, config.apiKey, config.embeddingModel, config.chatModel)
    case 'ollama':
      return new OllamaProvider(base, config.embeddingModel, config.chatModel)
    default:
      throw new Error(`Unknown AI provider: ${config.provider}`)
  }
}
