## Working Notes (tabs + split-pane editor)

**Status:** planned · replaces the NoteModal-as-editor pattern · pairs with
[folders/vault](plan%20folders%20vault.md) (the folder tree opens notes into Working Notes tabs)

### Why

The `NoteModal` was built as a lightweight *peek*, but it has become the primary editing surface —
and a centered box floating over a visible backdrop is the wrong primitive for sustained writing:
too small, wastes the screen, and the reduced size only makes sense for multitasking (which the
modal can't do — it's one note, blocking, modal). The fix is not "make the modal bigger." It's to
give the Notes view a real **editing desk**: a tabbed, splittable editor surface that owns the whole
content area — the layout Obsidian/VS Code users expect, and the natural place the coming **folder
tree** opens notes into.

Two sub-views live under **Notes** (segmented control at the top of the `/notes` route — *not* a new
sidebar entry):

- **Notes** — the existing browse/gallery (filter, sort, search, cards). The *library*.
- **Working Notes** — a tabbed editor with arbitrary split panes. The *desk*.

Clicking a gallery card (today: opens the modal) **opens the note as a tab in Working Notes** and
switches the segmented control there.

### Design decisions (deliberate — don't drift)

- **The markdown string stays the source of truth.** A tab is just a *view* onto a `Note` already in
  `NotesContext`. Tabs/splits are serializable UI state (note ids + layout), never a second copy of
  note content. This mirrors how canvas/theme treat their payloads as opaque and keep the DB
  authoritative.
- **Recursive layout tree, phased delivery.** The state model supports arbitrary editor groups
  (VS Code / Obsidian: split any pane, drag tabs between groups) *from day one*, but ships in phases —
  single-group tabs → 2-pane split → recursive splits + drag-to-split. Designing the tree up front
  avoids a rewrite; phasing keeps each PR reviewable.
