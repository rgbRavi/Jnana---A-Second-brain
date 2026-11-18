---
target: Notes view
total_score: 21
p0_count: 0
p1_count: 5
timestamp: 2026-11-17T10-22-24Z
slug: src-views-notes
---
Method: dual-agent (A: design review · B: detector). Browser overlay skipped: Tauri WebView, and `npm run dev` has no IPC, so the page renders no data. Source-only review; `ss/` is empty, so no screenshots were checked.

## Design Health Score: 21/40 (Acceptable)

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | System status | 3 | Saved pill and filter count work; bulk delete shows no progress and always reports success |
| 2 | Real world | 2 | "Orphan"/"Linked" are jargon; "Cards" vs "Comfortable" unclear; "Back to /graph" shows a raw path (NotesView.tsx:26) |
| 3 | User control | 2 | No undo after delete; the peek ⋮ menu has no Esc or outside-click close (NoteModal.tsx:62) |
| 4 | Consistency | 1 | Four ways to create a note; "Download" named 3 ways; 4 control heights in one toolbar row; favourite and canvas colours swapped |
| 5 | Error prevention | 2 | Linked + Orphan can both be on, which always gives 0 results (filterNotes.ts:146-153); tab-strip + creates empty notes |
| 6 | Recognition | 2 | Multi-select is modifier-only; card actions sit at opacity 0; reading view is buried in ⋮ |
| 7 | Flexibility | 3 | The desk has strong split/drag/shortcut support; the gallery has no keyboard path |
| 8 | Minimalist | 2 | 9 toolbar controls, 10 status chips, glass + gradient modal, permanent green Saved pill |
| 9 | Error recovery | 1 | Raw `{error}` (Notes.tsx:293); `"Export failed: " + String(err)`; false success toast on bulk delete |
| 10 | Help | 2 | Ctrl+\ and Ctrl+Shift+E are never shown in the UI |

## Anti-Patterns Verdict
Partial pass. Working Notes reads as a credible VS Code / Obsidian desk. The gallery and the peek modal carry the tells:
- gradient-text title (NoteModal.module.css:126-133, on the absolute-ban list)
- glass backdrop: blur 12px, saturate 180% (NoteModal.module.css:6)
- resting card shadows built from raw rgba, plus an overshoot lift (NoteItem.module.css:5,12,23)

Detector: 13 findings once CSS modules are passed explicitly (1 in the markup-only run, 0 in layout scope).
- gradient-text ×1 (TP)
- design-system-color ×4: raw rgba shadows (TP)
- design-system-radius ×3: NoteModal 1.5/0.75/0.5rem (TP)
- design-system-font-size ×5 (TP)

Greps added:
- `--border` instead of `--border-control` on the search box, date inputs and modal inputs (NotesToolbar.module.css:31,190; NoteModal.module.css:322,337)
- 33 off-ramp font sizes (0.68-0.88rem drift)
- ad-hoc z-index ladder 1000/1001/1002/2000 (NoteModal, EditorPane:209, WorkingNotes:107)
- `outline:none` with no replacement on .dateInput (NotesToolbar:196)
- literal rgba(224,82,82,.12) on the excluded-tag chip (NotesToolbar:178)
- hard-coded `pulse 2s infinite` (EditorPane:133)

**Global bug found in passing (outside this page; verified):**
- src/main.css:301,303 read `animation-duration: 0.var(--dur-fast)`, which is invalid CSS, so the app's prefers-reduced-motion override does nothing.
- src/main.css:94 `--motion-ease: var(--motion-ease)` refers to itself, and apply.ts never sets it.

## Overall Impression
The desk (Working Notes) is the best-built part of the app. The library (gallery + peek) feels like a different, older, louder product. Biggest opportunity: make the gallery keyboard-reachable and calm it down to the desk's visual system.

## What's Working
- The tab strip: Shift+F10 context menu, the back control inside the strip so nothing shifts, edge-drop split previews, single-tab self-split is a no-op (TabStrip.tsx:252-305).
- The selection bar replaces the count line in place, so the grid never shifts (Notes.module.css:39). Filter state persists per surface, and the button shows "Filters · N".
- Autosave: registerCloseFlush, adopts external changes only while the draft is saved, and toasts on failure (EditorPane.tsx:113-166).

## Priority Issues

**[P1] The gallery can't be used from the keyboard.**
- Cards are a bare `<div onClick>` with no role, no tabIndex and an invalid `aria-selected` (NoteItem.tsx:235-256).
- The hover actions stay at opacity 0 on focus; there is no `:focus-within` rule.
- The hand-rolled Esc (Notes.tsx:207-214) clears the selection even while the delete confirm is open.
- Fix: make the title a real `<button>`; add `:focus-within` to reveal actions; Space toggles selection, Shift+Arrow extends it; replace the hand-rolled Esc with `useEscapeKey`.
- Command: `/impeccable harden`

