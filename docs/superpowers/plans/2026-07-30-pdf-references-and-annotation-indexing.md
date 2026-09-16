# PDF reference pins + annotation indexing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user click a spot in a PDF to drop a persistent blue-dot "reference" pin, copy or append a portable `[D0::p<page>@x,y]` reference to a note (rendered as a `📄 p.N` chip that jumps back to the exact point), and make PDF annotation text searchable.

**Architecture:** Reference pins are a new `pdf_ref` annotation kind (no migration — opaque kind/position). The token is a new custom markdown token parsed by both renderers (remark + lezer) via a shared regex source, rendered as a chip that emits a `pdf:open` event to a single global viewer host. Annotation text is folded into the existing `attachment_text` store so the current keyword + RAG indexes ingest it unchanged.

**Tech Stack:** Tauri v2 (Rust) + React 19 + TypeScript + Vite, CodeMirror 6, pdf.js, react-markdown/remark, @lezer/markdown, Vitest.

## Global Constraints

- New first-party `.ts`/`.tsx` files MUST start with the SPDX header: `// SPDX-License-Identifier: AGPL-3.0-only` then `// Copyright (c) 2026 Jnana Project`.
- Strict TS: `noUnusedLocals` + `noUnusedParameters` — unused imports/vars/params are compile errors.
- No native dialogs — use `toast` / `showConfirmDialog` etc. No new runtime dependencies.
- Verify with `npx tsc --noEmit` and `npx vitest run <file>` per task; UI that can't be tested headlessly gets a manual-verification step (ask the user).
- Token index base is **0-based** (`D0` = first `![pdf]` in the note), mirroring `[V0::]`/`[A0::]`. Page is 1-based. Coords are normalized 0–1 of the page.
- Commit after each task. Work on branch `feat/pdf-references` (already created).

---

## Task 1: `listPdfAnnotationText` core helper (annotation indexing)

**Files:**
- Modify: `src/core/annotations.ts`
- Test: `src/core/annotations.test.ts` (create if absent)

**Interfaces:**
- Consumes: `getAnnotationsForNote(noteId): Promise<Annotation[]>` (exists), where `Annotation` has `{ kind: string; content: string; ... }`.
- Produces: `listPdfAnnotationText(noteId: string): Promise<string>` — the concatenated text of a note's `pdf_text` and `pdf_highlight` annotations (their `content`), newline-joined, empty string if none.

- [ ] **Step 1: Write the failing test**

```ts
// src/core/annotations.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockInvoke = vi.fn()
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...a: unknown[]) => mockInvoke(...a) }))
vi.mock('../lib/eventBus', () => ({ eventBus: { emit: vi.fn() } }))

import { listPdfAnnotationText } from './annotations'

describe('listPdfAnnotationText', () => {
  beforeEach(() => mockInvoke.mockReset())

  it('joins pdf_text + pdf_highlight content, skips ink/ref/empty', async () => {
    mockInvoke.mockResolvedValue([
      { id: '1', kind: 'pdf_text', content: 'a typed note' },
      { id: '2', kind: 'pdf_highlight', content: 'highlighted thought' },
      { id: '3', kind: 'pdf_ink', content: '' },
      { id: '4', kind: 'pdf_ref', content: '' },
      { id: '5', kind: 'pdf_text', content: '   ' },
    ])
    expect(await listPdfAnnotationText('n1')).toBe('a typed note\nhighlighted thought')
  })

  it('returns empty string when nothing textual', async () => {
    mockInvoke.mockResolvedValue([{ id: '1', kind: 'pdf_ink', content: '' }])
    expect(await listPdfAnnotationText('n1')).toBe('')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/annotations.test.ts`
Expected: FAIL — `listPdfAnnotationText is not a function`.

- [ ] **Step 3: Implement the helper**

Append to `src/core/annotations.ts`:

```ts
/// Concatenated text of a note's textual PDF annotations (typed text boxes +
/// highlight notes), for folding into the search/RAG index. Ink strokes and
/// reference pins carry no text and are skipped.
export async function listPdfAnnotationText(noteId: string): Promise<string> {
  const annotations = await getAnnotationsForNote(noteId)
  return annotations
    .filter((a) => (a.kind === 'pdf_text' || a.kind === 'pdf_highlight') && a.content.trim())
    .map((a) => a.content.trim())
    .join('\n')
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/core/annotations.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/core/annotations.ts src/core/annotations.test.ts
git commit -m "feat: listPdfAnnotationText — collect textual PDF annotations for indexing"
```

---

## Task 2: `usePdfAnnotationIndex` hook — fold annotation text into the index

**Files:**
- Create: `src/hooks/usePdfAnnotationIndex.ts`
- Modify: `src/AppLayout.tsx` (mount the hook next to `usePdfTextIndex()`)
- Test: `src/hooks/usePdfAnnotationIndex.test.ts`

**Interfaces:**
- Consumes: `listPdfAnnotationText(noteId)` (Task 1); `saveAttachmentText(noteId, filename, text)`; `getAnnotationsForNote`; `eventBus`; annotation events carry a payload from which a `noteId` can be resolved.
- Produces: `usePdfAnnotationIndex(): void` — mounted once; on `annotation:*`, persists the note's annotation text under the reserved pseudo-filename `<annotations>` and re-emits `note:saved`.

**Note on payload shape:** `annotation:created` emits the full `Annotation` (has `noteId`); `annotation:updated`/`annotation:deleted` emit `{ id, ... }` without `noteId`. So this hook resolves the note by reacting to `annotation:created` (which has `noteId`) and, for update/delete, by taking an optional `noteId` if present, else ignoring (a delete/edit still triggers a re-index on the next create or note save — acceptable). To make update/delete reliable, Task 9 will add `noteId` to those emits (see Task 9). For now, guard on `payload.noteId`.

- [ ] **Step 1: Write the failing test**

