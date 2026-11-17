// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { invoke } from '../ipc'
import { aiConfigSettled } from './config'
import type { AiProviderKind } from '../../types'

/** Sections `ai_request` can reach (Rust resolves host + key from the saved config). */
export type TestTarget = 'chat' | 'embedding' | 'deepResearch'

export interface ConnectionResult {
  ok: boolean
  /** Plain-language outcome, safe to toast. */
  message: string
}

/** The smallest real request for this provider/target — it exercises URL, key and model together. */
function probe(target: TestTarget, provider: AiProviderKind, model: string): { path: string; body: unknown } {
  if (target === 'embedding') {
    return provider === 'openai'
      ? { path: '/embeddings', body: { model, input: 'ping' } }
      : { path: '/api/embed', body: { model, input: 'ping' } }
  }
  const messages = [{ role: 'user', content: 'ping' }]
  return provider === 'openai'
    ? { path: '/chat/completions', body: { model, messages, max_tokens: 1 } }
    : { path: '/api/chat', body: { model, messages, stream: false, options: { num_predict: 1 } } }
}

/** Turn an HTTP status or a Rust-side error string into advice a student can act on. */
export function describeConnectionFailure(statusOrError: number | string): string {
  if (typeof statusOrError === 'number') {
    const s = statusOrError
    if (s === 401 || s === 403) return 'The provider rejected your API key. Check that it is correct and still active.'
    if (s === 404) return "The provider doesn't know that model (or the service address is wrong). Check the model name and service address."
    if (s === 429) return 'The provider is rate-limiting you or your quota is used up. Try again shortly.'
    if (s >= 500) return `The provider had an error (${s}). Try again in a moment.`
    return `The provider refused the request (${s}). Check the model name and service address.`
  }
  const e = statusOrError
  if (/disabled/i.test(e)) return 'Turn on "Enable AI" first.'
  if (/invalid ai base url|must be http/i.test(e)) return 'That service address is not valid. It should start with http:// or https://.'
  if (/refusing to send the api key/i.test(e)) return 'Use an https:// address when sending an API key to a remote host.'
  if (/request failed|connect|dns|timed out|refused/i.test(e)) {
    return "Couldn't reach the provider. Check the service address, your internet connection, or that the local server (e.g. Ollama) is running."
  }
  return "Couldn't complete the test. Check the Base URL, key and model."
}

/** Send one tiny request through Rust (`ai_request`) using the *saved* config. Never throws. */
export async function testAiConnection(target: TestTarget, provider: AiProviderKind, model: string): Promise<ConnectionResult> {
  if (!model.trim()) return { ok: false, message: 'Enter a model name first.' }
  const { path, body } = probe(target, provider, model.trim())
  // Clicking Test blurs the Base URL field, which starts a save — test what was just committed.
  await aiConfigSettled()
  try {
    const res = await invoke<{ status: number; body: string }>('ai_request', { target, path, body: JSON.stringify(body) })
    if (res.status >= 200 && res.status < 300) return { ok: true, message: 'Connected. The provider accepted the model and key.' }
    return { ok: false, message: (provider === 'ollama' && ollamaAdvice(res.status, model.trim())) || describeConnectionFailure(res.status) }
  } catch (err) {
    const e = String(err)
    return { ok: false, message: (provider === 'ollama' && ollamaAdvice(e, model.trim())) || describeConnectionFailure(e) }
  }
}

/** Ollama's two common first-run failures, phrased as the next thing to do. Null = use the generic advice. */
export function ollamaAdvice(statusOrError: number | string, model: string): string | null {
  if (statusOrError === 404) return `Ollama is running but doesn't have “${model}” yet. Run: ollama pull ${model}`
  if (typeof statusOrError === 'string' && /request failed|connect|dns|timed out|refused/i.test(statusOrError)) {
    return "Couldn't reach Ollama. Open the Ollama app (or run: ollama serve), then try again."
  }
  return null
}
