// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

/** One instruction layer that can shape the next AI send. */
export type AiLayer = {
  key: string
  label: string
  description: string
  active: boolean
  detail?: string
}

export type AiLayerMode = 'chat' | 'agent' | 'focused'

export type AiLayerInput = {
  mode: AiLayerMode
  /** Which system prompt is set: the chat-specific one (overrides global), the global one, or none. */
  systemPromptSource?: 'chat' | 'global' | null
  /** Per-conversation instructions text (Capabilities → Conversation instructions). */
  conversationInstructions?: string
  /** Active project name; undefined/empty when no project is selected. */
  projectName?: string
  projectHasInstructions?: boolean
  /** Names of rules that will apply (session ∪ project rules). */
  ruleNames?: string[]
  skillNames?: string[]
  styleName?: string
}

const NA_FOCUSED = 'Not used by Analyze / Ask / Quiz actions.'
const NA_AGENT = 'Not used in Agent mode.'

function names(list: string[], max = 3): string {
  const shown = list.slice(0, max).join(', ')
  return list.length > max ? `${shown}, +${list.length - max} more` : shown
}

/**
 * The layers that can shape the next send, in the order the model receives
 * them (see FreeChat.tsx send path). Inactive layers stay in the list so the
 * user learns they exist; a layer a mode never uses says so in its description.
 */
export function describeAiLayers(input: AiLayerInput): AiLayer[] {
  const { mode } = input
  const focused = mode === 'focused'
  const agent = mode === 'agent'
  const conv = (input.conversationInstructions ?? '').trim()
  const rules = input.ruleNames ?? []
  const skills = input.skillNames ?? []
  const style = (input.styleName ?? '').trim()
  const project = (input.projectName ?? '').trim()
  const src = input.systemPromptSource ?? null

  const sys = !focused && src !== null
  const convOn = !focused && conv.length > 0
  const projOn = mode === 'chat' && !!project && !!input.projectHasInstructions
  const rulesOn = !focused && rules.length > 0
  const skillsOn = mode === 'chat' && skills.length > 0
  const styleOn = mode === 'chat' && style.length > 0

  return [
    {
      key: 'system',
      label: 'Your system prompt',
      description: focused ? NA_FOCUSED : 'Standing instructions you set in AI settings; sent first.',
      active: sys,
      detail: sys ? (src === 'chat' ? 'Chat system prompt' : 'Global system prompt') : undefined,
    },
    {
      key: 'conversation',
      label: "This chat's instructions",
      description: focused ? NA_FOCUSED : 'Extra instructions for this conversation only; added after your system prompt.',
      active: convOn,
      detail: convOn ? `${conv.length} characters` : undefined,
    },
    {
      key: 'project',
      label: project ? `Project instructions (${project})` : 'Project instructions',
      description: focused ? NA_FOCUSED : agent ? NA_AGENT : 'Custom instructions and knowledge from the active project.',
      active: projOn,
      detail: !project || focused || agent ? undefined : input.projectHasInstructions ? project : `${project} has no instructions`,
    },
    {
      key: 'style',
      label: 'Response style',
      description: focused ? NA_FOCUSED : agent ? NA_AGENT : 'How the answer is written: tone, length, format.',
      active: styleOn,
      detail: styleOn ? style : undefined,
    },
    {
      key: 'skills',
      label: 'Skills',
      description: focused ? NA_FOCUSED : agent ? NA_AGENT : 'Reusable know-how you switched on for this chat.',
      active: skillsOn,
      detail: skillsOn ? names(skills) : undefined,
    },
    {
      key: 'rules',
      label: 'Rules',
      description: focused
        ? NA_FOCUSED
        : agent
          ? 'Always-follow rules; repeated right before your message on every step.'
          : 'Always-follow rules; re-sent right before your message when they are due for a reminder.',
      active: rulesOn,
      detail: rulesOn ? `${rules.length} ${rules.length === 1 ? 'rule' : 'rules'}: ${names(rules)}` : undefined,
    },
  ]
}
