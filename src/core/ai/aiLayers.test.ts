// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project
import { describe, it, expect } from 'vitest'
import { describeAiLayers } from './aiLayers'

const full = {
  systemPromptSource: 'chat' as const,
  conversationInstructions: 'Be brief',
  projectName: 'ENI',
  projectHasInstructions: true,
  ruleNames: ['A', 'B', 'C', 'D'],
  skillNames: ['Tutor'],
  styleName: 'Concise',
}
const by = (l: ReturnType<typeof describeAiLayers>, k: string) => l.find((x) => x.key === k)!

describe('describeAiLayers', () => {
  it('lists layers in send order', () => {
    expect(describeAiLayers({ mode: 'chat', ...full }).map((l) => l.key)).toEqual([
      'system', 'conversation', 'project', 'style', 'skills', 'rules',
    ])
  })

  it('chat: everything active with details', () => {
    const l = describeAiLayers({ mode: 'chat', ...full })
    expect(l.every((x) => x.active)).toBe(true)
    expect(by(l, 'project').label).toBe('Project instructions (ENI)')
    expect(by(l, 'rules').detail).toBe('4 rules: A, B, C, +1 more')
    expect(by(l, 'style').detail).toBe('Concise')
  })

  it('agent: project, style and skills are not used', () => {
    const l = describeAiLayers({ mode: 'agent', ...full })
    expect(by(l, 'system').active).toBe(true)
    expect(by(l, 'rules').active).toBe(true)
    for (const k of ['project', 'style', 'skills']) {
      expect(by(l, k).active).toBe(false)
      expect(by(l, k).description).toMatch(/Not used in Agent mode/)
    }
  })

  it('focused: nothing is used', () => {
    const l = describeAiLayers({ mode: 'focused', ...full })
    expect(l).toHaveLength(6)
    expect(l.every((x) => !x.active && /Not used/.test(x.description))).toBe(true)
  })

  it('keeps inactive layers when nothing is set', () => {
    const l = describeAiLayers({ mode: 'chat' })
    expect(l).toHaveLength(6)
    expect(l.every((x) => !x.active)).toBe(true)
  })

  it('project without instructions is inactive', () => {
    const l = describeAiLayers({ mode: 'chat', projectName: 'X', projectHasInstructions: false })
    expect(by(l, 'project').active).toBe(false)
    expect(by(l, 'project').detail).toMatch(/no instructions/)
  })
})
