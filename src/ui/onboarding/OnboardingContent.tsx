// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Onboarding card copy, as data keyed by StepId. Kept apart from the overlay so
// wording changes never touch flow logic.

import type { ReactNode } from 'react'
import type { OnboardingComfort, OnboardingRole, StepId } from '../../core/onboarding/steps'

export interface StepCopy {
  title: string
  body: ReactNode
}

export const ROLE_COPY: Record<OnboardingRole, { label: string; hint: string }> = {
  student: { label: 'Student', hint: 'Lectures, readings, revision, exams' },
  researcher: { label: 'Researcher', hint: 'Papers, PDFs, citations, long projects' },
  professional: { label: 'Professional', hint: 'Meetings, projects, reference material' },
  personal: { label: 'Personal notes', hint: 'Journals, ideas, things worth keeping' },
  exploring: { label: 'Just exploring', hint: "Show me around, I'll decide later" },
}

export const COMFORT_COPY: Record<OnboardingComfort, { label: string; hint: string }> = {
  new: {
    label: 'New to this',
    hint: "I haven't used a note-linking app before — keep it short",
  },
  some: {
    label: "I've used one before",
    hint: 'Notion, Evernote, Apple Notes, something like that',
  },
  power: {
    label: 'Power user',
    hint: 'Obsidian, Logseq, Roam — show me what Jnana does differently',
  },
}

export const STEP_COPY: Record<StepId, StepCopy> = {
  welcome: {
    title: 'Welcome to Jnana',
    body: (
      <>
        <p>
          Jnana is a second brain that lives on <strong>your machine</strong>. Notes, PDFs, audio,
          video and everything you link together stay in a local database — no account, no sync
          server, nothing uploaded.
        </p>
        <p>This takes about two minutes. You can leave at any point.</p>
      </>
    ),
  },
  role: {
    title: 'What will you use Jnana for?',
    body: <p>This only decides which parts of the tour you see. Nothing is locked in.</p>,
  },
  comfort: {
    title: 'Used an app like this before?',
    body: <p>Answer honestly — a shorter tour is better than one that bores you.</p>,
  },
  capture: {
    title: 'Capture anything',
    body: (
      <>
        <p>
          The <strong>"Click to take a note"</strong> bar sits at the bottom of Home and Notes. Type
          there, and it saves as you go.
        </p>
        <p>
          A note isn't only text. Drop in images, PDFs, audio, video, YouTube links or a web page,
          and they render inline — the PDF becomes readable and annotatable, the audio gets a
          player, the web page gets a preview card.
        </p>
      </>
    ),
  },
  links: {
    title: 'Connect notes as you write',
    body: (
      <>
        <p>
          Type <code>[[</code> and pick a note. That's a link — and the other note automatically
          knows it was linked.
        </p>
        <p>
          Link to a note that doesn't exist yet and it shows as a faded node in the{' '}
          <strong>Graph</strong>; click it and the note is created for you. This is how a pile of
          notes turns into something you can navigate.
        </p>
      </>
    ),
  },
  organize: {
    title: 'Where notes live',
    body: (
      <>
        <p>
          <strong>Vaults</strong> are separate worlds — different courses, work vs personal. Switch
          vaults and the whole app follows: notes, graph, search, AI.
        </p>
        <p>
          <strong>Folders</strong> hold a note in exactly one place, like folders anywhere else.{' '}
          <strong>Workspaces</strong> are the opposite: a note can belong to many, so one note can
          sit in "Thesis" and "Week 4" at once without being copied.
        </p>
      </>
    ),
  },
  'study-kit': {
    title: 'Built for studying',
    body: (
      <>
        <p>
          Record or drop in a lecture and Jnana can <strong>transcribe</strong> it in the background,
          splicing the text under the audio so it becomes searchable.
        </p>
        <p>
          Then turn notes into a <strong>graded quiz</strong> — multiple choice, multi-answer or
          written answers, with marks, optional negative marking, and a saved record of the attempt.
          Flashcards with spaced repetition ship as a built-in plugin.
        </p>
      </>
    ),
  },
  'research-kit': {
    title: 'Built for source work',
    body: (
      <>
        <p>
          PDFs open inside Jnana with <strong>highlights, freehand ink and text boxes</strong>. The
          marks are stored separately, so the original file is never modified.
        </p>
        <p>
          The text inside your PDFs is extracted and indexed, so a phrase buried on page 40 of an
          attachment turns up in search — keyword and AI alike.
        </p>
      </>
    ),
  },
  ai: {
    title: 'AI, if you want it',
    body: (
      <>
        <p>
          The AI layer is <strong>off until you turn it on</strong>, and it is grounded in your own
          notes rather than the open internet: ask questions about what you wrote, get tag and link
          suggestions, generate a quiz, analyse a thread.
        </p>
        <p>
          Bring your own provider — an OpenAI-compatible endpoint or a fully local Ollama. Keys are
          stored on your machine and every request is made by the app itself. Settings → AI
          Providers.
        </p>
      </>
    ),
  },
  import: {
    title: 'Bring your notes with you',
    body: (
      <>
        <p>
          Settings → Import / Export takes a folder of <code>.md</code> files (top level) and makes
          each one a note, and can bulk-import documents and media the same way.
        </p>
        <p>
          Export goes the other way — Markdown with front matter, or a full vault archive of the
          database plus every asset. Your notes are never trapped here.
        </p>
      </>
    ),
  },
  'power-tools': {
    title: 'The rest of the workshop',
    body: (
      <>
        <p>
          <strong>Ctrl/⌘-{'`'}</strong> opens the command palette — notes, workspaces, commands.
        </p>
        <p>
          <strong>Canvas</strong> notes are freeform boards with ink, cards and connectors.{' '}
          <strong>Tables</strong> are a real editable grid inside a note, exportable to CSV.{' '}
          <strong>Theme Studio</strong> retokenises the entire interface. And{' '}
          <strong>plugins</strong> can add note types, widgets and commands — several ship built in.
        </p>
      </>
    ),
  },
  finish: {
    title: "That's the tour",
    body: (
      <>
        <p>
          Start with one note. Write what you're working on right now, and link the first idea you
          mention with <code>[[</code>.
        </p>
        <p>
          Everything here is in <strong>Settings</strong>, and you can replay this tour any time
          from Settings → Developer.
        </p>
      </>
    ),
  },
}
