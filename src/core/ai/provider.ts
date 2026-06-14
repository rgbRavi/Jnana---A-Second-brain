import { invoke, Channel } from '@tauri-apps/api/core'
import type { AiConfig, AiProviderKind } from '../../types'
import { isThinkingModel } from './capabilities'

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

// ── Streaming multi-turn chat (the "AI Chat" mode) ──────────────────────────

/** A file attached to a chat turn, for providers that accept native file input. */
export interface ChatFile {
  /** data URL (`data:<mime>;base64,...`). */
  dataUrl: string
  mime: string
  name: string
}

/** One message in a multi-turn chat. Images/files are native multimodal blocks. */
export interface ChatTurn {
  role: 'system' | 'user' | 'assistant'
  content: string
  /** Image data URLs (vision models). */
  images?: string[]
  /** Native file attachments (e.g. PDFs) where the provider supports them. */
  files?: ChatFile[]
}

/** Which configured endpoint a stream targets, and the model to use there. */
export interface StreamRoute {
  /** Rust-side target picks the base URL + key. */
  target: 'chat' | 'deepResearch'
  provider: AiProviderKind
  model: string
}

export interface StreamChatOpts {
  /** When false on a thinking model, request reasoning be turned off. */
  think?: boolean
  temperature?: number
  /** Aborting cancels the in-flight request server-side. */
  signal?: AbortSignal
  /** Override the endpoint/model (e.g. a dedicated deep-research endpoint). */
  route?: StreamRoute
}

/** Internal event shape mirrored from the Rust `StreamMsg`. */
type StreamMsg = { type: 'chunk'; text: string } | { type: 'done' } | { type: 'error'; message: string }

const stripDataUrl = (s: string) => s.replace(/^data:[^;]+;base64,/, '')

function openAiContent(turn: ChatTurn): unknown {
  const hasMedia = (turn.images?.length ?? 0) > 0 || (turn.files?.length ?? 0) > 0
  if (!hasMedia) return turn.content
  const blocks: unknown[] = []
  if (turn.content) blocks.push({ type: 'text', text: turn.content })
  for (const url of turn.images ?? []) blocks.push({ type: 'image_url', image_url: { url } })
  for (const f of turn.files ?? []) blocks.push({ type: 'file', file: { filename: f.name, file_data: f.dataUrl } })
  return blocks
}

function buildChatRequest(
  provider: AiProviderKind,
  model: string,
  messages: ChatTurn[],
  opts: StreamChatOpts,
): { path: string; body: Record<string, unknown> } {
  const thinkOff = opts.think === false && isThinkingModel(model)

  if (provider === 'openai') {
    const body: Record<string, unknown> = {
      model,
      messages: messages.map((m) => ({ role: m.role, content: openAiContent(m) })),
      stream: true,
      temperature: opts.temperature ?? 0.7,
    }
    // Best-effort: only reasoning models accept this; gate so we don't 400 others.
    if (thinkOff) body.reasoning_effort = 'minimal'
    return { path: '/chat/completions', body }
  }

  // Ollama /api/chat: native multi-turn with base64 images and a `think` flag.
  const body: Record<string, unknown> = {
    model,
    messages: messages.map((m) => {
      const msg: Record<string, unknown> = { role: m.role, content: m.content }
      if (m.images?.length) msg.images = m.images.map(stripDataUrl)
      return msg
    }),
    stream: true,
    options: { temperature: opts.temperature ?? 0.7 },
  }
  if (opts.think === false && isThinkingModel(model)) body.think = false
  return { path: '/api/chat', body }
}

/** Parse one framing line into a content delta. SSE for OpenAI, NDJSON for Ollama. */
function parseDelta(line: string, kind: AiProviderKind): string {
  if (kind === 'openai') {
    if (!line.startsWith('data:')) return ''
    const payload = line.slice(5).trim()
    if (payload === '[DONE]') return ''
    try {
      const j = JSON.parse(payload)
      return j.choices?.[0]?.delta?.content ?? ''
    } catch {
      return ''
    }
  }
  // Ollama NDJSON: one JSON object per line.
  try {
    const j = JSON.parse(line)
    return j.message?.content ?? ''
  } catch {
    return ''
  }
}

/**
 * Stream a multi-turn chat completion. Tokens are delivered to `onToken` as they
 * arrive and the full text is returned when the stream ends. Goes through the
 * Rust `ai_chat_stream` command (auth + CORS bypass), which forwards raw SSE /
 * NDJSON chunks over a Channel; provider-specific delta parsing happens here.
 */