- **The same note opens once.** Opening a note that's already open **focuses its existing tab**
  instead of creating a second editable view of the same document (Obsidian's default). This sidesteps
  the dual-edit / last-write-wins conflict entirely — no shared-doc CRDT needed for v1.
- **The modal survives as a peek, not an editor.** `NoteModal` has **9 consumers** (Home dashboard,
  Search, AI citations, Command palette, Canvas board, Workspace Notes/Dashboard/Insights, and Notes).
  Yanking every one of those into `/notes` would rip users out of Canvas/Search mid-flow. Instead the
  modal becomes **read-focused** with an **"Edit in Working Notes ↗"** button that navigates to
  `/notes` → Working Notes and opens the note as a tab. Editing moves to the desk; the peek stays put.
- **Persist across restart.** Open tabs + the split layout restore on launch (localStorage module
  store, the `useComposerOptions` / `useNotesViewPrefs` pattern). On load, **reconcile against
  `NotesContext`**: drop any tab whose note id no longer exists, prune groups left empty, collapse
  splits with a single surviving child.
- **No `findDOMNode` libraries.** Split dividers and tab drag-and-drop are **hand-rolled pointer
  events**, like `DashboardGrid` and the Canvas board — React 19 breaks `react-resizable` /
  `react-grid-layout` silently. The tab drag-to-split reuses the **quadrant hit-test + drop-bar
  preview** pattern already proven in LiveEditor's media drag (`onMediaDragStart`) and
  `rearrangeMedia`.

### State model — the editor layout tree

```ts
// layout.ts (pure — no React, no IO; the unit-test target)
type PaneNode =
  | { kind: 'split'; id: string; dir: 'row' | 'col'; sizes: number[]; children: PaneNode[] }
  | { kind: 'group'; id: string; tabs: string[]; activeTab: string | null }  // tabs = note ids

interface WorkingLayout {
  root: PaneNode | null      // null = nothing open (empty state)
  activeGroup: string | null // where new tabs land + keyboard targets
}
```

Pure tree operations live in `layout.ts` and are the heavily-tested core (mirror
[filterNotes.test.ts](src/views/notes/filterNotes.test.ts)):

- `openNote(layout, noteId)` — focus if already open anywhere; else append to `activeGroup` (create a
  root group if empty) and activate it.
- `closeTab(layout, groupId, noteId)` — remove; if the group empties, prune it and collapse any split
  left with one child; re-pick `activeGroup`/`activeTab`.
- `splitGroup(layout, groupId, dir, moveNoteId?)` — wrap the group in a split; optionally move a tab
  into the new sibling group.
- `moveTab(layout, noteId, fromGroup, toGroup, index)` — reorder within / move between groups.
- `setActive(layout, groupId, noteId?)`, `reconcile(layout, existingNoteIds)` — drop dead tabs, prune.

Persisted to `localStorage` as `jnana.working.layout.v1` via a module store + `useSyncExternalStore`;
imperative helpers (`openNoteInWorking(id)`, `getLayout`, `setLayout`) so non-React callers
(`note:navigate` handler, gallery card click) can drive it. The active **sub-view**
(`'gallery' | 'working'`) is a separate tiny persisted store (`jnana.notes.subview.v1`).

### Components (all under `src/views/notes/working/`)

| File | Role |
|---|---|
| `layout.ts` / `layout.test.ts` | pure tree ops + types (above) |
| `useWorkingLayout.ts` | module store + persistence + `openNoteInWorking` helper |
| `WorkingNotes.tsx` | renders the layout tree; empty state; keyboard shortcuts |
| `SplitContainer.tsx` | a `split` node: lays out children with a hand-rolled pointer-drag divider (adjusts `sizes`) |
| `EditorGroup.tsx` | a `group` node: `TabStrip` + the active tab's `EditorPane` |
| `TabStrip.tsx` | tabs (title, dirty dot, ✕), overflow, **＋ new note**, **⊟ split**, drag source/target |
| `EditorPane.tsx` | the editing surface for one note — extracted from `NoteModal`'s edit mode |

`EditorPane` is largely a **lift** of `NoteModal`'s edit branch (lines ~146–210): title input, `TagEditor`,
`ComposerSuggestions`, `LiveEditor` + `ComposerToolbar` + `FormatToolbar`, its `useComposer` wiring, and
reading-progress tracking. It gains a per-pane **read/edit toggle** (`MarkdownLite` ↔ `LiveEditor`,
default edit) so a pane can be a reading view — preserving the modal's `setNoteProgress` behavior that
feeds the dashboard's "Continue learning". Saving goes through `NotesContext.update` exactly as today;
**recommended: debounced autosave** per pane (emit `note:saved`), which is the whole point of leaving the
click-Save modal behind — flag as a build-time confirm since it changes save semantics app-wide.

### Wiring (open-a-note routes)

- **Gallery card** (`NoteItem onExpand`) → `openNoteInWorking(id)` + switch sub-view to Working.
- **Wikilink nav** (`eventBus 'note:navigate'`, currently `setExpandedNoteId` in
  [Notes.tsx](src/views/notes/Notes.tsx)) → same helper (+ navigate to `/notes` if elsewhere).
- **Command palette** "open note" → same.
- **Peek modal** everywhere else keeps opening `NoteModal`, now read-focused with **"Edit in Working
  Notes ↗"** → `navigate('/notes')` + `openNoteInWorking(id)` + set sub-view.

### Layering & events

`useWorkingLayout` (module store) → `WorkingNotes` and children in `views/notes/working/`. No Rust, no
new migration — layout is UI state in localStorage (like theme's boot mirror, but localStorage is the
sole store here; notes are the durable data). New bus events (stringly-typed, no registry change) as
needed: `working:opened` (id) for other views to react. The floating `NoteCreator` composer already
shows on `/notes` ([AppLayout.tsx](src/AppLayout.tsx)) — keep it for capture; the tab strip **＋** also
creates a new note and opens it as a tab.

### Roadmap (phased — arbitrary groups is the destination, not phase 1)

**Phase 1 — Foundation & single-group tabs** ✅ done
- [x] `layout.ts` tree model + pure ops + `layout.test.ts` (dedupe-open, close-prunes, reconcile-dead)
- [x] `useWorkingLayout` module store + localStorage persistence + restore-on-launch reconcile
- [x] Segmented **Notes / Working Notes** shell (new `NotesView.tsx`; `/notes` route points at it;
      today's `Notes.tsx` gallery becomes one branch) + persisted sub-view
- [x] `EditorPane` extracted from `NoteModal` edit mode; read/edit toggle; reading-progress preserved
- [x] `TabStrip` + single `EditorGroup`; open/close/reorder/activate tabs; ＋ new note
- [x] Wire gallery card + `note:navigate` (global handler in AppLayout) + command palette → `openNoteInWorking`
- [x] `NoteModal` → read-focused peek + "Edit in Working Notes ↗"; all 9 consumers compile & keep peeking

**Phase 2 — Splits** ✅ done
- [x] Recursive `SplitContainer` rendering of the tree; per-child flex `sizes`
- [x] Hand-rolled pointer-drag divider (Canvas/DashboardGrid pattern); min-size clamps (`MIN_FRACTION`)
- [x] "Split right" / "Split down" actions on a group (tab-strip ⇥/⤓); `activeGroup` focus ring
- [x] **Split moves the active note into the new pane** (not an empty pane); the emptied source pane
      is kept + focused so the next opened/dragged note lands beside it (`splitGroup` in layout.ts)
- [x] **Close pane** (tab-strip ✕, shown when >1 pane) → `closeGroup`; surviving panes auto-rebalance
      sizes (`transform` renormalizes on collapse)
- [x] Empty panes are drop targets (highlight on drag-over); a tab dropped there moves into the pane

**Phase 3 — Drag tabs between groups & split-on-drop**
- [x] Tab drag source/target (reorder within, move between groups) — **pointer events**, not HTML5 DnD
      (the Tauri webview swallows native `draggable`/`onDrop`); `tabDrag.ts` store + `elementFromPoint`
      hit-test + a portaled drag ghost + drop-target pane highlight
- [ ] Edge-quadrant drop on a pane → new split in that direction (reuse media-drag quadrant + drop-bar)
- [x] Empty-group collapse / single-child split flatten on drop (`transform`/`removeGroup` in layout.ts)

**Phase 4 — Polish**
- [x] Keyboard: Ctrl/⌘-W close tab, Ctrl/⌘-\ split (Shift = down). (Ctrl+Tab cycle / Ctrl+1..9 still TODO)
- [ ] Tab overflow menu; [x] middle-click close; [ ] unsaved-dirty guard on close (autosave largely moots it)
- [x] Autosave finalized — **debounced (800 ms) autosave in `EditorPane`**, scoped to Working Notes;
      status pill (Saved / Unsaved / Saving…); flush on tab close/unmount. Same-note-twice is prevented
      by the open-once rule, so no dual-edit conflict.
- [ ] **Folder-tree hook**: [folders/vault](plan%20folders%20vault.md) tree click → `openNoteInWorking`
      (this is the Obsidian front-door — folders + tabs are the two halves of it)

### Remaining (not yet built)
- Edge-quadrant **drop-to-split** (drag a tab onto a pane's edge → new split). Split *buttons* work now.
- Tab **overflow menu** + Ctrl+Tab / Ctrl+1..9 group navigation.
- Folder-tree integration (waits on the folders/vault feature).

### Interactions to keep in mind

- **Folders/Vault** — the folder sidebar tree from [plan folders vault.md](plan%20folders%20vault.md)
  is the natural *source* that opens notes into Working Notes tabs. Build tabs first so the tree has a
  destination; together they are the familiar Obsidian layout that plan is chasing.
- **Same note in two panes** — disallowed in v1 (open focuses the existing tab). If ever allowed,
  panes need a shared editing model, not two `EditorPane` drafts racing on `update`.
- **Workspace Notes tab** ([WorkspaceNotes.tsx](src/views/workspaces/WorkspaceNotes.tsx)) also opens
  `NoteModal` — it inherits the read-focused peek automatically; decide later whether a workspace
  should get its own scoped Working Notes surface or route into the global one.
- **StrictMode double-invoke** — the layout store's subscribe/persist must be idempotent; keep
  reconcile pure and re-runnable.
- **Perf** — an `EditorPane` is a full CM6 `EditorView`; only the *active* tab per group mounts one
  (inactive tabs render nothing), so N open tabs ≠ N editors.