**[P1] Bulk delete says it succeeded when it didn't.**
- Notes.tsx:189-192 ignores `remove()`'s boolean and any throw, then toasts "Moved N notes to Trash". This breaks the "failed writes must say so" rule.
- Fix: count real successes; toast the partial or failed result and keep the failed notes selected; offer Undo (restore from Trash).
- Command: `/impeccable harden`

**[P1] The reduced-motion override is broken app-wide.**
- `0.var(--dur-fast)` (main.css:301,303) is invalid, so every transition runs at full length for reduced-motion users.
- The recording pulse (EditorPane:133) bypasses `--motion-scale`.
- Fix: `0.01ms !important`; fix the self-referencing `--motion-ease` at main.css:94.
- Command: `/impeccable audit`

**[P1] The peek modal is off-system.**
- 2rem gradient title (DESIGN.md Headline is 1.5rem).
- Glass blur.
- Three button shapes: ⋮ top-left, circular close/expand (border-radius 50%), square icon-only Edit.
- Edit, the primary action, is icon-only.
- The ⋮ menu can't be dismissed; no `role="dialog"` or focus trap.
- Fix: solid `--text-1` title at 1.5rem; one header row with title, text button "Edit in Working Notes", ⋮, ✕, all `--radius-sm` at 32px; reuse ContextMenu; `--scrim` only, `--shadow-xl`.
- Command: `/impeccable quieter`

**[P1] The toolbar row is cluttered and inconsistent.**
- 9 controls with 4 heights.
- `--border` on the search box and buttons beside `--border-control` selects.
- The trash icon sits next to the create buttons and reads as "delete".
- The amber "New canvas" pill competes with "New note", which `margin-left:auto` (NotesToolbar.module.css:95) pushes far right.
- The selects have no Sort/View label.
- Fix: `[Search][Filters][Sort: Updated ▾][↓][View ▾] … [New ▾]`, where New is a split button for Note or Canvas; move Trash to the sidebar; one 2rem height; `--border-control` throughout.
- Command: `/impeccable distill`, then `/impeccable polish`

## Persona Red Flags
- **Alex (power user):** Ctrl-click selects instead of opening in a new tab (goes against Obsidian and browser habits). No search-focus shortcut, no keyboard card navigation, no Ctrl+Tab to cycle tabs. The Ctrl+W listener is global on window (WorkingNotes.tsx:83-102).
- **Sam (keyboard / screen reader):** Cards can't be reached. Splitters are `role="separator"` but can't be focused or resized from the keyboard (SplitContainer.tsx:72-77). The tablist has no arrow-key roving and every tab is a tab stop, with the close button nested inside `role=tab`. Media chips are `aria-label` on plain spans (NoteItem.tsx:323).
- **Student organizing a term:** No folder or course filter or grouping in the gallery. The Date filter checks only `updatedAt` (filterNotes.ts:127), so "notes from week 3" can't be found. "Untagged" counts auto-tags (filterNotes.ts:155-158). The tag chip list is unbounded. The Status chips duplicate auto-tags ("Has images" vs `has:image`).

## Minor Observations
- Grid mode uses CSS `column-width` (Notes.module.css:109-113): items run down each column, so the visual order doesn't match the sort order or the Shift-range selection, and every infinite-scroll page reflows the columns. Use a grid with `auto-fill`.
- The favourite star uses `--accent` with a glow, while the canvas button uses `--star` (Notes.module.css:160-166). That's swapped semantics, and the amber is roughly 3:1 on light themes.
- Media notes turn off the line clamp, so video and PDF embeds render inside cards (NoteItem.module.css:106-115). Long unbroken titles have no `overflow-wrap`.
- "No notes yet." (mono, no call to action) and "No notes match your filters." (no Clear button) don't teach the next step. The empty Working Notes screen has no button.
- "⌘ enter to save" is hardcoded on Windows (NoteItem.tsx:195). "Loading..." uses three ASCII dots.
- Search matches the raw JSON of typed notes (filterNotes.ts:122), so "points" finds every canvas.
- The always-on green Saved pill in every pane (EditorPane.module.css:46-60) is loud for a calm product. The tab close button turns `--danger` on hover, though closing isn't destructive.
- The Working Notes sidebar item hides when no tabs are open (Sidebar.tsx:156).
- The NotesView.tsx:12-16 comment describes a segmented control that no longer exists.
- Sort-order button: title "Ascending" vs aria-label "Toggle sort order".

## Questions to Consider
- If editing lives on the desk, why does a gallery click open a third editor (the peek) rather than the desk?
- Are "Notes" and "Working Notes" really two places? Could the gallery become the desk's list pane, Obsidian-style?
- Does a student need 4 display modes and 10 status chips, or one dense list plus "Group by folder/course"?