export async function streamChat(
  config: AiConfig,
  messages: ChatTurn[],
  opts: StreamChatOpts,
  onToken: (delta: string) => void,
): Promise<string> {
  const route: StreamRoute = opts.route ?? {
    target: 'chat',
    provider: config.chatProvider,
    model: config.chatModel,
  }
  const kind = route.provider
  const { path, body } = buildChatRequest(route.provider, route.model, messages, opts)
  const requestId =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`

  let full = ''
  let buffer = ''
  const channel = new Channel<StreamMsg>()

  const flush = (line: string) => {
    const trimmed = line.trim()
    if (!trimmed) return
    const delta = parseDelta(trimmed, kind)
    if (delta) {
      full += delta
      onToken(delta)
    }
  }

  return new Promise<string>((resolve, reject) => {
    const onAbort = () => {
      void invoke('ai_chat_cancel', { requestId }).catch(() => {})
    }
    if (opts.signal) {
      if (opts.signal.aborted) onAbort()
      else opts.signal.addEventListener('abort', onAbort, { once: true })
    }
    const cleanup = () => opts.signal?.removeEventListener('abort', onAbort)

    channel.onmessage = (msg) => {
      if (msg.type === 'chunk') {
        buffer += msg.text
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) flush(line)
      } else if (msg.type === 'done') {
        flush(buffer)
        buffer = ''
        cleanup()
        resolve(full)
      } else {
        cleanup()
        reject(new Error(msg.message))
      }
    }

    invoke('ai_chat_stream', {
      target: route.target,
      path,
      body: JSON.stringify(body),
      requestId,
      onEvent: channel,
    }).catch((e) => {
      cleanup()
      reject(e instanceof Error ? e : new Error(String(e)))
    })
  })
}

// ── Tool-calling (the agent loop) ───────────────────────────────────────────

/** A tool the model may call. `parameters` is a JSON Schema object. */
export interface ToolDef {
  name: string
  description: string
  parameters: Record<string, unknown>
}

/** A tool invocation the model requested. */
export interface ToolCall {
  id: string
  name: string
  args: Record<string, unknown>
}

/** One message in the agent loop — richer than ChatTurn (adds tool roles). */
export interface AgentMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  /** Present on assistant turns that requested tools. */
  toolCalls?: ToolCall[]
  /** Present on tool-result turns. */
  toolCallId?: string
  /** Tool name (tool-result turns). */
  name?: string
}

const safeParseArgs = (raw: unknown): Record<string, unknown> => {
  if (raw && typeof raw === 'object') return raw as Record<string, unknown>
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as Record<string, unknown>
    } catch {
      return {}
    }
  }
  return {}
}

function toOpenAiMessage(m: AgentMessage): Record<string, unknown> {
  if (m.role === 'tool') {
    return { role: 'tool', tool_call_id: m.toolCallId, content: m.content }
  }
  if (m.role === 'assistant' && m.toolCalls?.length) {
    return {
      role: 'assistant',
      content: m.content || null,
      tool_calls: m.toolCalls.map((tc) => ({
        id: tc.id,
        type: 'function',
        function: { name: tc.name, arguments: JSON.stringify(tc.args ?? {}) },
      })),
    }
  }
  return { role: m.role, content: m.content }
}

function toOllamaMessage(m: AgentMessage): Record<string, unknown> {
  if (m.role === 'tool') {
    return { role: 'tool', content: m.content, name: m.name }
  }
  if (m.role === 'assistant' && m.toolCalls?.length) {
    return {
      role: 'assistant',
      content: m.content,
      tool_calls: m.toolCalls.map((tc) => ({ function: { name: tc.name, arguments: tc.args ?? {} } })),
    }
  }
  return { role: m.role, content: m.content }
}

/**
 * One agentic turn: send the conversation + available tools and get back the
 * model's text and any tool calls it wants to make. Non-streaming (tool-call
 * deltas are awkward to stream); the caller runs the loop. Works against
 * OpenAI-compatible `/chat/completions` and Ollama `/api/chat`. If the model
 * doesn't support tools it simply returns text with no tool calls.
 */
export async function chatWithTools(
  config: AiConfig,
  messages: AgentMessage[],
  tools: ToolDef[],
  opts?: { temperature?: number },
): Promise<{ content: string; toolCalls: ToolCall[] }> {
  const toolsPayload = tools.map((t) => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }))
  const temperature = opts?.temperature ?? 0.2

  if (config.chatProvider === 'openai') {
    const body: Record<string, unknown> = {
      model: config.chatModel,
      messages: messages.map(toOpenAiMessage),
      temperature,
      stream: false,
    }
    // Some endpoints reject an empty `tools` array — only send when non-empty.
    if (toolsPayload.length) {
      body.tools = toolsPayload
      body.tool_choice = 'auto'
    }
    const data = await aiPostJson<{
      choices: { message: { content: string | null; tool_calls?: { id: string; function: { name: string; arguments: string } }[] } }[]
    }>('chat', '/chat/completions', body)
    const msg = data.choices[0]?.message
    return {
      content: msg?.content ?? '',
      toolCalls: (msg?.tool_calls ?? []).map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        args: safeParseArgs(tc.function.arguments),
      })),
    }
  }

  // Ollama /api/chat — same tools shape; arguments come back as an object.
  const ollamaBody: Record<string, unknown> = {
    model: config.chatModel,
    messages: messages.map(toOllamaMessage),
    stream: false,
    options: { temperature },
  }
  if (toolsPayload.length) ollamaBody.tools = toolsPayload
  const data = await aiPostJson<{
    message: { content?: string; tool_calls?: { id?: string; function: { name: string; arguments: unknown } }[] }
  }>('chat', '/api/chat', ollamaBody)
  const msg = data.message
  return {
    content: msg?.content ?? '',
    toolCalls: (msg?.tool_calls ?? []).map((tc, i) => ({
      id: tc.id ?? `call_${i}`,
      name: tc.function.name,
      args: safeParseArgs(tc.function.arguments),
    })),
  }
}
