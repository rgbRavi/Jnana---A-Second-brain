// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useState } from 'react'
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { ChatComposer } from './ChatComposer'
import { useComposerToolbar } from '../../hooks/useComposerToolbar'

vi.mock('@tauri-apps/api/webview', () => ({
  getCurrentWebview: () => ({ onDragDropEvent: () => Promise.resolve(() => {}) }),
}))
vi.mock('./RulesPicker', () => ({ RulesBody: () => null }))

const preset = (id: string, name: string) => ({
  id, name, provider: 'openai', baseUrl: '', model: 'm', systemPrompt: '', hasApiKey: true,
})

function baseProps(over: Record<string, unknown> = {}) {
  return {
    value: '', onChange: vi.fn(), onSend: vi.fn(), onStop: vi.fn(), busy: false, attachments: [],
    onAttach: vi.fn(), onRemoveAttachment: vi.fn(), onToggleThread: vi.fn(), notes: [], onAddNote: vi.fn(),
    think: false, onThinkChange: vi.fn(), canThink: false, thinkingDetected: false, onReasoningChange: vi.fn(),
    deepResearch: false, onDeepResearchChange: vi.fn(), agent: false, onAgentChange: vi.fn(),
    webMode: 'off', onWebModeChange: vi.fn(), canWebSearch: false, vision: false, visionDetected: false,
    onVisionChange: vi.fn(), model: 'gpt-4o-mini-with-a-very-long-name', onPasteFiles: vi.fn(), onDropPaths: vi.fn(),
    stylePresets: [], skillPresets: [], styleId: '', onStyleId: vi.fn(), skillIds: [], onSkillIds: vi.fn(),
    onPresetsChanged: vi.fn(), vaultId: 'v', ruleIds: [], onRuleIds: vi.fn(),
    focus: { action: null }, onFocus: vi.fn(),
    chatPresets: [preset('p1', 'Work'), preset('p2', 'Home')], activeChatPresetId: 'p1',
    onPickChatPreset: vi.fn(), convPrompt: '', onConvPrompt: vi.fn(), onConvPromptCommit: vi.fn(), promptBase: 'Work',
    ...over,
  }
}

function setup(over: Record<string, unknown> = {}) {
  const props = baseProps(over)
  render(<ChatComposer {...(props as unknown as Parameters<typeof ChatComposer>[0])} />)
  return props
}

// Preset pill starts hidden by default; these tests opt it in.
function showPresetPill() {
  const { result } = renderHook(() => useComposerToolbar())
  act(() => { result.current[1].reset(); result.current[1].toggle('preset') })
}

describe('ChatComposer preset pill', () => {
  beforeEach(showPresetPill)
  it('is hidden by default', () => {
    const { result } = renderHook(() => useComposerToolbar())
    act(() => result.current[1].reset())
    setup()
    expect(screen.queryByRole('button', { name: /Work/ })).toBeNull()
  })
  it('lists presets and picking one calls onPickChatPreset', () => {
    const p = setup()
    fireEvent.click(screen.getByRole('button', { name: /Work/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Home/ }))
    expect(p.onPickChatPreset).toHaveBeenCalledWith('p2')
  })
  it('shows no preset pill when there are no chat presets', () => {
    setup({ chatPresets: [], activeChatPresetId: undefined })
    expect(screen.queryByRole('button', { name: /gpt-4o-mini-with-a-very/ })).toBeNull()
  })
})

