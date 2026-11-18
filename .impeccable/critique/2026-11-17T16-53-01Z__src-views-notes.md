---
target: Notes view
total_score: 26
p0_count: 0
p1_count: 2
timestamp: 2026-11-17T16-53-01Z
slug: src-views-notes
---
Method: dual-agent (A: design review · B: detector). Browser overlay skipped (Tauri WebView, no IPC in `npm run dev`). Source-only review; card layout checked against the user's screenshots.

## Design Health Score: 26/40 (21 → 26 → 25 → 26)

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Status | 3 | Four-state save pill is good; gallery loading is bare "Loading…" text |
| 2 | Real world | 3 | "Working Notes", "Large cards", "Orphan"; Cards vs Grid doesn't say what differs |
| 3 | Control | 3 | Delete confirms and goes to Trash; Reading view only via ⋮ and resets on tab switch |
| 4 | Consistency | 2 | Gallery buttons bordered 2rem vs desk borderless 32px; icons 15/16/18px; three tag-chip styles |
| 5 | Error prevention | 3 | Bulk delete confirms, failures stay selected; hover-only trash next to pencil |
| 6 | Recognition | 2 | Card actions invisible until hover; tags only in the rail; no on-page gallery/desk switch |
| 7 | Flexibility | 3 | Good chords, Space-select and resizable dividers; no keyboard card navigation |
| 8 | Minimalist | 3 | Calm; dense toolbar row; filter chip groups |
| 9 | Error recovery | 2 | Save-failure toast says "we'll keep retrying" but only the next edit retries (EditorPane.tsx:143 vs :252); load error has no retry |
| 10 | Help | 2 | Only hint is "Ctrl-click to select"; Space-to-select never surfaced |

## Anti-Patterns Verdict
**Pass.**

Detector: 0 findings across normal, layout and `--no-config`. No raw colours or z-index literals, no swallowed catches or `String(err)` toasts in the Notes files.

Remaining tells:
- **Peek:** gradient container (NoteModal.module.css:27).
- **Cards:** resting `--shadow-sm` plus a hover lift. DESIGN.md says a card at rest casts no shadow; the user previously chose "keep some character".

Grep true positives, mostly in adjacent shared files:
- 22 off-ramp font sizes in Sidebar.module.css, RightRail.module.css and TagEditor.module.css.
- `--border` used as the stroke on TagEditor, Sidebar collapse/transcribe toggles and RightRail tool buttons.
- The TagEditor input has no visible focus ring (TagEditor.module.css:78, 86).
- The Sidebar transcribe pulse is a literal 1.2s infinite animation (Sidebar.module.css:410).
- Dead `.errorMsg` and `.addBtn` in Notes.module.css.

## Overall Impression
The core is now solid: tokens, saving, keyboard, states. The remaining problems are card layout and mode distinctness, the things that show up in screenshots. Hidden action buttons still take up space, so titles truncate for no visible reason, and the view modes are not distinct enough.

## What's Working
- Token discipline: `--border-control`, `--surface-hover`, `--on-accent`, color-mix washes, 2rem toolbar.
- State coverage: selection ring + live region, sticky bar, failure-aware bulk delete, empty states with next actions.
- Desk keyboard craft: roving tabs, Home/End/Delete, resizable separators with ARIA values.

## Priority Issues

**[P1] Hidden card actions reserve width, so titles truncate at rest (verified)**
- `.noteCardActions` is an in-flow flex row. Its 4 buttons at 28px plus gaps take about 125px at `opacity:0` (NoteItem.module.css:43-48).
- In Grid mode (260px minimum) the title gets about 90px, so every title ends in "…" for no visible reason.
- **Fix:** position the actions as an overlay revealed on hover/focus-within, or collapse them into one ⋮ button. Keep an active favourite star visible. Let titles wrap to 2 lines in grid and large modes.
- **Command:** /impeccable layout

**[P1] View modes still don't look different enough**
- Cards and Grid are the same card at a different column count.
- Compact still renders as a stacked card.
- Full-width Cards on a wide window is a 1200px+ row with two short lines.
- The reviewer suggests an ~820px cap. **That conflicts with the user's explicit feedback** that a capped "Large cards" looked smaller than Cards, so it is not recommended.
- **Fix:** keep full width. Make Compact a true one-line row (title · tags · date). Make Grid cards taller with a fixed preview height so rows are even. Large = 6-line preview (done).
- **Command:** /impeccable layout

**[P2] Save-failure copy over-promises (verified)**
- The toast says "we'll keep retrying" (EditorPane.tsx:143), but retry only happens on the next edit (:252 tooltip).
- **Fix:** a timed retry with backoff (5s, 15s, 60s) plus a clickable "Retry now" on the failed pill, or make the copy honest.
- **Command:** /impeccable harden

**[P2] Desk header controls inconsistent and functions hidden**
- Tools icon 16 vs ⋮ 18; strip buttons 28px vs pane buttons 32px; Read/Edit buried in ⋮; "Tools" says nothing about tags.
- **Fix:** one 32px ghost size and one icon size; a visible Read/Edit toggle; rename to "Tags & tools".
- **Command:** /impeccable polish

**[P3] No on-page link between gallery and desk; weak empty/error text**
- The NotesView comment and src/views/notes/CLAUDE.md describe a segmented control that doesn't exist.
- Empty-desk copy is `--text-3` paragraph text.
- The load error has no retry.
- **Command:** /impeccable clarify

## Persona Red Flags
- **Alex (power user):**
  - no keyboard card navigation
  - 4 tab stops per card
  - selection bar lacks bulk tag/move/favourite
  - no saved filter presets
- **Sam (keyboard / screen reader):**
  - Space-select not surfaced
  - tab close only via `aria-description`
  - no tabpanel
  - tag remove "x" (12px) and tab close (18px) below the 24px target size
  - TagEditor input lacks a focus ring
- **Student organising a term:**
  - no folder/course grouping; tags are the only handle and become a wall at 30+
  - several "Untitled" tabs are indistinguishable
  - flattened previews merge "# Week 3" with its first line

## Minor Observations
- Three tag-chip styles: card mono square, filter pill, TagEditor accent pill.
- Card date uses `toLocaleDateString` but the peek uses `toLocaleString`.
- Uneven card meta spacing.
- `.selectionBtn` 0.8125rem vs `.toolBtn` 0.875rem.
- Image-only and canvas cards look empty next to text cards; no thumbnail for canvas.
- Docs drift in NotesView.tsx and src/views/notes/CLAUDE.md about a segmented control and card-click behaviour.

## Questions to Consider
- Why two surfaces (peek, then desk) before a student can type?
- Are four view modes a need, or a card that can't decide how much content it owes?
- Should tags live in a rail behind "Tools" when they're how a student finds 200 notes?
