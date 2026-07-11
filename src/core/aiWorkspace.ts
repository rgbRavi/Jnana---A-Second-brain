// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// src/core/aiWorkspace.ts
// Styles & Skills ("presets") — reusable instructions that augment the system
// prompt. Backed by the Rust ai_presets table.
import { invoke } from '@tauri-apps/api/core'
import { extractText, getAssetPath } from './media'
import type { AiPreset, AiProject, Note, PresetKind, ProjectKnowledge } from '../types'

const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`

export async function listPresets(kind: PresetKind): Promise<AiPreset[]> {
  return invoke<AiPreset[]>('list_presets', { kind })
}

export async function savePreset(preset: AiPreset): Promise<void> {
  await invoke('save_preset', { preset })
}

export async function deletePreset(id: string): Promise<void> {
  await invoke('delete_preset', { id })
}

/** Build a fresh preset of the given kind, ready to edit. */
export function newPreset(kind: PresetKind): AiPreset {
  const now = Date.now()
  return { id: newId(), kind, name: '', description: '', body: '', createdAt: now, updatedAt: now }
}

const DEFAULT_STYLES: Array<Pick<AiPreset, 'name' | 'description' | 'body'>> = [
  {
    name: 'Concise',
    description: 'Short and direct',
    body: 'Be concise and direct. Prefer short paragraphs and bullet points. Skip preamble and filler; lead with the answer.',
  },
  {
    name: 'Explanatory',
    description: 'Teach it thoroughly',
    body: 'Explain thoroughly and pedagogically. Define key terms, give concrete examples and analogies, and build intuition step by step.',
  },
  {
    name: 'Formal',
    description: 'Professional tone',
    body: 'Use a formal, professional tone. Avoid slang and contractions. Be precise, structured, and objective.',
  },
]

const DEFAULT_SKILLS: Array<Pick<AiPreset, 'name' | 'description' | 'body'>> = [
  {
    name: 'Summarize',
    description: 'Key points + takeaway',
    body: 'Summarize the material into a short list of key points, then a single-line overall takeaway.',
  },
  {
    name: 'Critique',
    description: 'Strengths, gaps, assumptions',
    body: 'Critically evaluate the material: surface its strengths, weaknesses, hidden assumptions, and gaps, then suggest concrete improvements.',
  },
]

/** Seed a kind's built-in presets the first time, if the user has none. */
export async function ensureDefaultPresets(kind: PresetKind): Promise<AiPreset[]> {
  const existing = await listPresets(kind)
  if (existing.length > 0) return existing
  const defaults = kind === 'style' ? DEFAULT_STYLES : DEFAULT_SKILLS
  const now = Date.now()
  for (const d of defaults) {
    await savePreset({ id: newId(), kind, ...d, createdAt: now, updatedAt: now })
  }
  return listPresets(kind)
}

/**
 * Assemble the extra system-prompt text from the selected style + skills.
 * Returns '' when nothing is selected.
 */
export function buildPresetSystem(
  style: AiPreset | undefined,
  skills: AiPreset[],
): string {
  const parts: string[] = []
  if (style?.body.trim()) parts.push(`Response style — ${style.name}:\n${style.body.trim()}`)
  for (const s of skills) {
    if (s.body.trim()) parts.push(`Skill — ${s.name}:\n${s.body.trim()}`)
  }
  return parts.join('\n\n')
}

// ─── Projects + knowledge ───────────────────────────────

export async function listProjects(): Promise<AiProject[]> {
  return invoke<AiProject[]>('list_projects')
}
export async function saveProject(project: AiProject): Promise<void> {
  await invoke('save_project', { project })
}
export async function deleteProject(id: string): Promise<void> {
  await invoke('delete_project', { id })
}
export async function listProjectKnowledge(projectId: string): Promise<ProjectKnowledge[]> {
  return invoke<ProjectKnowledge[]>('list_project_knowledge', { projectId })
}
export async function addProjectKnowledge(item: ProjectKnowledge): Promise<void> {
  await invoke('add_project_knowledge', { item })
}
export async function removeProjectKnowledge(id: string): Promise<void> {
  await invoke('remove_project_knowledge', { id })
}

export function newProject(): AiProject {
  const now = Date.now()
  return { id: newId(), name: '', description: '', instructions: '', createdAt: now, updatedAt: now }
}

export function newKnowledge(projectId: string, kind: 'note' | 'file', refId: string, label: string): ProjectKnowledge {
  return { id: newId(), projectId, kind, refId, label, createdAt: Date.now() }
}

// Extracted file text is cached so a project's file knowledge isn't re-parsed
// (pandoc) on every chat turn.
const fileTextCache = new Map<string, string>()

/**
 * Assemble a project's grounding text: its instructions plus its knowledge base
 * (note contents + extracted file text). Capped so a big knowledge base can't
 * blow the context window.
 */
export async function buildProjectGrounding(
  project: AiProject,
  knowledge: ProjectKnowledge[],
  notes: Note[],
): Promise<string> {
  const MAX_ITEMS = 20
  const MAX_PER_ITEM = 6000
  const MAX_TOTAL = 32000

  const sections: string[] = []
  if (project.instructions.trim()) {
    sections.push(`Project — ${project.name}\nInstructions:\n${project.instructions.trim()}`)
  }

  let total = 0
  const clip = (s: string) => (s.length > MAX_PER_ITEM ? `${s.slice(0, MAX_PER_ITEM)}…` : s)

  for (const k of knowledge.slice(0, MAX_ITEMS)) {
    if (total >= MAX_TOTAL) break
    try {
      if (k.kind === 'note') {
        const note = notes.find((n) => n.id === k.refId)
        if (!note) continue
        const body = clip(note.content.trim())
        sections.push(`Knowledge note — ${note.title || 'Untitled'}:\n${body}`)
        total += body.length
      } else {
        let text = fileTextCache.get(k.refId)
        if (text === undefined) {
          const path = await getAssetPath(k.refId)
          text = (await extractText(path)).trim()
          fileTextCache.set(k.refId, text)
        }
        const body = clip(text)
        sections.push(`Knowledge file — ${k.label || k.refId}:\n${body || '(no extractable text)'}`)
        total += body.length
      }
    } catch {
      /* skip a knowledge item that fails to load */
    }
  }

  if (sections.length === 0) return ''
  return `You are working inside a project. Use the following project context to ground your answers.\n\n${sections.join('\n\n')}`
}
