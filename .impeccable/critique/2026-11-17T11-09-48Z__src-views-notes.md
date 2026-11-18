---
target: Notes view
total_score: 26
p0_count: 0
p1_count: 3
timestamp: 2026-11-17T11-09-48Z
slug: src-views-notes
---
Method: dual-agent (A: design review · B: detector). Browser overlay skipped (Tauri WebView, no IPC in `npm run dev`). Source-only review.

## Design Health Score: 26/40 (21 → 26)

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Status | 3 | Favourite toggle fails silently; "Loading…" is text-only |
| 2 | Real world | 3 | "Orphan", "Large cards" vs "Cards", "Note tools" slightly opaque |
| 3 | Control | 3 | Trash reassurance, Esc, Clear all work; the peek adds a step before editing |
| 4 | Consistency | 2 | Three edit models; two menu systems (ContextMenu vs EditorPane's hand-rolled ⋮); icon buttons at 14/28/32/36px |
| 5 | Error prevention | 3 | Card delete is a 14px, 0.5-opacity target next to Edit |
| 6 | Recognition | 2 | Working Notes tools sit behind one collapsed rail icon; read/edit mode is buried in ⋮ |
| 7 | Flexibility | 3 | Ctrl+W, Ctrl+\, Ctrl+Shift+E exist; no select-all, arrow-key card navigation or Ctrl+Tab |
| 8 | Minimalist | 3 | Calm; leftover gradient modal surface and radial pane wash |
| 9 | Error recovery | 2 | EditorPane toasts use raw `String(err)` (338, 362, 399); autosave failure uses console.error (127); list error has no retry |
| 10 | Help | 2 | Gallery empty states teach; the Working Notes desk and its tools are explained nowhere |

## Anti-Patterns Verdict
Mostly not slop: an earned Obsidian/Linear-style product UI.

Remaining decorative tells:
- gradient modal surface (NoteModal.module.css:27)
- radial accent wash on every editor pane (EditorPane.module.css:10)
- resting shadow plus lift on every card (NoteItem.module.css:4, 22). Kept on purpose ("keep some character"), though DESIGN.md says flat-by-default.
- uppercase mono filter-row labels (NotesToolbar.module.css:187)

Detector: 0 findings, with and without config and in layout scope (was 13).

Greps found these true positives:
- `.titleInput:focus{outline:none}` beats the global `:focus-visible`, so the editor title shows no keyboard focus (EditorPane.module.css:35).
- The same problem on the inline card composer (NoteItem.module.css:247, 262).
- A close `<button>` is nested inside `role="tab"` (TabStrip.tsx:110-148).
- A no-op `backdrop-filter` sits on an opaque dropdown (EditorPane.module.css:216).
- Pin/favourite swap their `aria-label` and also set `aria-pressed` (NoteItem.tsx:276, 287).

Low: `.selectionBtn` and `.composerCancel` use `--border` rather than `--border-control`.

## Overall Impression
Real progress. Keyboard access, honest deletes, a calm peek and one toolbar row are now in place. The next problem is structural: three edit models, and Working Notes hides its tools. The user hit this directly: "I can't see a toolbar in Working Notes".

## What's Working
- Selection: pure range maths, a sticky bar, and partial-failure retry that keeps only the failed notes selected.
- Large vaults: paged render that resets only when criteria change, plus `content-visibility`.
- Peek dialog: focus moves in and is restored, Tab is trapped, the backdrop closes only if the press started on it. Empty states teach and offer an action.

## Priority Issues

**[P1] Working Notes tools are hard to find**
- Tags, formatting and media exist only in a collapsed 44px rail icon (RightRail.tsx:39-45).
- The rail can be hidden app-wide, and then only the command palette brings it back.
- The empty desk has no button.
- The Sidebar item appears only once a tab is open (Sidebar.tsx:50).
- Fix: auto-open Note tools the first time a pane mounts with the rail collapsed (store a one-time flag); add a labelled "Tools" button in the pane header; give the empty desk "New note" and "Browse notes" buttons; always show the Working Notes item in the Sidebar.
- Command: `/impeccable onboard`

**[P1] Three competing edit models**
- The card pencil opens an inline editor with an explicit Save and a "⌘ enter" hint that also shows on Windows (NoteItem.tsx:70, 195, 216-219).
- The "read-only" peek can add tags and links.
- Working Notes autosaves.
- Fix: the card pencil emits `note:navigate`; delete `NoteItemEditForm`; decide whether the peek is truly read-only.
- Command: `/impeccable distill`

**[P1] Failed writes are silent or raw**
- The favourite toggle `.catch(() => {})` (Notes.tsx:131, 134).
- The EditorPane favourite has no try/catch.
- `String(err)` toasts in EditorPane.
- Autosave uses console.error.
- Fix: revert the optimistic state, `toast.error` with plain language, `log.error`.
- Command: `/impeccable harden`

**[P2] Toolbar still misaligned**
- The SettingSelect trigger is about 36px tall (min-height 2rem + padding + 1.6 line-height) against 32px controls beside it.
- Loose `--text-3` "Sort"/"View" labels.
- The native WebKit search-cancel glyph and date-picker icons show.
- Fix: fixed `height: 2rem` on the trigger; hide `::-webkit-search-cancel-button` and add a lucide X; style the calendar indicator.
- Command: `/impeccable polish`

**[P2] Working Notes keyboard / screen-reader gaps**
- The tablist has no roving tabindex or arrow keys, and a close button is nested inside each tab.
- The title input is unlabelled, with no focus ring.
- The EditorPane ⋮ menu is a hand-rolled `role="menu"` (no arrow keys, Esc not via `useEscapeKey`).
- Save status and selection count are not live regions.
- Command: `/impeccable audit`

## Persona Red Flags
- **Alex (power user):** no Ctrl+A select-all or bulk tag; each card costs 5 Tab stops; click goes to the peek, so editing takes 2 steps; no Ctrl+Tab or Ctrl+1-9.
- **Sam (keyboard / screen reader):** 14px card action targets; `aria-label` on chip `<span>`s is ignored; truncated card titles have no `title=`, so the full title can't be recovered by hovering.
- **Student organizing a term:** no folder/course filter or group-by; no bulk "Move to folder" or "Add tag"; the tag filter is an unbounded chip wall; cards don't show their folder.

## Minor Observations
- "★ Favourites" uses a text glyph instead of lucide Star (NotesFilterBar.tsx:24).
- `overflow-wrap: anywhere` with `nowrap` does nothing (NoteItem.module.css:81).
- Cards use `--radius-md`; DESIGN.md says `--radius-lg`.
- The editor title is 1.75rem/700 (display is 600).
- 36px header icon buttons jump on hover with translateY.
- "Note content..." uses ASCII dots.
- A video-only card likely shows an empty body gap.
- The NotesView docstring is stale.
- Dead edit-mode CSS in NoteModal.module.css.

## Questions to Consider
- Should a card click go straight to Working Notes, with the peek on Space or a modifier?
- If tags and formatting are per-note tools, why do they live in a global rail that can be hidden?
- For students, should folder/course lead (filter, group-by, bulk move) rather than tags?
