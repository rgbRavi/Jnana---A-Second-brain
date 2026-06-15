// src/core/ai/agent/run.ts
import { chatWithTools, type AgentMessage } from '../provider'
import { NATIVE_TOOLS, type AgentTool, type ProposedAction, type ToolContext } from './tools'
import type { AiConfig, Note } from '../../../types'

export interface AgentStep {
  /** The model's narration/reasoning for the round this step belongs to. */
  thought: string
  tool: string
  args: Record<string, unknown>
  result: string
}

export interface AgentRunResult {
  answer: string
  steps: AgentStep[]
  proposals: ProposedAction[]
}

const SYSTEM = `You are Jnana's note-taking agent, operating over the user's personal knowledge base.
- Use the tools to ground every claim in the user's actual notes — never invent note contents; search and read first.
- IMPORTANT: every time you call a tool, also write one short sentence of reasoning in your reply text saying what you're about to do and why, so the user can follow your thinking. Never call tools silently.
- Writes (create_note, append_to_note, set_note_tags, link_notes) are only *proposed* and require the user's confirmation, so propose genuinely useful changes when appropriate.
- Don't propose creating a note that already exists (search first); prefer linking and reusing existing titles.
- When finished, stop calling tools and give a concise final answer, mentioning any actions you proposed.`

/**
 * Run the agent loop: the model calls tools (read immediately, writes staged as
 * proposals) until it produces a final answer or hits `maxSteps`. Extra tools
 * (e.g. MCP) can be passed in `opts.tools` and are merged with the native set.
 */
export async function runAgent(
  config: AiConfig,
  userText: string,
  history: AgentMessage[],
  notes: Note[],
  opts: { onStep?: (s: AgentStep) => void; maxSteps?: number; extraTools?: AgentTool[]; signal?: AbortSignal } = {},
): Promise<AgentRunResult> {
  const tools = [...NATIVE_TOOLS, ...(opts.extraTools ?? [])]
  const maxSteps = opts.maxSteps ?? 8
  const byName = new Map(tools.map((t) => [t.def.name, t]))
  const toolDefs = tools.map((t) => t.def)

  const proposals: ProposedAction[] = []
  const steps: AgentStep[] = []

  // De-duplicate staged writes so the model can't queue the same change twice.
  const seen = new Set<string>()
  const dedupeKey = (a: ProposedAction): string => {
    switch (a.kind) {
      case 'create':
        return `create:${(a.title ?? '').trim().toLowerCase()}`
      case 'link':
        return `link:${(a.sourceTitle ?? '').toLowerCase()}->${(a.targetTitle ?? '').toLowerCase()}`
      case 'tags':
        return `tags:${a.noteId}`
      case 'append':
        return `append:${a.noteId}:${(a.text ?? '').slice(0, 40)}`
      default:
        return a.id
    }
  }
  const ctx: ToolContext = {
    config,
    notes,
    proposals,
    stage: (a) => {
      const k = dedupeKey(a)
      if (seen.has(k)) return
      seen.add(k)
      proposals.push(a)
    },
  }

  const messages: AgentMessage[] = [
    { role: 'system', content: SYSTEM },
    ...history,
    { role: 'user', content: userText },
  ]

  for (let i = 0; i < maxSteps; i++) {
    if (opts.signal?.aborted) break
    const { content, toolCalls } = await chatWithTools(config, messages, toolDefs)
    if (toolCalls.length === 0) {
      return { answer: content, steps, proposals }
    }
    messages.push({ role: 'assistant', content, toolCalls })
    for (const call of toolCalls) {
      const tool = byName.get(call.name)
      let result: string
      if (!tool) {
        result = `Unknown tool: ${call.name}`
      } else {
        try {
          result = await tool.run(call.args, ctx)
        } catch (e) {
          result = `Tool error: ${e instanceof Error ? e.message : String(e)}`
        }
      }
      const step: AgentStep = { thought: content, tool: call.name, args: call.args, result }
      steps.push(step)
      opts.onStep?.(step)
      messages.push({ role: 'tool', content: result, toolCallId: call.id, name: call.name })
    }
  }

  // Reached the step cap (or aborted) — get a tool-free final answer.
  const final = await chatWithTools(
    config,
    [...messages, { role: 'user', content: 'Stop using tools and give your final answer now.' }],
    [],
  )
  return {
    answer: final.content || '(The agent reached its step limit without a final answer.)',
    steps,
    proposals,
  }
}