describe('composer toolbar customisation', () => {
  beforeEach(showPresetPill)
  it('hidden More with nothing on has no More button', () => {
    const { result } = renderHook(() => useComposerToolbar())
    act(() => result.current[1].toggle('more'))
    setup()
    expect(screen.queryByRole('button', { name: /^More/ })).toBeNull()
  })
  it('hidden More with Web or Thinking on still shows the More button', () => {
    const { result } = renderHook(() => useComposerToolbar())
    act(() => result.current[1].toggle('more'))
    const p = setup({ webMode: 'always' })
    expect(screen.getByRole('button', { name: /^More/ })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Turn off Web' }))
    expect(p.onWebModeChange).toHaveBeenCalledWith('off')
  })
  it('hidden More with Thinking on still shows the More button', () => {
    const { result } = renderHook(() => useComposerToolbar())
    act(() => result.current[1].toggle('more'))
    setup({ canThink: true, think: true })
    expect(screen.getByRole('button', { name: /^More/ })).toBeTruthy()
  })
  it('hidden Capabilities with a conversation prompt set shows the Capabilities button', () => {
    const { result } = renderHook(() => useComposerToolbar())
    act(() => result.current[1].toggle('capabilities'))
    setup({ convPrompt: 'Be brief' })
    expect(screen.getByRole('button', { name: /^Capabilities/ })).toBeTruthy()
  })
  it('hidden Focused / More keep the Focused and Agent mode lines with off buttons', () => {
    const { result } = renderHook(() => useComposerToolbar())
    act(() => { result.current[1].toggle('focused'); result.current[1].toggle('more') })
    const f = setup({ focus: { action: 'analyze', scope: { kind: 'all' } } })
    expect(screen.getByRole('button', { name: /^Focused/ })).toBeTruthy() // active, so never hidden
    fireEvent.click(screen.getByRole('button', { name: /^Turn off/ }))
    expect(f.onFocus).toHaveBeenCalled()
  })
  it('hidden More keeps the Agent mode line and its off button', () => {
    const { result } = renderHook(() => useComposerToolbar())
    act(() => result.current[1].toggle('more'))
    const p = setup({ agent: true })
    expect(screen.getByText('Agent')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Turn off Agent' }))
    expect(p.onAgentChange).toHaveBeenCalledWith(false)
  })
  it('renders controls in stored order', () => {
    const { result } = renderHook(() => useComposerToolbar())
    act(() => result.current[1].move(4, 0)) // focused first
    setup()
    const names = ['Focused', 'Work', 'Attach', 'Capabilities', 'More']
    const pos = names.map((n) => {
      const b = screen.getAllByRole('button').find((x) => x.textContent?.includes(n))!
      return screen.getAllByRole('button').indexOf(b)
    })
    expect([...pos].sort((a, b) => a - b)).toEqual(pos)
  })
})

describe('Conversation instructions', () => {
  it('edits onConvPrompt', () => {
    const p = setup()
    fireEvent.click(screen.getByRole('button', { name: /Capabilities/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Conversation instructions/ }))
    expect(screen.getByText(/Added after your Work system prompt/)).toBeTruthy()
    const box = screen.getByRole('textbox', { name: 'Conversation instructions' })
    fireEvent.change(box, { target: { value: 'Be brief' } })
    expect(p.onConvPrompt).toHaveBeenCalledWith('Be brief')
  })
  it('does not commit when opened and closed untouched', () => {
    const p = setup()
    fireEvent.click(screen.getByRole('button', { name: /Capabilities/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Conversation instructions/ }))
    fireEvent.blur(screen.getByRole('textbox', { name: 'Conversation instructions' }))
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    fireEvent.click(screen.getByRole('button', { name: /Capabilities/ }))
    expect(p.onConvPromptCommit).not.toHaveBeenCalled()
  })
  it('commits on blur after an edit, not again on Back', () => {
    const commit = vi.fn()
    function Stateful() {
      const [v, setV] = useState('')
      return (
        <ChatComposer
          {...(baseProps() as unknown as Parameters<typeof ChatComposer>[0])}
          convPrompt={v} onConvPrompt={setV} onConvPromptCommit={commit}
        />
      )
    }
    render(<Stateful />)
    fireEvent.click(screen.getByRole('button', { name: /Capabilities/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Conversation instructions/ }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Conversation instructions' }), { target: { value: 'Be brief' } })
    const box = screen.getByRole('textbox', { name: 'Conversation instructions' })
    fireEvent.blur(box)
    expect(commit).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(commit).toHaveBeenCalledTimes(1) // already clean
  })
  it('counts a set conversation prompt in the Capabilities badge', () => {
    setup({ convPrompt: 'Be brief' })
    expect(screen.getByRole('button', { name: /Capabilities/ }).textContent).toContain('1')
  })
})