```ts
// src/hooks/usePdfAnnotationIndex.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

const saveAttachmentText = vi.fn().mockResolvedValue(undefined)
const listPdfAnnotationText = vi.fn()
vi.mock('../core/attachmentText', () => ({ saveAttachmentText }))
vi.mock('../core/annotations', () => ({ listPdfAnnotationText }))

import { eventBus } from '../lib/eventBus'
import { usePdfAnnotationIndex } from './usePdfAnnotationIndex'

describe('usePdfAnnotationIndex', () => {
  beforeEach(() => { saveAttachmentText.mockClear(); listPdfAnnotationText.mockReset() })

  it('persists annotation text + re-emits note:saved on annotation:created', async () => {
    listPdfAnnotationText.mockResolvedValue('note text')
    const emit = vi.spyOn(eventBus, 'emit')
    renderHook(() => usePdfAnnotationIndex())
    eventBus.emit('annotation:created', { id: 'a1', noteId: 'n1', kind: 'pdf_text' })
    await new Promise((r) => setTimeout(r, 0))
    expect(saveAttachmentText).toHaveBeenCalledWith('n1', '<annotations>', 'note text')
    expect(emit).toHaveBeenCalledWith('note:saved', expect.objectContaining({ id: 'n1' }))
  })

  it('ignores events without a noteId', async () => {
    renderHook(() => usePdfAnnotationIndex())
    eventBus.emit('annotation:deleted', { id: 'a1' })
    await new Promise((r) => setTimeout(r, 0))
    expect(saveAttachmentText).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/hooks/usePdfAnnotationIndex.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the hook**

```ts
// src/hooks/usePdfAnnotationIndex.ts
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useEffect } from 'react'
import { eventBus } from '../lib/eventBus'
import { listPdfAnnotationText } from '../core/annotations'
import { saveAttachmentText } from '../core/attachmentText'
import { log } from '../lib/logger'

// Reserved pseudo-filename so annotation text is its own attachment_text row,
// concatenated alongside real PDF body text by fetch_attachment_text_for_note.
const ANNOTATION_KEY = '<annotations>'

/**
 * Folds a note's textual PDF annotations (typed boxes + highlight notes) into
 * the shared `attachment_text` store on any annotation change, then re-emits
 * `note:saved` so the keyword (useSearch) and RAG (useRag) indexes re-ingest —
 * exactly like usePdfTextIndex does for extracted PDF body text. Mounted once
 * (AppLayout). Only listens to annotation:* (never note:saved), so its own
 * re-emit can't loop.
 */
