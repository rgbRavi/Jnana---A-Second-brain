// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// src/core/ai/capabilities.ts
//
// Best-effort model capability detection from the model id. There's no portable
// "what can this model do" API across OpenAI-compatible providers + Ollama, so
// we infer from naming conventions. Used only to gate UI affordances (show the
// vision attach hint, enable the Thinking toggle) — never to block a request.
// Vision can be answered explicitly per model by the user (lib/visionOverride),
// which beats the name guess in both directions.

import { getVisionOverride } from '../../lib/visionOverride'

export interface ModelCapabilities {
  /** Accepts image input (vision). */
  vision: boolean
  /** Is a reasoning/"thinking" model whose reasoning can be turned off. */
  thinking: boolean
  /** Deep-research is prompt-based here, so it's offered for any model. */
  deepResearch: boolean
}

const VISION_RE =
  /gpt-4o|gpt-4\.1|gpt-4\.5|gpt-4-turbo|chatgpt-4o|gpt-5|\bo3\b|\bo4|llava|bakllava|moondream|minicpm-v|vision|[-_.]vl\b|-vl-|qvq|gemini|gemma-?3|claude|pixtral|mistral-(small|medium)-3|llama-?4|grok-4|internvl|phi-?4-multimodal|glm-4\.?\d*v/

const THINKING_RE =
  /\bo1\b|\bo3\b|\bo4\b|gpt-5|deepseek-?r1|\bqwq\b|qwen3|magistral|reason|thinking|\br1\b/

export function modelCapabilities(model: string): ModelCapabilities {
  const m = (model || '').toLowerCase()
  return {
    vision: getVisionOverride(m) ?? VISION_RE.test(m),
    thinking: THINKING_RE.test(m),
    deepResearch: true,
  }
}

/** Vision guessed from the model name alone, ignoring any user override. */
export function detectVision(model: string): boolean {
  return VISION_RE.test((model || '').toLowerCase())
}

export function isVisionModel(model: string): boolean {
  return modelCapabilities(model).vision
}

export function isThinkingModel(model: string): boolean {
  return modelCapabilities(model).thinking
}
