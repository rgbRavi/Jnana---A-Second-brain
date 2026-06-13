import { invoke } from '@tauri-apps/api/core'
import type { AiConfig, AiProviderKind } from '../../types'

interface AiFetchResponse {
  status: number
  body: string
}

/** Which configured provider a request targets — picks the base URL + key Rust-side. */
type Target = 'chat' | 'embedding'

/**
 * POST a JSON body to an endpoint of a configured AI provider via the Rust
 * `ai_request` command. Only the endpoint *path* and the `target` (chat or
 * embedding) are supplied from here — the host and key come from the Rust-side
 * config, so neither ever has to pass through (or be readable from) the
 * WebView. Going through Rust also bypasses the WebView CORS policy.
 */
async function aiPostJson<T>(target: Target, path: string, body: unknown): Promise<T> {
  const res = await invoke<AiFetchResponse>('ai_request', {
    target,
    path,
    body: JSON.stringify(body),
  })
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`AI provider returned ${res.status}: ${res.body.slice(0, 500)}`)
  }
  return JSON.parse(res.body) as T
}

/** Embeds a batch of texts into vectors (one per input, same order). */
export interface EmbeddingProvider {
  embed(texts: string[]): Promise<number[][]>
}

/** Generates a chat completion for a prompt. */
export interface ChatProvider {
  complete(prompt: string, opts?: { system?: string; temperature?: number }): Promise<string>
}

// ── Embedding adapters ──

function openAiEmbed(model: string): EmbeddingProvider {
  return {
    async embed(texts) {
      if (texts.length === 0) return []
      const data = await aiPostJson<{ data: { embedding: number[] }[] }>('embedding', '/embeddings', {
        model,
        input: texts,
      })
      return data.data.map((d) => d.embedding)
    },
  }
}

function ollamaEmbed(model: string): EmbeddingProvider {
  return {
    async embed(texts) {
      // Ollama's /api/embed accepts batched input and returns embeddings[].
      if (texts.length === 0) return []
      const data = await aiPostJson<{ embeddings: number[][] }>('embedding', '/api/embed', {
        model,
        input: texts,
      })
      return data.embeddings
    },
  }
}

// ── Chat adapters ──

function openAiChat(model: string): ChatProvider {
  return {
    async complete(prompt, opts) {
      const messages = [
        ...(opts?.system ? [{ role: 'system', content: opts.system }] : []),
        { role: 'user', content: prompt },
      ]
      const data = await aiPostJson<{ choices: { message: { content: string } }[] }>(
        'chat',
        '/chat/completions',
        { model, messages, temperature: opts?.temperature ?? 0.2 },
      )
      return data.choices[0]?.message?.content ?? ''
    },
  }
}

function ollamaChat(model: string): ChatProvider {
  return {
    async complete(prompt, opts) {
      const data = await aiPostJson<{ response: string }>('chat', '/api/generate', {
        model,
        prompt,
        system: opts?.system,
        stream: false,
        options: { temperature: opts?.temperature ?? 0.2 },
      })
      return data.response ?? ''
    },
  }
}

/** Build the configured embedding provider. */
export function getEmbeddingProvider(config: AiConfig): EmbeddingProvider {
  return providerEmbed(config.embeddingProvider, config.embeddingModel)
}

/** Build the configured chat provider. */
export function getChatProvider(config: AiConfig): ChatProvider {
  return providerChat(config.chatProvider, config.chatModel)
}

function providerEmbed(kind: AiProviderKind, model: string): EmbeddingProvider {
  return kind === 'openai' ? openAiEmbed(model) : ollamaEmbed(model)
}

function providerChat(kind: AiProviderKind, model: string): ChatProvider {
  return kind === 'openai' ? openAiChat(model) : ollamaChat(model)
}
