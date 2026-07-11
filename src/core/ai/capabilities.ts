// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// src/core/ai/capabilities.ts
//
// Best-effort model capability detection from the model id. There's no portable
// "what can this model do" API across OpenAI-compatible providers + Ollama, so
// we infer from naming conventions. Used only to gate UI affordances (show the
// vision attach hint, enable the Thinking toggle) — never to block a request.

export interface ModelCapabilities {
  /** Accepts image input (vision). */
  vision: boolean
  /** Is a reasoning/"thinking" model whose reasoning can be turned off. */
  thinking: boolean
  /** Deep-research is prompt-based here, so it's offered for any model. */
  deepResearch: boolean
}

const VISION_RE =
  /gpt-4o|gpt-4\.1|gpt-4-turbo|chatgpt-4o|o4|llava|bakllava|moondream|minicpm-v|vision|qwen2\.?5?-?vl|llama-?3\.2-vision|gemini|claude-3|claude-4|pixtral/

const THINKING_RE =
  /\bo1\b|\bo3\b|\bo4\b|gpt-5|deepseek-?r1|\bqwq\b|qwen3|magistral|reason|thinking|\br1\b/

export function modelCapabilities(model: string): ModelCapabilities {
  const m = (model || '').toLowerCase()
  return {
    vision: VISION_RE.test(m),
    thinking: THINKING_RE.test(m),
    deepResearch: true,
  }
}

export function isVisionModel(model: string): boolean {
  return modelCapabilities(model).vision
}

export function isThinkingModel(model: string): boolean {
  return modelCapabilities(model).thinking
}
