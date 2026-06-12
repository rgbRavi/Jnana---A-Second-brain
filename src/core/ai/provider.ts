import { invoke } from '@tauri-apps/api/core'
import type { AiConfig, AiProvider } from '../../types'

interface AiFetchResponse {
  status: number
  body: string
}

/**
 * POST a JSON body to an endpoint of the configured AI provider via the Rust
 * `ai_request` command. Only the endpoint *path* is supplied from here — the
 * host comes from the Rust-side config and the API key is injected by Rust,
 * so neither ever has to pass through (or be readable from) the WebView.
 * Going through Rust also bypasses the WebView CORS policy that would block
 * direct calls to api.openai.com.
 */
async function aiPostJson<T>(path: string, body: unknown): Promise<T> {
  const res = await invoke<AiFetchResponse>('ai_request', {
    path,
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
    readonly embeddingModel: string,
    private chatModel: string,
  ) {}

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return []
    const data = await aiPostJson<{ data: { embedding: number[] }[] }>(
      '/embeddings',
      { model: this.embeddingModel, input: texts },
    )
    return data.data.map((d) => d.embedding)
  }

  async complete(prompt: string, opts?: { system?: string; temperature?: number }): Promise<string> {
    const messages = [
      ...(opts?.system ? [{ role: 'system', content: opts.system }] : []),
      { role: 'user', content: prompt },
    ]
    const data = await aiPostJson<{ choices: { message: { content: string } }[] }>(
      '/chat/completions',
      { model: this.chatModel, messages, temperature: opts?.temperature ?? 0.2 },
    )
    return data.choices[0]?.message?.content ?? ''
  }
}

/** Local Ollama provider — fully offline, no API key. */
class OllamaProvider implements AiProvider {
  readonly kind = 'ollama' as const
  constructor(
    readonly embeddingModel: string,
    private chatModel: string,
  ) {}

  async embed(texts: string[]): Promise<number[][]> {
    // Ollama's /api/embed accepts batched input and returns embeddings[].
    if (texts.length === 0) return []
    const data = await aiPostJson<{ embeddings: number[][] }>(
      '/api/embed',
      { model: this.embeddingModel, input: texts },
    )
    return data.embeddings
  }

  async complete(prompt: string, opts?: { system?: string; temperature?: number }): Promise<string> {
    const data = await aiPostJson<{ response: string }>(
      '/api/generate',
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
  switch (config.provider) {
    case 'openai':
      return new OpenAiProvider(config.embeddingModel, config.chatModel)
    case 'ollama':
      return new OllamaProvider(config.embeddingModel, config.chatModel)
    default:
      throw new Error(`Unknown AI provider: ${config.provider}`)
  }
}
