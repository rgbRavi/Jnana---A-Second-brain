// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, it, expect, beforeEach } from 'vitest'
import { detectThinking, detectVision, isThinkingModel, isVisionModel } from './capabilities'
import { setThinkingOverride, setVisionOverride } from '../../lib/visionOverride'

describe('vision detection', () => {
  beforeEach(() => {
    localStorage.clear()
    setVisionOverride('qwen/qwen3.6-flash', undefined)
    setVisionOverride('gpt-4o', undefined)
  })

  it('recognises current vision model names', () => {
    for (const m of ['gpt-4o-mini', 'openai/gpt-5', 'anthropic/claude-sonnet-4', 'google/gemma-3-27b-it', 'meta-llama/llama-4-scout', 'qwen/qwen2.5-vl-72b-instruct', 'llava:13b', 'gemini-2.5-flash']) {
      expect(detectVision(m), m).toBe(true)
    }
  })

  it('does not flag text-only names', () => {
    for (const m of ['deepseek/deepseek-chat', 'llama3', 'mistral-7b-instruct', 'qwen/qwen3.6-flash']) {
      expect(detectVision(m), m).toBe(false)
    }
  })

  it("lets the user's answer override the name guess either way", () => {
    expect(isVisionModel('qwen/qwen3.6-flash')).toBe(false)
    setVisionOverride('Qwen/Qwen3.6-Flash', true)
    expect(isVisionModel('qwen/qwen3.6-flash')).toBe(true)
    setVisionOverride('gpt-4o', false)
    expect(isVisionModel('gpt-4o')).toBe(false)
  })
})

describe('reasoning detection', () => {
  beforeEach(() => {
    setThinkingOverride('deepseek-v4.1-flash-1017', undefined)
    setThinkingOverride('qwen3:8b', undefined)
  })

  it('guesses from the name', () => {
    expect(detectThinking('qwen3:8b')).toBe(true)
    expect(detectThinking('deepseek-v4.1-flash-1017')).toBe(false)
  })

  it("lets the user's answer override the name guess either way", () => {
    expect(isThinkingModel('deepseek-v4.1-flash-1017')).toBe(false)
    setThinkingOverride('DeepSeek-V4.1-Flash-1017', true)
    expect(isThinkingModel('deepseek-v4.1-flash-1017')).toBe(true)
    expect(detectThinking('deepseek-v4.1-flash-1017')).toBe(false) // the guess itself is unchanged
    setThinkingOverride('qwen3:8b', false)
    expect(isThinkingModel('qwen3:8b')).toBe(false)
  })

  it('keeps vision and reasoning answers separate', () => {
    setThinkingOverride('deepseek-v4.1-flash-1017', true)
    expect(isVisionModel('deepseek-v4.1-flash-1017')).toBe(false)
  })
})
