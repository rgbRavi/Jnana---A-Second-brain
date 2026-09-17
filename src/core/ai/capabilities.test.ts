// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, it, expect, beforeEach } from 'vitest'
import { detectVision, isVisionModel } from './capabilities'
import { setVisionOverride } from '../../lib/visionOverride'

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