export function usePdfAnnotationIndex(): void {
  useEffect(() => {
    const handler = (payload: unknown) => {
      const noteId = (payload as { noteId?: string })?.noteId
      if (!noteId) return
      void (async () => {
        try {
          const text = await listPdfAnnotationText(noteId)
          await saveAttachmentText(noteId, ANNOTATION_KEY, text)
          eventBus.emit('note:saved', { id: noteId })
        } catch (e) {
          log.error('usePdfAnnotationIndex: failed', e)
        }
      })()
    }
    eventBus.on('annotation:created', handler)
    eventBus.on('annotation:updated', handler)
    eventBus.on('annotation:deleted', handler)
    return () => {
      eventBus.off('annotation:created', handler)
      eventBus.off('annotation:updated', handler)
      eventBus.off('annotation:deleted', handler)
    }
  }, [])
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/hooks/usePdfAnnotationIndex.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Mount in AppLayout**

In `src/AppLayout.tsx`, add the import beside `usePdfTextIndex`:

```ts
import { usePdfAnnotationIndex } from "./hooks/usePdfAnnotationIndex";
```

and call it right after the existing `usePdfTextIndex()` (near line 60):

```ts
    usePdfTextIndex()
    usePdfAnnotationIndex()
```

- [ ] **Step 6: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/hooks/usePdfAnnotationIndex.ts src/hooks/usePdfAnnotationIndex.test.ts src/AppLayout.tsx
git commit -m "feat: index PDF annotation text into keyword + RAG search"
```

> **Note:** `eventBus.emit('note:saved', { id: noteId })` sends a minimal object. Verify the existing `note:saved` consumers used here (`useSearch` `updateIndexedNote`, `usePdfTextIndex`) tolerate a partial note — `useSearch` reads `note.id`/`note.title`/`note.content`. If a fuller note is required, resolve it from `NotesContext` before emitting. Confirm during Step 4/manual test that search picks up an annotation phrase.

---

## Task 3: Doc-reference token regex source

**Files:**
- Modify: `src/core/markdown/tokenPatterns.ts`
- Test: `src/core/markdown/tokenPatterns.test.ts` (create if absent)

**Interfaces:**
- Produces: `DOC_REF_SOURCE: string`, `docRefRegex(): RegExp` (global), `docRefAnchored(): RegExp` (start-anchored). Capture groups: `1`=index, `2`=page, `3`=x, `4`=y. Matches e.g. `[D0::p4@0.42,0.68]`.

- [ ] **Step 1: Write the failing test**

```ts
// src/core/markdown/tokenPatterns.test.ts
import { describe, it, expect } from 'vitest'
import { docRefRegex, docRefAnchored } from './tokenPatterns'

describe('docRef token', () => {
  it('captures index, page, x, y', () => {
    const m = docRefRegex().exec('see [D0::p4@0.42,0.68] here')
    expect(m?.slice(1, 5)).toEqual(['0', '4', '0.42', '0.68'])
  })
  it('anchored matches only at start', () => {
    expect(docRefAnchored().exec('[D2::p1@0,0.5]')?.[2]).toBe('1')
    expect(docRefAnchored().exec('x [D2::p1@0,0.5]')).toBeNull()
  })
  it('rejects malformed', () => {
    expect(docRefRegex().exec('[D0::p4]')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/markdown/tokenPatterns.test.ts`
Expected: FAIL — `docRefRegex` not exported.

- [ ] **Step 3: Add the source + factories**

In `src/core/markdown/tokenPatterns.ts`, after the `SIMPLE_TIMESTAMP_SOURCE` line:

```ts
export const DOC_REF_SOURCE = '\\[D(\\d+)::p(\\d+)@([0-9]*\\.?[0-9]+),([0-9]*\\.?[0-9]+)\\]'
```

Add to the global-factory group:

```ts
export const docRefRegex = (): RegExp => new RegExp(DOC_REF_SOURCE, 'g')
```

Add to the anchored-factory group:

```ts
export const docRefAnchored = (): RegExp => new RegExp('^' + DOC_REF_SOURCE)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/core/markdown/tokenPatterns.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/markdown/tokenPatterns.ts src/core/markdown/tokenPatterns.test.ts
git commit -m "feat: docRef token regex source ([D0::p4@x,y])"
```

---

## Task 4: `pdfRef.ts` pure helpers — build/parse token + resolve nth PDF

**Files:**
- Create: `src/core/markdown/pdfRef.ts`
- Test: `src/core/markdown/pdfRef.test.ts`

**Interfaces:**
- Consumes: `docRefRegex` (Task 3).
- Produces:
  - `buildDocRefToken(index: number, page: number, x: number, y: number): string` → `[D<index>::p<page>@<x>,<y>]` with x/y rounded to 4 decimals.
  - `parseDocRefToken(token: string): { index: number; page: number; x: number; y: number } | null`.
  - `nthPdfFilename(content: string, index: number): string | null` — 0-based nth `![pdf](jnana-asset://…)` filename, or null.

- [ ] **Step 1: Write the failing test**

```ts
// src/core/markdown/pdfRef.test.ts
import { describe, it, expect } from 'vitest'
import { buildDocRefToken, parseDocRefToken, nthPdfFilename } from './pdfRef'

describe('pdfRef', () => {
  it('build → parse round-trips', () => {
    const t = buildDocRefToken(0, 4, 0.4237, 0.6811)
    expect(t).toBe('[D0::p4@0.4237,0.6811]')
    expect(parseDocRefToken(t)).toEqual({ index: 0, page: 4, x: 0.4237, y: 0.6811 })
  })
  it('parse rejects junk', () => {
    expect(parseDocRefToken('[D0::p4]')).toBeNull()
  })
  it('nthPdfFilename 0-based, null out of range', () => {
    const c = 'a ![pdf](jnana-asset://one.pdf) b ![pdf](jnana-asset://two.pdf)'
    expect(nthPdfFilename(c, 0)).toBe('one.pdf')
    expect(nthPdfFilename(c, 1)).toBe('two.pdf')
    expect(nthPdfFilename(c, 2)).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/markdown/pdfRef.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/core/markdown/pdfRef.ts
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { docRefRegex } from './tokenPatterns'

const PDF_EMBED = /!\[pdf\]\(jnana-asset:\/\/([^)]+)\)/g

/** Round to 4 decimals without trailing-zero noise. */
function r4(n: number): number {
  return Math.round(n * 1e4) / 1e4
}

/** `[D<index>::p<page>@<x>,<y>]` — index 0-based, page 1-based, x/y normalized 0–1. */
export function buildDocRefToken(index: number, page: number, x: number, y: number): string {
  return `[D${index}::p${page}@${r4(x)},${r4(y)}]`
}

export function parseDocRefToken(token: string): { index: number; page: number; x: number; y: number } | null {
  const m = docRefRegex().exec(token)
  if (!m) return null
  return { index: Number(m[1]), page: Number(m[2]), x: Number(m[3]), y: Number(m[4]) }
}

/** The 0-based nth `![pdf](jnana-asset://…)` filename in note content, or null. */
export function nthPdfFilename(content: string, index: number): string | null {
  const matches = [...content.matchAll(PDF_EMBED)]
  return matches[index]?.[1] ?? null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/core/markdown/pdfRef.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/markdown/pdfRef.ts src/core/markdown/pdfRef.test.ts
git commit -m "feat: pdfRef token build/parse + nthPdfFilename helpers"
```

---

## Task 5: remarkJnana — `data-pdf-index` on PDFs + `jnana-doc-ref` node

**Files:**
- Modify: `src/core/markdown/remarkJnana.ts`
- Test: `src/core/markdown/remarkJnana.test.ts` (add cases)

**Interfaces:**
- Consumes: `docRefRegex` (Task 3).
- Produces: PDF `![pdf]` image nodes carry `data-pdf-index` (0-based, document order); `[D0::p4@x,y]` text becomes a `jnana-doc-ref` node with hProperties `{ pdfIndex, page, x, y }`.

- [ ] **Step 1: Write the failing test**

Add to `src/core/markdown/remarkJnana.test.ts` (follow the file's existing `parse` helper):

```ts
it('assigns data-pdf-index in document order', () => {
  const tree = parse('![pdf](jnana-asset://a.pdf)\n\n![pdf](jnana-asset://b.pdf)')
  const idxs: unknown[] = []
  visit(tree, 'image', (n: any) => idxs.push(n.data?.hProperties?.['data-pdf-index']))
  expect(idxs).toEqual([0, 1])
})

it('converts [D0::p4@x,y] to a jnana-doc-ref node', () => {
  const tree = parse('ref [D0::p4@0.42,0.68] end')
  let found: any = null
  visit(tree, 'jnana-doc-ref', (n: any) => { found = n })
  expect(found?.data?.hProperties).toEqual({ pdfIndex: 0, page: 4, x: 0.42, y: 0.68 })
})
```

(Ensure `visit` and the `parse` helper are imported/defined as in the existing test file.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/markdown/remarkJnana.test.ts`
Expected: FAIL — no `data-pdf-index`, no `jnana-doc-ref` node.

- [ ] **Step 3: Implement**

In `src/core/markdown/remarkJnana.ts`:

Add the import:

```ts
import { audioTimestampRegex, docRefRegex, simpleTimestampRegex, videoTimestampRegex, wikilinkRegex } from './tokenPatterns'
```

Add a `pdfIndex` counter beside `videoIndex`/`audioIndex`:

```ts
    let videoIndex = 0
    let audioIndex = 0
    let pdfIndex = 0
```

In the `visit(tree, 'image', …)` body, extend the alt branches:

```ts
      if (node.alt === 'video') hProperties['data-video-index'] = videoIndex++
      else if (node.alt === 'audio') hProperties['data-audio-index'] = audioIndex++
      else if (node.alt === 'pdf') hProperties['data-pdf-index'] = pdfIndex++
```

Add a `findAndReplace` entry (after the `simpleTimestampRegex` entry, before the closing `])`):

```ts
      [
        docRefRegex(),
        (_match: string, index: string, page: string, x: string, y: string) =>
          customNode('jnana-doc-ref', {
            pdfIndex: Number(index),
            page: Number(page),
            x: Number(x),
            y: Number(y),
          }),
      ],
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/core/markdown/remarkJnana.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/markdown/remarkJnana.ts src/core/markdown/remarkJnana.test.ts
git commit -m "feat: remarkJnana — data-pdf-index + jnana-doc-ref node"
```

---

## Task 6: lezerJnana — `JnanaDocRef` inline node (edit-mode parse)

**Files:**
- Modify: `src/core/markdown/lezerJnana.ts`
- Test: `src/core/markdown/lezerJnana.test.ts` (add a case, mirroring existing timestamp cases)

**Interfaces:**
- Consumes: `docRefAnchored` (Task 3).
- Produces: a `JnanaDocRef` lezer node spanning `[D0::p4@x,y]`; carries only position (LiveEditor.decorations re-slices + re-matches to recover fields, like timestamps).

- [ ] **Step 1: Write the failing test**

Add to `src/core/markdown/lezerJnana.test.ts` a case asserting the parser marks a `JnanaDocRef` node over the token (mirror the existing `JnanaTimestamp` assertion in that file — reuse its parse/tree-walk helper).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/markdown/lezerJnana.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

In `src/core/markdown/lezerJnana.ts`:

Add import:

```ts
import {
  audioTimestampAnchored,
  docRefAnchored,
  simpleTimestampAnchored,
  videoTimestampAnchored,
  wikilinkAnchored,
} from './tokenPatterns'
```

Extend `defineNodes`:

```ts
  defineNodes: ['JnanaWikilink', 'JnanaTimestamp', 'JnanaDocRef'],
```

In `parse`, before the timestamp loop (order doesn't collide, but keep it explicit), add:

```ts
        const docRef = docRefAnchored().exec(rest)
        if (docRef) return cx.addElement(cx.elt('JnanaDocRef', pos, pos + docRef[0].length))
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/core/markdown/lezerJnana.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/markdown/lezerJnana.ts src/core/markdown/lezerJnana.test.ts
git commit -m "feat: lezerJnana — JnanaDocRef inline node"
```

---

## Task 7: eventBus `pdf:open` + `pdf_ref` annotation kind (data layer)

**Files:**
- Modify: `src/core/annotations.ts` (add `makePdfRefAnnotation`; add `noteId` to update/delete emits)
- Modify: `src/hooks/usePdfAnnotations.ts` (`PdfRef` type, parse branch, `createRef`)
- Modify: `src/lib/eventBus.ts` (doc comment only — bus is stringly-typed, no registry)
- Test: `src/core/annotations.test.ts` (add a `makePdfRefAnnotation` case)

**Interfaces:**
- Produces:
  - `makePdfRefAnnotation(noteId, mediaId, page, x, y): Annotation` — `kind:'pdf_ref'`, `position: {page,x,y}` in PDF points, `content:''`.
  - `usePdfAnnotations(...)` additionally returns `refs: PdfRef[]` and `createRef(x, y): Promise<Annotation>`, where `PdfRef = { id: string; x: number; y: number }`.
  - Event `pdf:open` with payload `{ filename: string; noteId: string; page: number; x: number; y: number }` (x,y normalized 0–1). Consumed in Task 11.
- Consumes: existing `create`/`updatePosition`/`update` from `useAnnotations`.

- [ ] **Step 1: Write the failing test**

Add to `src/core/annotations.test.ts`:

```ts
import { makePdfRefAnnotation } from './annotations'

it('makePdfRefAnnotation stores page/x/y in PDF points, empty content', () => {
  const a = makePdfRefAnnotation('n1', 'm.pdf', 4, 120.5, 300.25)
  expect(a.kind).toBe('pdf_ref')
  expect(a.content).toBe('')
  expect(JSON.parse(a.position)).toEqual({ page: 4, x: 120.5, y: 300.25 })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/core/annotations.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the core helper + reliable emits**

In `src/core/annotations.ts` add:

```ts
/// Helper — build a PDF reference-pin annotation payload.
/// (x, y) is the pinned point in PDF coordinate space; content is unused.
export function makePdfRefAnnotation(
  noteId: string,
  mediaId: string,
  page: number,
  x: number,
  y: number,
): Annotation {
  return {
    id: crypto.randomUUID(),
    noteId,
    mediaId,
    kind: 'pdf_ref',
    position: JSON.stringify({ page, x, y }),
    content: '',
    createdAt: Date.now(),
  }
}
```

To make Task 2's update/delete indexing reliable, thread `noteId` through those emits. Change the signatures:

```ts
export async function updateAnnotation(id: string, content: string, noteId?: string): Promise<void> {
  await invoke<void>('update_annotation', { id, content })
  eventBus.emit('annotation:updated', { id, content, noteId })
}

export async function updateAnnotationPosition(id: string, position: string, noteId?: string): Promise<void> {
  await invoke<void>('update_annotation_position', { id, position })
  eventBus.emit('annotation:updated', { id, position, noteId })
}

export async function deleteAnnotation(id: string, noteId?: string): Promise<void> {
  await invoke<void>('delete_annotation', { id })
  eventBus.emit('annotation:deleted', { id, noteId })
}
```

(These params are optional, so existing callers still compile. `usePdfAnnotations` — the PDF caller — will pass `noteId` in Step 4.)

- [ ] **Step 4: Add `pdf_ref` to `usePdfAnnotations`**

In `src/hooks/usePdfAnnotations.ts`:

Import the new helper:

```ts
import { makePdfAnnotation, makePdfInkAnnotation, makePdfRefAnnotation, makePdfTextAnnotation } from '../core/annotations'
```

Add the type:

```ts
export interface PdfRef {
  id: string
  x: number
  y: number
}
```

In the `useMemo`, add a `refs` array and parse branch:

```ts
    const refs: PdfRef[] = []
    // ... inside the loop, after the pdf_text branch:
      } else if (a.kind === 'pdf_ref' && pos.x != null && pos.y != null) {
        refs.push({ id: a.id, x: pos.x, y: pos.y })
      }
    // ... and return it:
    return { highlights, inks, texts, refs }
```

Add the mutator:

```ts
  const createRef = useCallback(
    async (x: number, y: number) => {
      const annotation = makePdfRefAnnotation(noteId, mediaId, pageNumber, x, y)
      await create(annotation)
      return annotation
    },
    [create, mediaId, noteId, pageNumber],
  )
```

Return `refs` and `createRef` from the hook.

- [ ] **Step 5: Document the event**

In `src/lib/eventBus.ts`, extend the top-of-file comment / (if present) any event doc list to mention `pdf:open { filename, noteId, page, x, y }`. No registry change (stringly-typed).

- [ ] **Step 6: Run test + typecheck**

Run: `npx vitest run src/core/annotations.test.ts && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/core/annotations.ts src/hooks/usePdfAnnotations.ts src/lib/eventBus.ts src/core/annotations.test.ts
git commit -m "feat: pdf_ref annotation kind + createRef + reliable annotation emits"
```

---

## Task 8: `DocRefChip` component + read-mode (MarkdownLite) rendering

**Files:**
- Create: `src/ui/editor/DocRefChip.tsx`
- Modify: `src/ui/editor/MarkdownLite.tsx` (map `jnana-doc-ref` → chip; add a `contentRef`)
- Test: `src/ui/editor/MarkdownLite.test.tsx` (add a render case)

**Interfaces:**
- Consumes: `nthPdfFilename` (Task 4), `eventBus` `pdf:open` (Task 7).
- Produces: `DocRefChip({ pdfIndex, page, x, y, noteId, content }): JSX` — renders `📄 p.<page>`, on click resolves the filename and emits `pdf:open`.

- [ ] **Step 1: Write the failing test**

Add to `src/ui/editor/MarkdownLite.test.tsx`:

```ts
it('renders a doc-ref chip and emits pdf:open on click', async () => {
  const { eventBus } = await import('../../lib/eventBus')
  const emit = vi.spyOn(eventBus, 'emit')
  const content = '![pdf](jnana-asset://a.pdf)\n\nsee [D0::p4@0.42,0.68]'
  const { getByText } = render(<MarkdownLite content={content} noteId="n1" />)
  const chip = getByText('📄 p.4')
  chip.click()
  expect(emit).toHaveBeenCalledWith('pdf:open', {
    filename: 'a.pdf', noteId: 'n1', page: 4, x: 0.42, y: 0.68,
  })
})
```

(Import `vi` if not already imported in that test file.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/ui/editor/MarkdownLite.test.tsx`
Expected: FAIL — chip text not found.

- [ ] **Step 3: Implement the chip**

```tsx
// src/ui/editor/DocRefChip.tsx
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { eventBus } from '../../lib/eventBus'
import { nthPdfFilename } from '../../core/markdown/pdfRef'
import MdStyles from './MarkdownLite.module.css'

/** Inline `📄 p.N` chip for a `[D<n>::p<page>@x,y]` reference. Clicking opens
 *  the note's nth PDF at that page + point via the global pdf:open host. */
export function DocRefChip({
  pdfIndex, page, x, y, noteId, content,
}: {
  pdfIndex: number
  page: number
  x: number
  y: number
  noteId: string
  content: string
}) {
  const onClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    const filename = nthPdfFilename(content, pdfIndex)
    if (!filename) return
    eventBus.emit('pdf:open', { filename, noteId, page, x, y })
  }
  return (
    <button type="button" className={MdStyles.docRefChip} onClick={onClick} title={`Jump to page ${page}`}>
      📄 p.{page}
    </button>
  )
}
```

Add a `.docRefChip` style to `src/ui/editor/MarkdownLite.module.css` mirroring the existing timestamp button chip (reuse the same tokens — `--surface-hover`, `--accent`, `999px` pill, `--space-*` padding; do **not** hardcode colors):

```css
.docRefChip {
  display: inline-flex;
  align-items: center;
  gap: var(--space-3xs);
  padding: 0 var(--space-2xs);
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface-2);
  color: var(--accent);
  font-size: 0.85em;
  cursor: pointer;
}
.docRefChip:hover { background: var(--surface-hover); }
```

- [ ] **Step 4: Wire into MarkdownLite**

In `src/ui/editor/MarkdownLite.tsx`:

Add the import:

```ts
import { DocRefChip } from './DocRefChip'
```

Add a `contentRef` beside the existing `notesRef` (so the memoized `components` map reads live content without a stale closure):

```ts
  const contentRef = useRef(content)
  contentRef.current = content
```

In the `components` memo, add the mapping component (next to `timestamp`):

```tsx
    const docRef = ({ node }: { node?: HastElement }) => {
      const p = hastProperties(node)
      return (
        <DocRefChip
          pdfIndex={Number(p.pdfIndex ?? 0)}
          page={Number(p.page ?? 1)}
          x={Number(p.x ?? 0)}
          y={Number(p.y ?? 0)}
          noteId={noteId}
          content={contentRef.current}
        />
      )
    }
```

and add it to the returned map:

```ts
      'jnana-doc-ref': docRef,
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/ui/editor/MarkdownLite.test.tsx`
Expected: PASS.

- [ ] **Step 6: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/ui/editor/DocRefChip.tsx src/ui/editor/MarkdownLite.tsx src/ui/editor/MarkdownLite.module.css src/ui/editor/MarkdownLite.test.tsx
git commit -m "feat: DocRefChip read-mode render + pdf:open on click"
```

---

## Task 9: Edit-mode (LiveEditor) DocRefChip widget

**Files:**
- Modify: `src/ui/editor/LiveEditor.decorations.tsx`

**Interfaces:**
- Consumes: the `JnanaDocRef` lezer node (Task 6), `parseDocRefToken` (Task 4), `DocRefChip` (Task 8), the `LiveContext` (has `notes` + the note's content/id available; see how the file already reads `contextRef`).
- Produces: a CM6 inline widget replacing a `JnanaDocRef` range with `DocRefChip`, so the token shows as `📄 p.N` in the editor.

- [ ] **Step 1: Find the pattern**

Read how `LiveEditor.decorations.tsx` handles `JnanaTimestamp`: it matches the syntax node name, re-slices the source (`view.state.doc.sliceString(from, to)`), re-matches the anchored regex to recover fields, and builds a `ReactWidget`. Mirror it exactly for `JnanaDocRef`, using `parseDocRefToken(text)` to recover `{ index, page, x, y }`.

- [ ] **Step 2: Implement the widget branch**

In the syntax-tree walk that builds decorations (where `JnanaTimestamp`/`JnanaWikilink` are handled), add:

```tsx
if (node.name === 'JnanaDocRef') {
  const text = view.state.doc.sliceString(node.from, node.to)
  const parsed = parseDocRefToken(text)
  if (parsed) {
    const noteId = context.noteId
    const content = view.state.doc.toString()
    widgets.push(
      Decoration.replace({
        widget: new ReactWidget(
          `docref:${node.from}`,
          <DocRefChip
            pdfIndex={parsed.index}
            page={parsed.page}
            x={parsed.x}
            y={parsed.y}
            noteId={noteId}
            content={content}
          />,
        ),
      }).range(node.from, node.to),
    )
  }
}
```

Adapt names (`widgets`, `ReactWidget`, `context.noteId`, reveal-near-cursor guard) to the file's actual helpers — match how `JnanaTimestamp` is done in the same function, including the "don't replace when the cursor is inside the token" behavior if present.

Add imports at the top:

```ts
import { DocRefChip } from './DocRefChip'
import { parseDocRefToken } from '../../core/markdown/pdfRef'
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual verification (headless can't cover CM6)**

Ask the user: in the live editor, type `[D0::p2@0.5,0.5]` in a note that has a PDF — it should collapse to a `📄 p.2` chip when the cursor leaves it, and clicking it should open the PDF (works fully after Tasks 10–12).

- [ ] **Step 5: Commit**

```bash
git add src/ui/editor/LiveEditor.decorations.tsx
git commit -m "feat: LiveEditor — render DocRefChip widget for JnanaDocRef"
```

---

## Task 10: PdfViewer — `ref` tool, blue-dot pins, capture popover, `onAppendRef`

**Files:**
- Modify: `src/ui/media/PdfViewer.tsx`
- Modify: `src/ui/media/PdfViewer.module.css` (blue dot + popover styles)

**Interfaces:**
- Consumes: `refs` + `createRef` (Task 7), `buildDocRefToken` (Task 4), `deleteAnnotation` or the hook's `remove`.
- Produces: `PdfViewerProps` gains `pdfIndex?: number` (default 0) and `onAppendRef?: (token: string) => void`. A `ref` tool that drops a pin, renders a blue dot, and shows a Copy/Append/Delete popover.

- [ ] **Step 1: Extend props + tool type**

```ts
type Tool = 'select' | 'highlight' | 'pen' | 'eraser' | 'text' | 'ref'
```

```ts
interface PdfViewerProps {
  filename: string
  noteId: string
  pdfIndex?: number
  onRegisterPageSetter?: (setter: (page: number) => void) => void
  onAppendRef?: (token: string) => void
  readOnly?: boolean
}
```

Destructure with defaults: `pdfIndex = 0`, `onAppendRef`.

Pull `refs`, `createRef` from `usePdfAnnotations`.

- [ ] **Step 2: Add pin-capture + popover state**

```ts
const [pinMenu, setPinMenu] = useState<{ left: number; top: number; token: string; id: string } | null>(null)
```

Add a helper that converts a pin to a token using page dimensions (normalize PDF points → 0–1). Get page size from an unscaled viewport:

```ts
const createRefAt = (overlayX: number, overlayY: number) => {
  if (!page) return
  const viewport = page.getViewport({ scale })   // current render viewport
  const [pdfX, pdfY] = viewport.convertToPdfPoint(overlayX, overlayY)
  const unit = page.getViewport({ scale: 1 })     // page size in PDF points
  const nx = pdfX / unit.width
  const ny = pdfY / unit.height
  void createRef(pdfX, pdfY).then((ann) => {
    const token = buildDocRefToken(pdfIndex, pageNumber, nx, ny)
    setTool('select')
    setPinMenu({ left: overlayX, top: overlayY, token, id: ann.id })
  })
}
```

Use the same `viewport`/`scale` accessors the surrounding code already uses (mirror `createTextAt` — it derives `viewport` the same way; reuse that exact expression rather than re-deriving if the file exposes a memoized `viewport`).

In `onPointerDown`, before the other tool branches:

```ts
if (tool === 'ref') { createRefAt(x, y); return }
```

- [ ] **Step 3: Render blue dots + popover**

In the overlay JSX (where `texts.map`/`inks.map` render), add:

```tsx
{refs.map((ref) => {
  const [vx, vy] = viewport.convertToViewportPoint(ref.x, ref.y)
  return (
    <button
      key={ref.id}
      type="button"
      className={styles.refDot}
      style={{ left: vx, top: vy }}
      title="Reference pin"
      onClick={(e) => {
        e.stopPropagation()
        const unit = page!.getViewport({ scale: 1 })
        const token = buildDocRefToken(pdfIndex, pageNumber, ref.x / unit.width, ref.y / unit.height)
        setPinMenu({ left: vx, top: vy, token, id: ref.id })
      }}
    />
  )
})}

{pinMenu && (
  <div className={styles.pinMenu} style={{ left: pinMenu.left, top: pinMenu.top }}>
    <button type="button" onClick={() => { void navigator.clipboard.writeText(pinMenu.token); toast.success('Reference copied'); setPinMenu(null) }}>Copy reference</button>
    {onAppendRef && <button type="button" onClick={() => { onAppendRef(pinMenu.token); toast.success('Appended to note'); setPinMenu(null) }}>Append to note</button>}
    <button type="button" onClick={() => { void remove(pinMenu.id); setPinMenu(null) }}>Delete</button>
  </div>
)}
```

Import `toast` from `../../lib/toast` and `buildDocRefToken` from `../../core/markdown/pdfRef` if not already imported. Guard the whole ref UI on `!readOnly`.

- [ ] **Step 4: Toolbar + context-menu entries**

Add a **Reference** button to the tool row (mirror the existing `text`/`pen` tool buttons; a 📄 or pin icon). Add `{ label: 'Add reference here', onClick: () => setTool('ref') }` to `onOverlayContextMenu`'s items.

- [ ] **Step 5: Styles**

In `src/ui/media/PdfViewer.module.css`:

```css
.refDot {
  position: absolute;
  width: 12px;
  height: 12px;
  margin: -6px 0 0 -6px;      /* center on the point */
  border-radius: 999px;
  background: #2f6fed;         /* fixed reference blue, intentionally not --accent */
  border: 2px solid #fff;
  box-shadow: var(--shadow-sm);
  cursor: pointer;
  padding: 0;
}
.pinMenu {
  position: absolute;
  transform: translateY(8px);
  display: flex;
  flex-direction: column;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  z-index: 5;
}
.pinMenu button { padding: var(--space-2xs) var(--space-sm); text-align: left; background: none; border: none; color: var(--text-1); cursor: pointer; }
.pinMenu button:hover { background: var(--surface-hover); }
```

(The `#2f6fed` blue is a deliberate fixed reference colour — add an `impeccable` ignore only if the user confirms when the design hook flags it.)

- [ ] **Step 6: Typecheck + manual verify**

Run: `npx tsc --noEmit`
Then ask the user to test: open a PDF from a note, pick the Reference tool, click the page → blue dot + popover; Copy puts a token on the clipboard; Delete removes the dot; reopening the PDF shows the dot persisted.

- [ ] **Step 7: Commit**

```bash
git add src/ui/media/PdfViewer.tsx src/ui/media/PdfViewer.module.css
git commit -m "feat: PdfViewer reference tool — blue-dot pins + copy/append/delete"
```

---

## Task 11: PdfViewer reveal-point path + `PdfRefViewerHost` (jump-back)

**Files:**
- Modify: `src/ui/media/PdfViewer.tsx` (add `onRegisterReveal` prop + pulse)
- Create: `src/ui/PdfRefViewerHost.tsx`
- Modify: `src/AppLayout.tsx` (mount the host)
- Modify: `src/ui/media/PdfViewer.module.css` (pulse marker)

**Interfaces:**
- Consumes: `pdf:open { filename, noteId, page, x, y }` (Task 7).
- Produces: `PdfViewer` gains `onRegisterReveal?: (fn: (page: number, x: number, y: number) => void) => void`; the host renders a full-screen `PdfViewer` overlay driven to the page + pulsing point.

- [ ] **Step 1: Add the reveal path to PdfViewer**

Add prop `onRegisterReveal?`. Add state `const [pulse, setPulse] = useState<{ x: number; y: number } | null>(null)` (PDF-point coords). Register a reveal function, symmetric to the page setter:

```ts
useEffect(() => {
  if (!onRegisterReveal) return
  onRegisterReveal((p: number, nx: number, ny: number) => {
    setPageNumber(p)
    if (!page) return
    const unit = page.getViewport({ scale: 1 })
    setPulse({ x: nx * unit.width, y: ny * unit.height })
    setTimeout(() => setPulse(null), 1600)
  })
}, [onRegisterReveal, page])
```

Render the pulse in the overlay (converts PDF point → viewport, like the dots):

```tsx
{pulse && viewport && (() => {
  const [vx, vy] = viewport.convertToViewportPoint(pulse.x, pulse.y)
  return <div className={styles.refPulse} style={{ left: vx, top: vy }} />
})()}
```

Scroll it into view: after setting `pulse`, call `overlayRef.current?.scrollIntoView` on the marker — simplest is to add a short effect that, when `pulse` set and the page canvas is rendered, scrolls the container so the point is centered. A minimal version: `containerRef.current?.scrollTo({ top: vy - containerHeight/2, behavior: 'smooth' })`. Keep it best-effort.

- [ ] **Step 2: Pulse style**

```css
.refPulse {
  position: absolute;
  width: 16px; height: 16px;
  margin: -8px 0 0 -8px;
  border-radius: 999px;
  background: #2f6fed;
  box-shadow: 0 0 0 0 rgba(47,111,237,0.6);
  animation: refPulse 1.4s ease-out 1;
  pointer-events: none;
}
@keyframes refPulse {
  0% { box-shadow: 0 0 0 0 rgba(47,111,237,0.6); }
  100% { box-shadow: 0 0 0 22px rgba(47,111,237,0); }
}
```

(`prefers-reduced-motion` already neutralizes animations globally via `main.css`.)

- [ ] **Step 3: Implement the host**

```tsx
// src/ui/PdfRefViewerHost.tsx
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { eventBus } from '../lib/eventBus'
import { PdfViewer } from './media/PdfViewer'
import MdStyles from './editor/MarkdownLite.module.css'

interface OpenReq { filename: string; noteId: string; page: number; x: number; y: number }

/** Global listener: a DocRefChip's `pdf:open` opens the referenced PDF in a
 *  fullscreen overlay, jumps to the page and pulses the point. Mounted once. */
export function PdfRefViewerHost() {
  const [req, setReq] = useState<OpenReq | null>(null)
  const setPage = useRef<((p: number) => void) | null>(null)
  const reveal = useRef<((p: number, x: number, y: number) => void) | null>(null)

  useEffect(() => {
    const handler = (payload: OpenReq) => setReq(payload)
    eventBus.on('pdf:open', handler)
    return () => eventBus.off('pdf:open', handler)
  }, [])

  useEffect(() => {
    if (!req) return
    // Give the viewer a tick to register its setters + render the page.
    const t = setTimeout(() => {
      reveal.current?.(req.page, req.x, req.y) ?? setPage.current?.(req.page)
    }, 150)
    return () => clearTimeout(t)
  }, [req])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setReq(null) }
    if (req) document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [req])

  if (!req) return null
  return createPortal(
    <div className={MdStyles.fullscreenOverlay} onClick={() => setReq(null)}>
      <div className={MdStyles.fullscreenContent} onClick={(e) => e.stopPropagation()}>
        <button className={MdStyles.fullscreenClose} onClick={() => setReq(null)} aria-label="Close"><X size={18} /></button>
        <PdfViewer
          filename={req.filename}
          noteId={req.noteId}
          onRegisterPageSetter={(fn) => { setPage.current = fn }}
          onRegisterReveal={(fn) => { reveal.current = fn }}
        />
      </div>
    </div>,
    document.body,
  )
}
```

- [ ] **Step 4: Mount the host in AppLayout**

Import and render `<PdfRefViewerHost />` beside `<CommandPalette />` / `<Tooltip />` in both `return (` blocks that render the global overlays (search the file for `<CommandPalette />` and add it adjacent).

- [ ] **Step 5: Typecheck + manual verify**

Run: `npx tsc --noEmit`
Ask the user: click a `📄 p.N` chip in a note → the PDF opens fullscreen, jumps to that page, and a pulse appears at the pinned point; Escape/backdrop closes it.

- [ ] **Step 6: Commit**

```bash
git add src/ui/media/PdfViewer.tsx src/ui/media/PdfViewer.module.css src/ui/PdfRefViewerHost.tsx src/AppLayout.tsx
git commit -m "feat: pdf:open jump-back — global viewer host with page jump + point pulse"
```

---

## Task 12: Wire `pdfIndex` + `onAppendRef` from the embeds

**Files:**
- Modify: `src/ui/editor/NoteEmbeds.tsx` (`PdfEmbed`)
- Modify: `src/ui/editor/MarkdownLite.tsx` (pass `pdfIndex` + read-mode `onAppendRef`)
- Modify: `src/ui/editor/LiveEditor.decorations.tsx` (edit-mode `onAppendRef` via the editor view)
- Modify: `src/ui/editor/LiveEditor.tsx` (expose an insert helper to the decoration context if not already reachable)

**Interfaces:**
- Consumes: `PdfViewer`'s `pdfIndex` + `onAppendRef` (Task 10); `saveNote` for the read-mode append; `LiveEditorHandle.insertAtCursor` for the edit-mode append.
- Produces: `PdfEmbed` gains `pdfIndex?: number` and `onAppendRef?: (token: string) => void`, forwarded to `PdfViewer`.

- [ ] **Step 1: PdfEmbed forwards the new props**

In `src/ui/editor/NoteEmbeds.tsx`, extend `PdfEmbed`'s props with `pdfIndex?: number` and `onAppendRef?: (token: string) => void`, and pass them to `<PdfViewer …>`:

```tsx
<PdfViewer filename={filename} noteId={noteId} pdfIndex={pdfIndex} onAppendRef={onAppendRef} />
```

- [ ] **Step 2: Read-mode wiring (MarkdownLite)**

In `MarkdownLite.tsx`, read `data-pdf-index` and build the read-mode append (append token to the note content + save):

```tsx
if (alt === 'pdf') {
  const pdfIdx = Number(hastProperties(node)['data-pdf-index'] ?? 0)
  const appendRef = (token: string) => {
    const note = notesRef.current.find((n) => n.id === noteId)
    if (!note) return
    void saveNote({ ...note, content: `${note.content}\n${token}` })
  }
  return <PdfEmbed url={url} noteId={noteId} lazy={lazy} layout={layout} preview={preview} pdfIndex={pdfIdx} onAppendRef={appendRef} />
}
```

Import `saveNote` from `../../core/notes`. (`saveNote` emits `note:saved`, so the search index + annotation index refresh.)

- [ ] **Step 3: Edit-mode wiring (LiveEditor decoration widget)**

The editor's `PdfEmbed` widget (in `LiveEditor.decorations.tsx`, ~line 252) should append by inserting at the cursor. Provide an append callback that dispatches into the `EditorView`. The decoration builder has the `view`; pass a callback that calls the same insert path `insertAtCursor` uses (`view.dispatch(view.state.replaceSelection(token))`). Minimal, no LiveContext change needed:

```tsx
{(layout) => (
  <PdfEmbed
    url={this.props.url}
    noteId={this.props.noteId}
    lazy={false}
    layout={layout}
    pdfIndex={this.props.pdfIndex ?? 0}
    onAppendRef={(token) => this.props.view.dispatch(this.props.view.state.replaceSelection(`\n${token}`))}
  />
)}
```

For this you must thread `pdfIndex` and `view` onto the PDF widget's props where the widget is constructed (mirror how `noteId`/`lazy` reach it, and how document-order pdf index is computed in the decoration walk — compute a running pdf counter like remarkJnana does, since the CM6 walk indexes media the same way for `data-media-key`). If wiring `view` into the widget is awkward, fall back to the read-mode append (save via `saveNote`) using the note resolved from `context.notes` — the editor's autosave reconciles on next change. Prefer the cursor insert; use the save fallback only if `view` isn't reachable.

- [ ] **Step 4: Typecheck + manual verify**

Run: `npx tsc --noEmit`
Ask the user to test both: **(a)** in a read-mode note (gallery modal), open PDF → pin → Append → the token appears in the note; **(b)** while editing a note in Working Notes, open its PDF widget → pin → Append → the token lands at the cursor.

- [ ] **Step 5: Commit**

```bash
git add src/ui/editor/NoteEmbeds.tsx src/ui/editor/MarkdownLite.tsx src/ui/editor/LiveEditor.decorations.tsx src/ui/editor/LiveEditor.tsx
git commit -m "feat: thread pdfIndex + onAppendRef through PDF embeds (read + edit)"
```

---

## Task 13: Full-suite verification

**Files:** none (verification only)

- [ ] **Step 1: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 2: Full test suite**

Run: `npm test`
Expected: all green (no regressions; new tests from Tasks 1–8 included).

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: success.

- [ ] **Step 4: Manual end-to-end (ask the user)**

1. Open a note with a PDF; drop a reference pin; **Copy** → paste elsewhere shows `[D0::p<page>@x,y]`.
2. **Append to note** (read + edit contexts) inserts the token; it renders as `📄 p.N`.
3. Click the chip → PDF opens, jumps to the page, pulses the point.
4. Reopen the PDF → the blue dot persisted; **Delete** removes it.
5. Type a note in a PDF text-box annotation → search (keyword + AI) finds that phrase.

- [ ] **Step 5: Commit any final touch-ups, then finish the branch**

Follow `superpowers:finishing-a-development-branch` to merge/PR.

---

## Self-review notes

- **Spec coverage:** §1.1 pdf_ref (T7), §1.2 token (T3/T4), §1.3 render read+edit (T5/T6/T8/T9), §1.4 capture+popover (T10), §1.5 append routing (T12), §1.6 pdf index (T5/T12), §1.7 jump-back host (T11), §1.8 pdf:open (T7); Feature 2 (T1/T2). All covered.
- **Coordinate model:** pins store PDF points (annotation), tokens store normalized 0–1 (build in T10 via `unit = getViewport({scale:1})`; reveal converts back in T11). Consistent.
- **Index base:** 0-based everywhere (`D0`), asserted in T3/T4/T5 tests.
- **Known ceiling:** edit-mode append (T12 Step 3) prefers cursor insert; documented save fallback if `view` threading proves awkward — reviewer should confirm which path shipped.
